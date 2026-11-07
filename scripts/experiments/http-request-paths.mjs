/** Installed HTTP request-start regression; controlled replies isolate ID creation, not model quality. */
import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { verifyBackgroundSource } from "./background-identity.mjs";
const profile = resolve(
  ".workspace/research/http-paths-profile-" + crypto.randomUUID(),
);
const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging", "--remote-debugging-port=0"],
});
const evidence = {
  completed: false,
  controlledTranslation: true,
  errors: [],
  requests: [],
};
try {
  const browser = await context.browser().newBrowserCDPSession();
  const { id } = await browser.send("Extensions.loadUnpacked", {
    path: resolve(".output/chrome-mv3"),
  });
  const bridge = await context.newPage();
  await bridge.goto(`chrome-extension://${id}/workspace.html`);
  evidence.background = await verifyBackgroundSource(
    profile,
    id,
    resolve(".output/chrome-mv3/background.js"),
  );
  await bridge.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      settings: {
        ...settings,
        sourceLanguage: "en",
        targetLanguage: "zh",
        subtitlesEnabled: true,
        selectionEnabled: true,
        inputEnabled: true,
        autoTranslate: false,
        showFloatingButton: true,
      },
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => evidence.errors.push(String(error)));
  const cdp = await context.newCDPSession(page);
  const worlds = [];
  cdp.on("Runtime.executionContextCreated", (event) =>
    worlds.push(event.context),
  );
  await cdp.send("Runtime.enable");
  const url =
    "http://ordinary-http-fixture.test/request-paths?run=" +
    crypto.randomUUID();
  await context.route(url, (route) =>
    route.fulfill({
      contentType: "text/html;charset=utf-8",
      body: '<!doctype html><html lang="en"><head><title>HTTP request ID fixture</title></head><body><main><h1>HTTP content request paths</h1><p id="selection">Selection request from ordinary HTTP.</p><p id="body">Page request from ordinary HTTP. This example contains an English reading paragraph for the local translation controller, with familiar words and complete sentences. It verifies request creation on an ordinary insecure origin without sending the text to a model or cloud service.</p><textarea id="editor"></textarea><video id="video" controls></video></main></body></html>',
    }),
  );
  await page.goto(url);
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
  if (!content) throw Error("No actual installed content context");
  const evaluate = async (expression) => {
    const result = await cdp.send("Runtime.evaluate", {
      contextId: content.id,
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw Error(
        result.exceptionDetails.text +
          ":" +
          result.exceptionDetails.exception?.description,
      );
    return result.result.value;
  };
  evidence.globals = await evaluate(
    "({isSecureContext,randomUUID:typeof crypto.randomUUID,getRandomValues:typeof crypto.getRandomValues,extensionId:chrome.runtime.id})",
  );
  if (
    evidence.globals.isSecureContext ||
    evidence.globals.randomUUID !== "undefined"
  )
    throw Error("Fixture is not an ordinary insecure content context");
  await evaluate(
    `globalThis.__httpRequests=[];globalThis.__httpOriginalSend=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async(message,...rest)=>{if(message?.destination==='background'&&message.action==='translate'){globalThis.__httpRequests.push(message.payload);return{ok:true,value:{id:message.payload.id,text:message.payload.text,elapsedMs:0}}}return globalThis.__httpOriginalSend(message,...rest)};true`,
  );
  const worker = context
    .serviceWorkers()
    .find((worker) =>
      worker.url().startsWith("chrome-extension://" + id + "/"),
    );
  const tabs = await bridge.evaluate((url) => chrome.tabs.query({ url }), url);
  if (tabs.length !== 1) throw Error("Ambiguous HTTP fixture tab");
  const dispatch = (menuItemId) =>
    worker.evaluate(
      ({ tab, menuItemId }) =>
        chrome.contextMenus.onClicked.dispatch(
          { menuItemId, frameId: 0, editable: false },
          tab,
        ),
      { tab: tabs[0], menuItemId },
    );
  await page.locator("#selection").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await dispatch("translate-selection");
  await page.waitForTimeout(200);
  evidence.selection = await evaluate(
    '__httpRequests.filter(request=>request.text.includes("Selection request"))',
  );
  if (!evidence.selection.length)
    throw Error("Context selection did not emit a request");
  await page.locator("#editor").fill("Input request from ordinary HTTP.");
  await dispatch("translate-input");
  await page.waitForTimeout(200);
  evidence.input = await evaluate(
    '__httpRequests.filter(request=>request.text.includes("Input request"))',
  );
  if (!evidence.input.length)
    throw Error("Context input did not emit a request");
  await page.evaluate(() => getSelection().removeAllRanges());
  await dispatch("toggle-page");
  await page.waitForTimeout(500);
  evidence.page = await evaluate(
    '__httpRequests.filter(request=>request.text.includes("Page request"))',
  );
  if (!evidence.page.length)
    throw Error("Page translation did not emit a request");
  await page.evaluate(() => {
    const video = document.querySelector("#video");
    const track = video.addTextTrack("captions", "English", "en");
    track.addCue(
      new VTTCue(0, 5, "Native caption request from ordinary HTTP."),
    );
    track.mode = "showing";
  });
  await page.waitForTimeout(300);
  evidence.native = await evaluate(
    '__httpRequests.filter(request=>request.text.includes("Native caption request"))',
  );
  if (!evidence.native.length)
    throw Error("Native captions did not emit a request");
  evidence.requests = await evaluate("__httpRequests");
  const ids = evidence.requests.map((request) => request.id);
  if (
    ids.some((id) => !/^[0-9a-f]{32}$/.test(id)) ||
    new Set(ids).size !== ids.length
  )
    throw Error("Request IDs are not unique opaque CSPRNG hex");
  if (evidence.errors.length) throw Error("Page exceptions occurred");
  evidence.completed = true;
  console.log(
    JSON.stringify(
      {
        completed: true,
        globals: evidence.globals,
        paths: {
          selection: evidence.selection.length,
          input: evidence.input.length,
          page: evidence.page.length,
          native: evidence.native.length,
        },
        ids,
        errors: evidence.errors,
      },
      null,
      2,
    ),
  );
} catch (error) {
  evidence.failure = String(error);
  throw error;
} finally {
  await mkdir(".workspace/qa", { recursive: true });
  await writeFile(
    ".workspace/qa/http-request-paths.json",
    JSON.stringify(evidence, null, 2),
  );
  await context.close();
}
