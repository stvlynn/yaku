/** Opt-in synthetic reader acceptance; requires the real local model cache. No production-site claim. */
import { verifyBackgroundSource } from "./background-identity.mjs";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { createCanvas } from "@napi-rs/canvas";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  acceptDownloads: true,
  viewport: { width: 1180, height: 860 },
});
const evidence = { errors: [], requests: [], workerEvents: [] };
let bridge, original;
let server;
let html;
const wait = (condition, message, timeout = 120000) =>
  new Promise(async (resolve, reject) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const value = await condition();
        if (value) {
          resolve(value);
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    reject(Error(message));
  });
function png(text, width = 900, height = 180) {
  const canvas = createCanvas(width, height);
  const paint = canvas.getContext("2d");
  paint.fillStyle = "#ffffff";
  paint.fillRect(0, 0, width, height);
  if (text) {
    paint.fillStyle = "#000000";
    paint.font = (width < 300 ? "36" : "52") + "px Arial";
    paint.fillText(text, width < 300 ? 20 : 40, height < 120 ? 65 : 100);
  }
  return canvas.toBuffer("image/png");
}
try {
  await mkdir(".workspace/qa", { recursive: true });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send("Extensions.loadUnpacked", {
    path: resolve(".output/chrome-mv3"),
  });
  bridge = await context.newPage();
  await bridge.goto(`chrome-extension://${id}/workspace.html`);
  const cache = await bridge.evaluate(async () =>
    chrome.runtime.sendMessage({
      destination: "background",
      action: "cache-info",
    }),
  );
  if (!cache.value?.complete) throw Error("Existing real model cache required");
  evidence.cache = cache.value;
  console.log("CACHE READY");
  evidence.executedSource = await verifyBackgroundSource(
    profile,
    id,
    resolve(".output/chrome-mv3/background.js"),
  );
  console.log("EXECUTED SOURCE", evidence.executedSource);
  original = await bridge.evaluate(
    async () => (await chrome.storage.local.get("settings")).settings,
  );
  await bridge.evaluate(
    async (settings) =>
      chrome.storage.local.set({
        settings: {
          ...settings,
          sourceLanguage: "en",
          targetLanguage: "zh",
          mode: "bilingual",
          autoTranslate: false,
          theme: "light",
        },
      }),
    original,
  );
  if (existsSync(".workspace/ocr-data/eng.traineddata.gz"))
    await context.route(
      "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz",
      (route) =>
        route.fulfill({
          path: resolve(".workspace/ocr-data/eng.traineddata.gz"),
          contentType: "application/gzip",
          headers: { "access-control-allow-origin": "*" },
        }),
    );
  const nonce = crypto.randomUUID();
  let url;
  let image;
  const buffers = {
    one: png("HELLO WORLD"),
    two: png("GOOD MORNING"),
    blank: png("", 200, 100),
    small: png("HI", 200, 100),
  };
  server = createServer((request, response) => {
    if (request.url.startsWith("/episode")) {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(html);
      return;
    }
    const name = new URL(request.url, "http://localhost").pathname.slice(1, -4);
    const buffer = buffers[name];
    response.writeHead(buffer ? 200 : 404, {
      "content-type": "image/png",
      "access-control-allow-origin": "*",
    });
    response.end(buffer ?? Buffer.alloc(0));
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  url = `http://127.0.0.1:${port}/episode?run=${nonce}`;
  image = (name) => `http://localhost:${port}/${name}.png?run=${nonce}`;
  context.on("request", (request) => {
    if (
      request.url().startsWith(`http://localhost:${port}/`) ||
      request.url().includes("not-on-page.invalid")
    )
      evidence.requests.push({
        url: request.url(),
        type: request.resourceType(),
      });
  });
  html = `<!doctype html><html><head><style>body{font:18px Arial}img{display:block;max-width:100%;border:1px solid #ddd}.spacer{height:6000px}</style></head><body><main><h1>Synthetic reader: explicit batch, lazy loading and source restoration</h1><picture id="first-picture"><source type="image/png" srcset="${image("one")}"><img id="one" alt="First fixture" width="900" height="180" src="${image("one")}" srcset="${image("one")} 1x" sizes="900px"></picture><div class="spacer"></div><img id="two" alt="Lazy fixture" width="900" height="180" loading="lazy" src="${image("two")}"><div id="more"></div></main></body></html>`;
  const page = await context.newPage();
  page.on("pageerror", (error) => evidence.errors.push(String(error)));
  page.on("requestfailed", (r) =>
    console.log("FAILREQUEST", r.url(), r.failure()),
  );
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE", m.text());
  });
  await page.goto(url);
  await page.locator("#one").evaluate((image) => image.decode());
  const initial = await page.evaluate(() => ({
    picture: document.querySelector("#first-picture").outerHTML,
    two: document.querySelector("#two").outerHTML,
  }));
  if (await page.locator("[data-yaku-image-batch]").count())
    throw Error("Batch started without user action");
  if (evidence.requests.some((request) => request.type === "fetch"))
    throw Error("Image fetch occurred before explicit batch start");
  const tabs = await bridge.evaluate(
    async (url) => chrome.tabs.query({ url }),
    url,
  );
  if (tabs.length !== 1) throw Error("Ambiguous reader fixture tab");
  const tab = tabs[0];
  const worker = context
    .serviceWorkers()
    .find((worker) => worker.url().startsWith(`chrome-extension://${id}/`));
  await worker.evaluate(
    (tab) =>
      chrome.contextMenus.onClicked.dispatch(
        { menuItemId: "translate-page-images", frameId: 0, editable: false },
        tab,
      ),
    tab,
  );
  await wait(
    () => page.locator("[data-yaku-image-batch]").count(),
    "No reader progress panel",
    10000,
  );
  const panel = page.locator("[data-yaku-image-batch]");
  const status = () => panel.getByRole("status").innerText();
  await wait(async () => {
    const text = await status();
    if (await panel.getByRole("alert").count())
      throw Error(await panel.getByRole("alert").innerText());
    return text.startsWith("1 translated") && text.includes("0 queued");
  }, "First image did not translate");
  await page.locator("#one").evaluate((image) => image.decode());
  evidence.firstStatus = await status();
  console.log("FIRST", evidence.firstStatus);
  if ((await page.locator("#two").getAttribute("src")).startsWith("data:"))
    throw Error("Offscreen lazy page translated too early");
  await page.screenshot({
    path: ".workspace/qa/reader-first-translated.png",
    fullPage: false,
  });
  const grants = await bridge.evaluate(async (tabId) => {
    const values = await chrome.storage.session.get(null);
    return Object.entries(values)
      .filter(
        ([key, value]) => key.startsWith("imageBatch:") && value.tab === tabId,
      )
      .map(([key, value]) => ({
        sessionId: key.slice("imageBatch:".length),
        ...value,
      }));
  }, tab.id);
  if (grants.length !== 1) throw Error("Expected one explicit batch grant");
  const sessionId = grants[0].sessionId;
  evidence.grant = { tab: tab.id, frame: grants[0].frame };
  const deniedUrl = "https://not-on-page.invalid/private.png";
  const denied = await bridge.evaluate(
    async ({ tabId, sessionId, url }) =>
      chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        args: [sessionId, url],
        func: async (sessionId, url) =>
          chrome.runtime.sendMessage({
            destination: "background",
            action: "translate-batch-image",
            payload: { sessionId, id: crypto.randomUUID(), url },
          }),
      }),
    { tabId: tab.id, sessionId, url: deniedUrl },
  );
  if (
    denied[0].result?.ok !== false ||
    evidence.requests.some((request) => request.url === deniedUrl)
  )
    throw Error("Unauthorized URL proxy was not refused");
  evidence.denied = denied[0].result;
  const sw = await context.newCDPSession(bridge);
  const versions = [];
  sw.on("ServiceWorker.workerVersionUpdated", (event) => {
    versions.push(...event.versions);
    evidence.workerEvents.push(
      ...event.versions.map((version) => ({
        versionId: version.versionId,
        runningStatus: version.runningStatus,
        scriptURL: version.scriptURL,
      })),
    );
  });
  await sw.send("ServiceWorker.enable");
  const version = await wait(
    () =>
      versions.find(
        (version) =>
          version.scriptURL === `chrome-extension://${id}/background.js` &&
          version.runningStatus === "running",
      ),
    "No background worker version",
    5000,
  );
  await sw.send("ServiceWorker.stopWorker", { versionId: version.versionId });
  await wait(
    () =>
      evidence.workerEvents.some(
        (event) =>
          event.versionId === version.versionId &&
          event.runningStatus === "stopped",
      ),
    "Worker did not stop",
    5000,
  );
  console.log("BACKGROUND STOPPED");
  const persisted = await bridge.evaluate(
    async (key) => (await chrome.storage.session.get(key))[key],
    `imageBatch:${sessionId}`,
  );
  if (!persisted)
    throw Error("Batch authorization did not survive worker stop");
  await page.locator("#two").scrollIntoViewIfNeeded();
  await page.locator("#two").evaluate((image) => image.decode());
  await wait(async () => {
    const text = await status();
    if (await panel.getByRole("alert").count())
      throw Error(await panel.getByRole("alert").innerText());
    return text.startsWith("2 translated") && text.includes("0 queued");
  }, "Lazy page did not translate after worker restart");
  await page.locator("#two").evaluate((image) => image.decode());
  evidence.afterRestart = await status();
  console.log("LAZY AFTER RESTART", evidence.afterRestart);
  const added = await page.evaluate(
    (urls) => {
      const root = document.querySelector("#more");
      const snapshots = {};
      for (const [id, url] of Object.entries(urls)) {
        const image = document.createElement("img");
        image.id = id;
        image.src = url;
        image.width = 200;
        image.height = 100;
        image.alt = id + " fixture";
        root.append(image);
        snapshots[id] = image.outerHTML;
      }
      return snapshots;
    },
    { blank: image("blank"), small: image("small") },
  );
  await wait(async () => {
    const text = await status();
    if (await panel.getByRole("alert").count())
      throw Error(await panel.getByRole("alert").innerText());
    return (
      text.startsWith("3 translated") &&
      text.includes("0 queued") &&
      text.includes("1 without text")
    );
  }, "Dynamic small image or blank-skip failed");
  await page.locator("#small").evaluate((image) => image.decode());
  evidence.finalStatus = await status();
  evidence.sizes = await page.evaluate(() =>
    ["one", "two", "small"].map((id) => {
      const image = document.getElementById(id);
      return {
        id,
        width: image.naturalWidth,
        height: image.naturalHeight,
        translated: image.src.startsWith("data:image/png"),
      };
    }),
  );
  if (
    evidence.sizes.some((image) => !image.translated) ||
    evidence.sizes.find((image) => image.id === "small").width !== 200
  )
    throw Error("Translated image decoding/dimensions failed");
  await page.screenshot({
    path: ".workspace/qa/reader-lazy-restart-translated.png",
    fullPage: false,
  });
  for (const name of ["one", "two", "small"]) {
    const source = await page.locator("#" + name).getAttribute("src");
    await writeFile(
      resolve(".workspace/qa", `reader-${name}.translated.png`),
      Buffer.from(source.split(",")[1], "base64"),
    );
  }
  await panel
    .getByRole("button", { name: "Restore images", exact: true })
    .click();
  await wait(
    async () => (await page.locator("[data-yaku-image-batch]").count()) === 0,
    "Reader panel not removed",
    5000,
  );
  const restored = await page.evaluate(() => ({
    picture: document.querySelector("#first-picture").outerHTML,
    two: document.querySelector("#two").outerHTML,
    blank: document.querySelector("#blank").outerHTML,
    small: document.querySelector("#small").outerHTML,
  }));
  if (
    restored.picture !== initial.picture ||
    restored.two !== initial.two ||
    restored.blank !== added.blank ||
    restored.small !== added.small
  )
    throw Error("Reader restoration changed source attributes");
  await wait(
    async () =>
      !(await bridge.evaluate(
        async (key) => (await chrome.storage.session.get(key))[key],
        `imageBatch:${sessionId}`,
      )),
    "Batch authorization not revoked",
    5000,
  );
  evidence.restored = true;
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.querySelectorAll("main img")).map((image) =>
        image.decode(),
      ),
    ),
  );
  await page.screenshot({
    path: ".workspace/qa/reader-restored.png",
    fullPage: false,
  });
  if (evidence.errors.length) throw Error("Page errors occurred");
  console.log(
    "PASS",
    JSON.stringify(
      {
        status: evidence.finalStatus,
        restored: evidence.restored,
        workerRestart: evidence.workerEvents.map(
          (event) => event.runningStatus,
        ),
        errors: evidence.errors,
      },
      null,
      2,
    ),
  );
} finally {
  if (bridge && original)
    await bridge
      .evaluate(
        async (settings) => chrome.storage.local.set({ settings }),
        original,
      )
      .catch(() => {});
  await writeFile(
    ".workspace/qa/reader-batch-real-model-result.json",
    JSON.stringify(evidence, null, 2),
  );
  await context.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}
