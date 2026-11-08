import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import jsQR from "jsqr";
import { mkdir, readFile } from "node:fs/promises";
import { launchExtension, requireCachedModel, saveResult } from "./harness.mjs";

const result = { completed: false, syntheticPost: true };
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
        mode: "translation",
        siteRules: [],
        glossary: {},
        glossaries: [],
      },
    });
  });
  const url = `https://x.com/example/status/731?run=${crypto.randomUUID()}`;
  await context.route(url, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: '<!doctype html><title>Post fixture</title><main><article><a href="/example/status/731" translate="no"><time>Monday</time></a><div data-testid="tweetText">The library opens every Monday.</div></article></main>',
    }),
  );
  await context.setOffline(true);
  await session.send("prepare");
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const worlds = [];
  cdp.on("Runtime.executionContextCreated", ({ context }) =>
    worlds.push(context),
  );
  await cdp.send("Runtime.enable");
  await page.goto(url);
  const send = (action, payload) =>
    bridge.evaluate(
      async ({ url, action, payload }) => {
        const tab = (await chrome.tabs.query({})).find(
          (tab) => tab.url === url,
        );
        return chrome.tabs.sendMessage(
          tab.id,
          { destination: "content", action, payload },
          { frameId: 0 },
        );
      },
      { url, action, payload },
    );
  await expect.poll(async () => (await send("page-state")).ok).toBe(true);
  assert.equal((await send("post-card")).ok, false);
  assert.equal((await send("translate-page")).ok, true);
  const target = page.locator(
    '[data-testid="tweetText"] [data-yaku-owned="translation"]',
  );
  await expect(target).toContainText(/图书馆/u, { timeout: 90000 });
  assert.equal((await send("set-page-editing", true)).ok, true);
  await target.focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText(" 修订。");
  await expect(target).toContainText("修订。");
  const reply = await send("post-card");
  assert.equal(reply.ok, true, reply.error);
  const dialog = page.getByRole("dialog", { name: "Bilingual post card" });
  await expect(
    dialog.getByRole("img", {
      name: /The library opens every Monday.*修订。/s,
    }),
  ).toBeVisible();
  await mkdir(".workspace/qa", { recursive: true });
  await dialog.screenshot({ path: ".workspace/qa/post-card-preview.png" });
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save image" }).click();
  const file = await download;
  assert.equal(file.suggestedFilename(), "post-731.png");
  await file.saveAs(".workspace/qa/post-731.png");
  const png = await readFile(".workspace/qa/post-731.png");
  assert.equal(png.readUInt32BE(16), 800);
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, image.width, image.height);
  const code = jsQR(pixels.data, image.width, image.height);
  assert.equal(code?.data, "https://x.com/example/status/731");
  result.qrDestination = code.data;
  const share = dialog.getByRole("button", { name: "Share image" });
  if (await share.count()) {
    const extensionId = new URL(bridge.url()).hostname;
    const world = worlds.find(
      (world) => world.origin === `chrome-extension://${extensionId}`,
    );
    assert.ok(world, "Expected the installed content world");
    const evaluate = async (expression) => {
      const reply = await cdp.send("Runtime.evaluate", {
        contextId: world.id,
        expression,
        returnByValue: true,
      });
      assert.ok(!reply.exceptionDetails, reply.exceptionDetails?.text);
      return reply.result.value;
    };
    await evaluate(`Object.defineProperty(navigator, "share", { configurable: true, value: async ({ files }) => {
      globalThis.postCardShare = files.map(({ name, size, type }) => ({ name, size, type }));
      throw new DOMException("Cancelled by test", "AbortError");
    } })`);
    await share.click();
    assert.deepEqual(await evaluate("globalThis.postCardShare"), [
      { name: "post-731.png", size: png.length, type: "image/png" },
    ]);
    await expect(dialog.getByRole("status")).toBeEmpty();
    result.controlledSharePayload = true;
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  result.pngBytes = png.length;
  result.completed = true;
} catch (error) {
  result.error = String(error);
  process.exitCode = 1;
} finally {
  saveResult("post-card-product", result);
  console.log(JSON.stringify(result));
  await session?.context.close();
}
