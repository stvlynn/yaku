/** Real Chrome/model fixtures; uses MDN's CC0 flower.webm via YAKU_VIDEO_FIXTURE. */
import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { verifyBackgroundSource } from "./background-identity.mjs";
const profile = process.env.YAKU_MODEL_PROFILE;
if (!profile)
  throw Error(
    "Set YAKU_MODEL_PROFILE to an explicitly prepared model fixture profile.",
  );
const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging", "--remote-debugging-port=0"],
  viewport: { width: 1180, height: 900 },
  acceptDownloads: true,
});
const evidence = { completed: false, errors: [], trustedContexts: [] };
let bridge, original;
const wait = async (predicate, message, timeout = 120000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error(message);
};
try {
  await mkdir(".workspace/qa", { recursive: true });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send("Extensions.loadUnpacked", {
    path: resolve(".output/chrome-mv3"),
  });
  bridge = await context.newPage();
  await bridge.goto(`chrome-extension://${id}/workspace.html`);
  evidence.executedSource = await verifyBackgroundSource(
    profile,
    id,
    resolve(".output/chrome-mv3/background.js"),
  );
  const cache = await bridge.evaluate(() =>
    chrome.runtime.sendMessage({
      destination: "background",
      action: "cache-info",
    }),
  );
  if (!cache.value?.complete) throw Error("Cached real model required");
  evidence.cache = cache.value;
  original = await bridge.evaluate(
    async () => (await chrome.storage.local.get("settings")).settings,
  );
  await bridge.evaluate(
    (settings) =>
      chrome.storage.local.set({
        settings: {
          ...settings,
          sourceLanguage: "en",
          targetLanguage: "zh",
          mode: "bilingual",
          subtitlesEnabled: true,
          autoTranslate: false,
          theme: "light",
        },
      }),
    original,
  );
  const page = await context.newPage();
  let downloadCount = 0;
  page.on("download", () => downloadCount++);
  page.on("pageerror", (error) => evidence.errors.push(String(error)));
  const nonce = crypto.randomUUID();
  const worker = context
    .serviceWorkers()
    .find((worker) => worker.url().startsWith(`chrome-extension://${id}/`));
  const url = `https://www.youtube.com/watch?v=yaku-first&run=${nonce}`;
  const html =
    '<!doctype html><html lang="en"><head><title>Synthetic two-player captions fixture</title><style>body{font:18px Arial}video{width:500px;height:240px;background:#222}pre{white-space:pre-wrap;border:1px solid #ccc;padding:12px}</style></head><body><h1 id="heading">Synthetic two-player native captions fixture</h1><p>Trusted right-click target; registered menu event dispatched via debugger.</p><video id="one" muted controls></video><video id="two" muted controls></video><pre id="evidence"></pre></body></html>';
  await context.route(url, (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto(url);
  await page.bringToFront();
  await page.evaluate(
    async (recording) => {
      window.contextEvents = [];
      document.addEventListener(
        "contextmenu",
        (event) =>
          window.contextEvents.push({
            trusted: event.isTrusted,
            target: event.target.id,
          }),
        true,
      );
      const blob = await (await fetch(recording)).blob();
      window.fixtureBlob = blob;
      await Promise.all(
        [...document.querySelectorAll("video")].map(async (video, index) => {
          video.src = URL.createObjectURL(blob);
          video.loop = true;
          await video.play();
          const track = video.addTextTrack("captions", "English", "en");
          track.addCue(
            new VTTCue(0, 300, index ? "Good morning." : "Hello world."),
          );
          track.mode = "showing";
        }),
      );
    },
    "data:video/webm;base64," +
      (
        await readFile(
          resolve(
            process.env.YAKU_VIDEO_FIXTURE ?? ".workspace/research/flower.webm",
          ),
        )
      ).toString("base64"),
  );
  await wait(
    () =>
      page.evaluate(() =>
        [...document.querySelectorAll("video")].every((video) =>
          /[\u3400-\u9fff]/.test(video.textTracks[0].cues[0].text),
        ),
      ),
    "Initial real native translations failed",
  );
  console.log("TWO PLAYERS TRANSLATED");
  async function dispatch() {
    const current = page.url();
    const tabs = await bridge.evaluate(
      async (url) =>
        (await chrome.tabs.query({})).filter(
          (tab) => tab.url?.split("#")[0] === url.split("#")[0],
        ),
      current,
    );
    if (tabs.length !== 1) throw Error("Ambiguous fixture tab");
    await worker.evaluate(
      (tab) =>
        chrome.contextMenus.onClicked.dispatch(
          { menuItemId: "download-subtitles", frameId: 0, editable: false },
          tab,
        ),
      tabs[0],
    );
  }
  async function select(selector) {
    await page
      .locator(selector)
      .click({ button: "right", position: { x: 180, y: 100 } });
    await page.keyboard.press("Escape");
  }
  async function exported(selector, name) {
    if (selector) await select(selector);
    const pending = page.waitForEvent("download", { timeout: 120000 });
    void pending.catch(() => {});
    await dispatch();
    const download = await pending;
    const text = await readFile(await download.path(), "utf8");
    await download.saveAs(resolve(".workspace/qa", name));
    return text;
  }
  const one = await exported("#one", "scoped-first-player.vtt");
  if (
    !one.includes("Hello world.") ||
    one.includes("Good morning.") ||
    !/[\u3400-\u9fff]/.test(one)
  )
    throw Error("Selected first export mixed player history");
  const two = await exported("#two", "scoped-second-player.vtt");
  if (!two.includes("Good morning.") || two.includes("Hello world."))
    throw Error("Selected second export mixed player history");
  evidence.selectedPlayers = { one, two };
  // Consumed target cannot silently choose the previous player for a later global command.
  const completedDownloads = downloadCount;
  await dispatch();
  await wait(
    () =>
      page
        .getByText("Choose a video before exporting captions.", { exact: true })
        .count(),
    "Consumed context target was reused",
    10000,
  );
  evidence.consumedTargetRefused = true;
  await page.waitForTimeout(800);
  if (downloadCount !== completedDownloads)
    throw Error("Consumed selection produced another export");
  await select("#one");
  await page
    .locator("#heading")
    .click({ button: "right", position: { x: 20, y: 10 } });
  await page.keyboard.press("Escape");
  await dispatch();
  await wait(
    () =>
      page
        .getByText("Choose a video before exporting captions.", { exact: true })
        .count(),
    "Non-video context did not clear target",
    10000,
  );
  evidence.outsideTargetRefused = true;
  await page.waitForTimeout(800);
  if (downloadCount !== completedDownloads)
    throw Error("Outside context silently selected the old video");
  await page.evaluate(() => {
    history.pushState(
      {},
      "",
      location.pathname +
        "?v=yaku-first&t=45&list=playlist&run=" +
        new URL(location.href).searchParams.get("run"),
    );
    const video = document.querySelector("#one");
    video.currentTime = 0.1;
  });
  const afterSeek = await exported("#one", "scoped-same-video-seek.vtt");
  if (afterSeek !== one)
    throw Error("Same video seek/query changed native history");
  evidence.sameVideoRetained = true;
  // Enqueue a source with no previous translation, retire its provider scope before completion.
  await page.evaluate(() => {
    const video = document.querySelector("#one");
    const track = video.textTracks[0];
    for (const cue of [...track.cues]) track.removeCue(cue);
    const retired = new VTTCue(
      0,
      300,
      "The local subtitle translator is preparing a new sentence for the first video.",
    );
    window.retiredCue = retired;
    track.addCue(retired);
    video.dispatchEvent(new Event("timeupdate"));
  });
  await page.waitForTimeout(25);
  await page.evaluate(() => {
    history.pushState(
      {},
      "",
      location.pathname +
        "?v=yaku-second&run=" +
        new URL(location.href).searchParams.get("run"),
    );
    const track = document.querySelector("#one").textTracks[0];
    for (const cue of [...track.cues]) track.removeCue(cue);
    track.addCue(new VTTCue(0, 300, "Goodbye."));
    document.querySelector("#one").dispatchEvent(new Event("timeupdate"));
  });
  await wait(
    () =>
      page.evaluate(() =>
        /[\u3400-\u9fff]/.test(
          document.querySelector("#one").textTracks[0].cues[0].text,
        ),
      ),
    "New provider video translation failed",
  );
  const changed = await exported("#one", "scoped-new-video.vtt");
  if (
    !changed.includes("Goodbye.") ||
    changed.includes("Hello world.") ||
    changed.includes("first video")
  )
    throw Error("Provider navigation retained old history");
  const retired = await page.evaluate(() => window.retiredCue.text);
  if (
    retired !==
    "The local subtitle translator is preparing a new sentence for the first video."
  )
    throw Error("Late translation modified retired native cue");
  evidence.providerSwitch = { captions: changed, retiredCueUnchanged: true };
  evidence.trustedContexts = await page.evaluate(() => window.contextEvents);
  if (
    !evidence.trustedContexts.some(
      (event) => event.trusted && event.target === "one",
    ) ||
    !evidence.trustedContexts.some(
      (event) => event.trusted && event.target === "two",
    )
  )
    throw Error("Pointer context events were not trusted");
  await page
    .locator("#evidence")
    .evaluate(
      (node, text) => (node.textContent = text),
      `Actual second-player VTT:\n${two}\nAfter provider navigation:\n${changed}`,
    );
  await page.screenshot({
    path: ".workspace/qa/scoped-media-real-model.png",
    fullPage: true,
  });
  // Generic source changes are independent of document query/hash navigation.
  const recording = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(window.fixtureBlob);
      }),
  );
  const generic = `https://media-fixture.test/source?run=${nonce}`;
  await context.route(generic, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: html.replace('<video id="two" muted controls></video>', ""),
    }),
  );
  await page.goto(generic);
  await page.evaluate(async (recording) => {
    window.recording = recording;
    const video = document.querySelector("video");
    video.src = recording;
    video.loop = true;
    await video.play();
    const track = video.addTextTrack("captions", "English", "en");
    track.addCue(new VTTCue(0, 300, "Hello world."));
    track.mode = "showing";
  }, recording);
  await wait(
    () =>
      page.evaluate(() =>
        /[\u3400-\u9fff]/.test(
          document.querySelector("video").textTracks[0].cues[0].text,
        ),
      ),
    "Generic first translation failed",
  );
  const initialGeneric = await exported("#one", "scoped-generic-before.vtt");
  await page.evaluate(() => {
    history.pushState(
      {},
      "",
      "?run=" +
        new URL(location.href).searchParams.get("run") +
        "&tab=comments#discussion",
    );
  });
  const queryGeneric = await exported("#one", "scoped-generic-query.vtt");
  if (initialGeneric !== queryGeneric)
    throw Error("Unrelated document URL reset generic media history");
  evidence.genericQueryRetained = true;
  // Use declared real resource URLs, rather than resetting on every document URL.
  await page.evaluate(async () => {
    const video = document.querySelector("video");
    video.src = URL.createObjectURL(
      await (await fetch(window.recording)).blob(),
    );
    await video.play();
    video.dispatchEvent(new Event("timeupdate"));
  });
  const beforeRetiredExport = downloadCount;
  await select("#one");
  await dispatch();
  await wait(
    () =>
      page
        .getByText("No captions have been observed or loaded yet.", {
          exact: true,
        })
        .count(),
    "Unchanged cue was assigned to the new resource",
    10000,
  );
  await page.waitForTimeout(800);
  if (downloadCount !== beforeRetiredExport)
    throw Error("Retired cue was exported for a new resource");
  evidence.unchangedRetiredCueRefused = true;
  await page.evaluate(() => {
    const video = document.querySelector("video");
    const track = video.textTracks[0];
    for (const cue of [...track.cues]) track.removeCue(cue);
    track.addCue(new VTTCue(0, 300, "Thank you."));
    video.dispatchEvent(new Event("timeupdate"));
  });
  await wait(
    () =>
      page.evaluate(() =>
        /[\u3400-\u9fff]/.test(
          document.querySelector("video").textTracks[0].cues[0].text,
        ),
      ),
    "Generic switched-source translation failed",
  );
  const sourceChanged = await exported("#one", "scoped-generic-new-source.vtt");
  if (
    !sourceChanged.includes("Thank you.") ||
    sourceChanged.includes("Hello world.")
  )
    throw Error("Generic source switch mixed history");
  evidence.genericSourceChanged = true;
  evidence.genericCaptions = sourceChanged;
  await page.evaluate(() => {
    const video = document.querySelector("video");
    const cue = video.textTracks[0].cues[0];
    cue.startTime = 0.2;
    cue.endTime = 0.8;
    video.dispatchEvent(new Event("timeupdate"));
  });
  const retimed = await exported("#one", "scoped-generic-retimed.vtt");
  if (
    !retimed.includes("00:00:00.200 --> 00:00:00.800") ||
    retimed.includes("00:05:00.000")
  )
    throw Error("Native retiming merged old timing bounds");
  evidence.retimedCaptions = retimed;
  await page.evaluate(async () => {
    const video = document.querySelector("video");
    video.src = URL.createObjectURL(
      await (await fetch(window.recording)).blob(),
    );
    await video.play();
    video.dispatchEvent(new Event("timeupdate"));
  });
  const beforeReusedExport = downloadCount;
  await select("#one");
  await dispatch();
  await wait(
    () =>
      page
        .getByText("No captions have been observed or loaded yet.", {
          exact: true,
        })
        .count(),
    "Second source did not retire its unchanged cue",
    10000,
  );
  await page.waitForTimeout(800);
  if (downloadCount !== beforeReusedExport)
    throw Error("Unchanged reused cue exported for third resource");
  await page.evaluate(() => {
    const video = document.querySelector("video");
    const cue = video.textTracks[0].cues[0];
    cue.startTime = 0.3;
    cue.endTime = 0.6;
    video.dispatchEvent(new Event("timeupdate"));
  });
  const reused = await exported("#one", "scoped-generic-reused-retimed.vtt");
  if (
    !reused.includes("00:00:00.300 --> 00:00:00.600") ||
    !reused.includes("Thank you.") ||
    !/[\u3400-\u9fff]/.test(reused)
  )
    throw Error(
      "Host-retimed identical cue was not accepted for the new resource",
    );
  evidence.reusedRetimedCaptions = reused;
  await page
    .locator("#evidence")
    .evaluate(
      (node, text) => (node.textContent = text),
      `Actual generic source export:\n${sourceChanged}\nExact native timing after reuse:\n${reused}`,
    );
  await page.screenshot({
    path: ".workspace/qa/scoped-media-generic-real-model.png",
    fullPage: true,
  });
  if (evidence.errors.length) throw Error("Page errors occurred");
  evidence.completed = true;
  console.log(
    "PASS",
    JSON.stringify({
      selectedPlayers: true,
      trustedPointer: true,
      consumedTarget: true,
      sameVideoRetained: true,
      providerSwitch: true,
      genericSourceChanged: true,
      errors: evidence.errors,
    }),
  );
} catch (error) {
  evidence.failure = String(error);
  throw error;
} finally {
  if (bridge && original)
    await bridge
      .evaluate((settings) => chrome.storage.local.set({ settings }), original)
      .catch(() => {});
  await writeFile(
    ".workspace/qa/scoped-media-real-model-result.json",
    JSON.stringify(evidence, null, 2),
  );
  await context.close();
}
