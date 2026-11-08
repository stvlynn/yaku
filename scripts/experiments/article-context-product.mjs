import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  launchExtension,
  profileDirectory,
  requireCachedModel,
  saveResult,
} from "./harness.mjs";

const result = { completed: false, usesModelStubs: false };
const url = `http://article-context.test/canoe?run=${crypto.randomUUID()}`;
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
        mode: "bilingual",
        siteRules: [],
        glossary: {},
        glossaries: [],
      },
    });
  });
  await context.route(url, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><title>A canoe trip downstream</title><main><p>Maya paddled her canoe past the reeds and looked for a dry place beside the river.</p><p id="passage">She finally reached the bank.</p><p>She tied the canoe to a tree and climbed onto the grass.</p></main>`,
    }),
  );
  await context.setOffline(true);
  await session.send("prepare");
  const page = await context.newPage();
  await page.goto(url);
  const original = await page.locator("main").innerHTML();
  const port = (
    await readFile(join(profileDirectory, "DevToolsActivePort"), "utf8")
  )
    .trim()
    .split("\n")[0];
  const popupUrl = new URL("popup.html", bridge.url()).href;
  async function popup() {
    await page.bringToFront();
    await bridge.evaluate(() => chrome.action.openPopup());
    const connection = await chromium.connectOverCDP(
      `http://127.0.0.1:${port}`,
    );
    const popup = connection
      .contexts()
      .flatMap((context) => context.pages())
      .find((page) => page.url() === popupUrl);
    assert.ok(popup, "Expected the native action popup");
    return popup;
  }
  const target = page.locator('#passage [data-yaku-owned="translation"]');
  const rendered = page.locator('main [data-yaku-owned="translation"]');
  let panel = await popup();
  await panel.getByRole("button", { name: "Translate this page" }).click();
  await panel.close();
  await expect(rendered).toHaveCount(3, { timeout: 90000 });
  result.baseline = await target.textContent();
  assert.match(result.baseline, /银行/u);
  panel = await popup();
  await panel.getByRole("button", { name: /^More reading controls/ }).click();
  await panel
    .getByRole("button", { name: "Translate with page context" })
    .click();
  await panel.close();
  await expect(target).toContainText(/岸/u, { timeout: 90000 });
  await expect(rendered).toHaveCount(3, { timeout: 90000 });
  result.contextual = await target.textContent();
  assert.doesNotMatch(result.contextual, /银行/u);
  await target.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  panel = await popup();
  await panel.getByRole("button", { name: /^More reading controls/ }).click();
  await panel.getByRole("button", { name: "Compare page context" }).click();
  await panel.close();
  const comparison = page.getByRole("dialog", { name: "Compare page context" });
  await expect(comparison).toContainText(result.baseline, { timeout: 90000 });
  await expect(comparison).toContainText(result.contextual);
  await expect(target).toHaveText(result.contextual);
  await comparison.getByRole("button", { name: "Close" }).click();
  result.pairedComparison = true;
  panel = await popup();
  await panel.getByRole("button", { name: "Show original" }).click();
  await expect(rendered).toHaveCount(0);
  assert.equal(await page.locator("main").innerHTML(), original);
  result.exactRestore = true;
  result.completed = true;
} catch (error) {
  result.error = String(error);
  process.exitCode = 1;
} finally {
  saveResult("article-context-product", result);
  console.log(JSON.stringify(result));
  await session?.context.close();
}
