import { repositoryRoot, saveResult } from "./harness.mjs";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  wxtRequire = createRequire(require.resolve("wxt"));
const { build } = wxtRequire("esbuild");
const bundled = await build({
  stdin: {
    contents:
      'import{createPageTranslator}from"./frontend/src/features/page-translation";import{defaultSettings}from"./frontend/src/entities/settings";window.createController=createPageTranslator;window.settings={...defaultSettings,siteRules:[],glossary:{},neverSourceLanguages:[]};',
    resolveDir: repositoryRoot,
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  logLevel: "error",
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
let page;
const result = { modelInferenceUsed: false, translatorIsControlled: true };
try {
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.route("https://editing-core.test/**", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: '<!doctype html><main><p id="source">Hello <a href="https://example.com/report">linked words</a> and <em>some emphasis</em>. Run <code>npm install</code>.</p></main>',
    }),
  );
  page = await context.newPage();
  await page.goto("https://editing-core.test/");
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  await page.evaluate(async () => {
    window.clipboardBackup = await Promise.all(
      (await navigator.clipboard.read())
        .filter((item) => item.types.length)
        .map(async (item) => {
          const data = {};
          for (const type of item.types) data[type] = await item.getType(type);
          return new ClipboardItem(data);
        }),
    );
    window.count = 0;
    window.original = document.querySelector("#source").outerHTML;
    window.controller = window.createController({
      document,
      getSettings: () => window.settings,
      translate: async (request) => {
        window.count++;
        return { id: request.id, text: request.text, elapsedMs: 0 };
      },
    });
    window.controller.setEditing(true);
    await window.controller.translatePage({ wholePage: true });
    window.trace = [];
    const host = document.querySelector('[data-yaku-owned="translation"]');
    for (const type of ["input", "compositionstart"])
      host.addEventListener(type, (event) =>
        window.trace.push({
          type,
          inputType: event.inputType,
          trusted: event.isTrusted,
        }),
      );
    host.focus();
    const range = document.createRange();
    range.setStart(host.querySelector("a").firstChild, 2);
    range.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  const target = page.locator('[data-yaku-owned="translation"]'),
    before = await target.innerHTML();
  await page.keyboard.insertText("X");
  result.appearance = await page.evaluate(() => {
    const host = document.querySelector('[data-yaku-owned="translation"]'),
      selection = getSelection(),
      node = selection.anchorNode,
      offset = selection.anchorOffset,
      count = window.count;
    window.settings.fontSize = 125;
    window.settings.textColor = "#123456";
    window.controller.setMode();
    return {
      focus: document.activeElement === host,
      node: getSelection().anchorNode === node,
      offset: getSelection().anchorOffset === offset,
      noRequest: window.count === count,
    };
  });
  assert.ok(Object.values(result.appearance).every(Boolean));
  await page.keyboard.press("Control+z");
  assert.equal(await target.innerHTML(), before);
  await page.evaluate(async () => {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob(["<unsafe> PASTED & text"], {
          type: "text/plain",
        }),
        "text/html": new Blob(
          [
            '<img src="https://bad.test/x" onerror="window.bad=true"><b>RICH</b>',
          ],
          { type: "text/html" },
        ),
      }),
    ]);
    const host = document.querySelector('[data-yaku-owned="translation"]'),
      range = document.createRange();
    range.setStart(host.querySelector("a").firstChild, 2);
    range.setEnd(host.querySelector("em").firstChild, 3);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await page.keyboard.press("Control+v");
  result.paste = await target.innerHTML();
  assert.ok(result.paste.includes("&lt;unsafe&gt; PASTED &amp; text"));
  assert.ok(!result.paste.includes("<img"));
  assert.equal(
    await target.locator("a").getAttribute("href"),
    "https://example.com/report",
  );
  await page.keyboard.press("Control+z");
  assert.equal(await target.innerHTML(), before);
  await target.evaluate((host) => {
    host.focus();
    const r = document.createRange();
    r.selectNodeContents(host);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.imeSetComposition", {
    text: "中文",
    selectionStart: 2,
    selectionEnd: 2,
  });
  await cdp.send("Input.insertText", { text: "中文" });
  assert.ok((await target.innerText()).endsWith("中文"));
  await page.keyboard.press("Control+z");
  assert.equal(await target.innerHTML(), before);
  result.trace = await page.evaluate(() => window.trace);
  assert.ok(
    result.trace.some((e) => e.type === "compositionstart" && e.trusted),
  );
  assert.ok(
    result.trace.some((e) => e.inputType === "historyUndo" && e.trusted),
  );
  await cdp.send("Input.imeSetComposition", {
    text: "正在输入",
    selectionStart: 4,
    selectionEnd: 4,
  });
  const composing = await target.innerText();
  await page.evaluate(() => window.controller.setEditing(false));
  assert.equal(await target.innerText(), composing);
  result.disableRetainsComposition = true;
  await page.evaluate(() => {
    window.controller.setEditing(true);
    window.controller.restore();
  });
  result.restore = await page.evaluate(() => ({
    exact: document.querySelector("#source").outerHTML === window.original,
    editing: window.controller.isEditing(),
  }));
  assert.equal(result.restore.exact, true);
  assert.equal(result.restore.editing, true);
  await page.evaluate(async () => {
    await window.controller.translatePage({ wholePage: true });
    window.settings.style = "blur";
    window.controller.setMode();
  });
  assert.equal(await target.evaluate((host) => host.style.filter), "none");
  await page.evaluate(() => window.controller.dispose());
  assert.equal(await page.evaluate(() => window.controller.isEditing()), false);
  console.log(JSON.stringify(result));
} catch (error) {
  result.error = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  if (page && !page.isClosed())
    await page.evaluate(async () => {
      const backup = window.clipboardBackup;
      if (!backup) return;
      if (backup.length) await navigator.clipboard.write(backup);
      else await navigator.clipboard.writeText("");
      delete window.clipboardBackup;
    });
  saveResult("page-editing-core-browser", result);
  await browser.close();
}
