import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { launchExtension, requireCachedModel, saveResult } from "./harness.mjs";

const result = { completed: false };
let session;
try {
  session = await launchExtension();
  const { context, page: bridge } = session;
  result.identity = session.backgroundIdentity;
  result.cache = await requireCachedModel(session.send);
  await bridge.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      settings: {
        ...settings,
        sourceLanguage: "en",
        targetLanguage: "zh",
        autoTranslate: false,
        siteRules: [],
        glossary: {},
        glossaries: [],
      },
    });
  });
  const ocrAsset = ".workspace/ocr-data/eng.traineddata.gz";
  if (existsSync(ocrAsset))
    await context.route(
      "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz",
      (route) => route.fulfill({ path: ocrAsset }),
    );
  const url = `http://screenshot-translation.test/?run=${crypto.randomUUID()}`;
  await context.route(url, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: '<!doctype html><meta charset="utf-8"><body style="margin:0;background:white"><div translate="no" style="position:absolute;left:70px;top:80px;font:700 54px Arial;color:black">HELLO WORLD</div><div translate="no" style="position:absolute;left:70px;top:260px;font:700 54px Arial;color:black">OUTSIDE REGION</div></body>',
    }),
  );
  await session.send("prepare");
  const worker = context
    .serviceWorkers()
    .find(
      (worker) => worker.url() === new URL("background.js", bridge.url()).href,
    );
  assert.ok(worker);
  await worker.evaluate(() => {
    globalThis.screenshotRequests = [];
    chrome.runtime.onMessage.addListener((message) => {
      if (
        message?.destination === "background" &&
        message.action === "translate"
      )
        globalThis.screenshotRequests.push(message.payload.text);
    });
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.bringToFront();
  const tab = await bridge.evaluate(
    async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url),
    url,
  );
  assert.ok(tab);
  const open = () =>
    worker.evaluate(
      (tab) =>
        chrome.contextMenus.onClicked.dispatch(
          { menuItemId: "translate-screenshot", frameId: 0, editable: false },
          tab,
        ),
      tab,
    );
  const dialog = page.getByRole("dialog", {
    name: "Translate screenshot area",
  });
  await open();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  assert.deepEqual(
    await worker.evaluate(() => globalThis.screenshotRequests),
    [],
  );
  await open();
  await expect(dialog).toBeVisible();
  await page.mouse.move(42, 58);
  await page.mouse.down();
  await page.mouse.move(600, 170, { steps: 8 });
  await page.mouse.up();
  await expect(
    dialog.getByRole("img", { name: "Translated screenshot" }),
  ).toBeVisible({ timeout: 90000 });
  const requests = await worker.evaluate(() => globalThis.screenshotRequests);
  assert.ok(requests.some((text) => /HELLO WORLD/i.test(text)));
  assert.ok(requests.every((text) => !/OUTSIDE REGION/i.test(text)));
  result.recognized = requests;
  await dialog.screenshot({
    path: ".workspace/qa/screenshot-translation-preview.png",
  });
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save image" }).click();
  const file = await download;
  await file.saveAs(".workspace/qa/translated-screenshot.png");
  const png = await readFile(".workspace/qa/translated-screenshot.png");
  result.dimensions = [png.readUInt32BE(16), png.readUInt32BE(20)];
  assert.deepEqual(result.dimensions, [558, 112]);
  result.completed = true;
} catch (error) {
  result.error = String(error);
  process.exitCode = 1;
} finally {
  saveResult("screenshot-product", result);
  console.log(JSON.stringify(result));
  await session?.context.close();
}
