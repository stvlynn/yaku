/** Actual installed native VTT acquisition + HY-MT2; synthetic HTTP player, not provider playback. */
import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { verifyBackgroundSource } from "./background-identity.mjs";
const profile = process.env.YAKU_MODEL_PROFILE;
if (!profile)
  throw Error(
    "Set YAKU_MODEL_PROFILE to a verified cached integration fixture profile.",
  );
const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging", "--remote-debugging-port=0"],
  viewport: { width: 1180, height: 900 },
  acceptDownloads: true,
});
const evidence = { completed: false, errors: [], fetches: [], requests: [] };
let bridge, original;
const wait = async (test, message, timeout = 120000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await test()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error(message);
};
try {
  await mkdir(".workspace/qa", { recursive: true });
  const browser = await context.browser().newBrowserCDPSession();
  const { id } = await browser.send("Extensions.loadUnpacked", {
    path: resolve(".output/chrome-mv3"),
  });
  bridge = await context.newPage();
  await bridge.goto(`chrome-extension://${id}/workspace.html`);
  evidence.background = await verifyBackgroundSource(
    profile,
    id,
    resolve(".output/chrome-mv3/background.js"),
  );
  evidence.cache = await bridge.evaluate(() =>
    chrome.runtime.sendMessage({
      destination: "background",
      action: "cache-info",
    }),
  );
  if (!evidence.cache.value?.complete)
    throw Error("Complete real cached model required");
  original = await bridge.evaluate(
    async () => (await chrome.storage.local.get("settings")).settings,
  );
  await bridge.evaluate(
    (settings) =>
      chrome.storage.local.set({
        settings: {
          ...settings,
          sourceLanguage: "fr",
          targetLanguage: "zh",
          subtitlesEnabled: true,
          autoTranslate: false,
          mode: "bilingual",
          theme: "light",
        },
      }),
    original,
  );
  const nonce = crypto.randomUUID();
  const url = "http://native-track-fixture.test/player?run=" + nonce;
  const en = `http://native-track-fixture.test/en.vtt?run=${nonce}`;
  const fr = `http://native-track-fixture.test/fr.vtt?run=${nonce}`;
  for (const [source, text] of [
    [en, "Hello world."],
    [fr, "Bonjour."],
  ])
    await context.route(source, (route) => {
      evidence.fetches.push(source);
      return route.fulfill({
        contentType: "text/vtt;charset=utf-8",
        body: "WEBVTT\n\n00:00:00.000 --> 00:00:05.000\n" + text + "\n",
      });
    });
  const video =
    "data:video/webm;base64," +
    (
      await readFile(
        process.env.YAKU_VIDEO_FIXTURE ?? ".workspace/research/flower.webm",
      )
    ).toString("base64");
  await context.route(url, (route) =>
    route.fulfill({
      contentType: "text/html;charset=utf-8",
      body: `<!doctype html><html lang="en"><head><title>Synthetic native caption acquisition</title><style>body{font:18px Arial}video{width:900px;height:430px;background:#222}pre{white-space:pre-wrap;border:1px solid #ddd;padding:16px}</style></head><body><h1>Synthetic external VTT player on ordinary HTTP</h1><p>Actual installed extension, native VTT resources and local HY-MT2. Native menu selection is debugger-dispatched.</p><video id="video" controls muted loop preload="metadata" src="${video}"><track id="en" kind="subtitles" src="${en}" srclang="en-US" label="English captions"><track id="fr" kind="captions" src="${fr}" srclang="fr-FR" label="French captions"></video><pre id="result"></pre></body></html>`,
    }),
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => evidence.errors.push(String(error)));
  const cdp = await context.newCDPSession(page);
  const worlds = [];
  cdp.on("Runtime.executionContextCreated", (event) =>
    worlds.push(event.context),
  );
  await cdp.send("Runtime.enable");
  await page.goto(url);
  await page.bringToFront();
  await page.waitForFunction(
    () => document.querySelector("video").readyState >= 1,
  );
  await page.waitForTimeout(300);
  let content;
  for (const world of worlds.filter((world) => !world.auxData?.isDefault)) {
    try {
      const result = await cdp.send("Runtime.evaluate", {
        contextId: world.id,
        expression: "globalThis.chrome?.runtime?.id",
        returnByValue: true,
      });
      if (result.result.value === id) content = world;
    } catch {}
  }
  if (!content) throw Error("No installed content world");
  const evaluate = async (expression) => {
    const result = await cdp.send("Runtime.evaluate", {
      contextId: content.id,
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text,
      );
    return result.result.value;
  };
  evidence.globals = await evaluate(
    "({isSecureContext,randomUUID:typeof crypto.randomUUID,getRandomValues:typeof crypto.getRandomValues})",
  );
  await evaluate(
    `globalThis.__nativeRequests=[];globalThis.__nativeOriginalSend=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=(message,...args)=>{if(message?.destination==='background'&&message.action==='translate')globalThis.__nativeRequests.push(message.payload);return globalThis.__nativeOriginalSend(message,...args)};true`,
  );
  const states = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("track")].map((element) => ({
        id: element.id,
        mode: element.track.mode,
        readyState: element.readyState,
        cues: element.track.cues
          ? [...element.track.cues].map((cue) => cue.text)
          : null,
      })),
    );
  evidence.initial = await states();
  if (
    evidence.fetches.length ||
    evidence.initial.some((track) => track.mode !== "disabled")
  )
    throw Error("No-default tracks were not initially dormant");
  const worker = context
    .serviceWorkers()
    .find((worker) => worker.url().startsWith(`chrome-extension://${id}/`));
  const tabs = await bridge.evaluate((url) => chrome.tabs.query({ url }), url);
  if (tabs.length !== 1) throw Error("Ambiguous fixture tab");
  async function command() {
    await page
      .locator("video")
      .click({ button: "right", position: { x: 180, y: 100 } });
    await page.keyboard.press("Escape");
    await worker.evaluate(
      (tab) =>
        chrome.contextMenus.onClicked.dispatch(
          { menuItemId: "download-subtitles", frameId: 0, editable: false },
          tab,
        ),
      tabs[0],
    );
  }
  async function save(pending, name) {
    const download = await pending;
    const text = await readFile(await download.path(), "utf8");
    await download.saveAs(resolve(".workspace/qa", name));
    if (!/[\u3400-\u9fff]/.test(text))
      throw Error("Export has no actual Chinese model output");
    return text;
  }
  let pending = page.waitForEvent("download", { timeout: 120000 });
  void pending.catch(() => {});
  await command();
  evidence.french = await save(pending, "native-track-french.real-model.vtt");
  if (
    !evidence.french.includes("Bonjour.") ||
    evidence.french.includes("Hello world.")
  )
    throw Error("French acquisition mixed languages");
  evidence.afterFrench = await states();
  if (
    evidence.afterFrench.some((track) => track.mode !== "disabled") ||
    evidence.fetches.includes(en)
  )
    throw Error(
      "French acquisition changed other track or failed to restore mode",
    );
  console.log("FRENCH ACQUIRED/RESTORED");
  await page.evaluate(async () => {
    document.querySelector("#en").track.mode = "showing";
    document.querySelector("#fr").track.mode = "disabled";
    await document.querySelector("video").play();
  });
  await wait(
    () =>
      page.evaluate(() =>
        /[\u3400-\u9fff]/.test(
          document.querySelector("#en").track.cues?.[0]?.text ?? "",
        ),
      ),
    "Native English track did not translate",
  );
  pending = page.waitForEvent("download", { timeout: 120000 });
  void pending.catch(() => {});
  await command();
  evidence.english = await save(pending, "native-track-english.real-model.vtt");
  if (
    !evidence.english.includes("Hello world.") ||
    evidence.english.includes("Bonjour.")
  )
    throw Error("Native English choice mixed French");
  evidence.afterEnglish = await states();
  if (
    evidence.afterEnglish.find((track) => track.id === "en").mode !== "showing"
  )
    throw Error("Existing native choice was changed");
  console.log("NATIVE ENGLISH WINS GLOBAL FR");
  await page.screenshot({
    path: ".workspace/qa/native-track-english-selected-real-model.png",
    fullPage: true,
  });
  await page.evaluate(
    () => (document.querySelector("#fr").track.mode = "showing"),
  );
  pending = page.waitForEvent("download", { timeout: 120000 });
  void pending.catch(() => {});
  await command();
  await page
    .getByRole("dialog", { name: "Choose captions" })
    .waitFor({ timeout: 10000 });
  await page
    .getByRole("button", { name: "French captions", exact: true })
    .click();
  evidence.ambiguous = await save(
    pending,
    "native-track-picked-french.real-model.vtt",
  );
  if (
    !evidence.ambiguous.includes("Bonjour.") ||
    evidence.ambiguous.includes("Hello world.")
  )
    throw Error("Production chooser mixed caption tracks");
  evidence.afterPicker = await states();
  if (evidence.afterPicker.some((track) => track.mode !== "showing"))
    throw Error("Picker overwrote native modes");
  evidence.requests = await evaluate("__nativeRequests");
  if (
    !evidence.requests.some(
      (request) =>
        request.text === "Bonjour." && request.sourceLanguage === "fr",
    ) ||
    !evidence.requests.some(
      (request) =>
        request.text === "Hello world." && request.sourceLanguage === "en",
    )
  )
    throw Error("Declared track languages were not actual source hints");
  if (evidence.requests.some((request) => !/^[0-9a-f]{32}$/.test(request.id)))
    throw Error("HTTP native request ID failed");
  if (evidence.errors.length) throw Error("Page errors occurred");
  await page
    .locator("#result")
    .evaluate(
      (node, text) => (node.textContent = text),
      `Actual French acquisition:\n${evidence.french}\nExisting native English selection:\n${evidence.english}\nAmbiguous track picker:\n${evidence.ambiguous}`,
    );
  await page.screenshot({
    path: ".workspace/qa/native-tracks-real-model.png",
    fullPage: true,
  });
  evidence.completed = true;
  console.log(
    "PASS native VTT acquisition +HYMT2 +production chooser on ordinary HTTP",
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
    ".workspace/qa/native-tracks-real-model.json",
    JSON.stringify(evidence, null, 2),
  );
  await context.close();
}
