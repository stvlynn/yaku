import assert from "node:assert/strict";
import { expect } from "@playwright/test";
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
