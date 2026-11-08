import { saveResult } from "./harness.mjs";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
let context, page;
const result = {
  usesModelStubs: false,
  modelInferenceUsed: false,
  variants: [],
};
try {
  context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.route("https://editing-fixture.test/**", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: '<!doctype html><meta charset="utf-8"><main><p id="source">Hello <a href="https://example.com/report">linked words</a> and <em>some emphasis</em>. Run <code>npm install</code>.</p><div id="target"></div></main>',
    }),
  );
  page = await context.newPage();
  await page.goto("https://editing-fixture.test/");
  await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    window.__clipboardBackup = await Promise.all(
      items
        .filter((item) => item.types.length)
        .map(async (item) => {
          const values = {};
          for (const type of item.types)
            values[type] = await item.getType(type);
          return new ClipboardItem(values);
        }),
    );
  });
  for (const variant of [
    "whole-plaintext",
    "whole-controlled-paste",
    "leaf-plaintext",
  ]) {
    await page.evaluate((variant) => {
      const source = document.querySelector("#source"),
        prior = document.querySelector("#target"),
        target = document.createElement("div");
      target.id = "target";
      prior.replaceWith(target);
      target.innerHTML = source.innerHTML;
      target.querySelector("code").contentEditable = "false";
      target.__trace = [];
      for (const type of [
        "beforeinput",
        "input",
        "compositionstart",
        "compositionend",
      ])
        target.addEventListener(type, (event) =>
          target.__trace.push({
            type,
            inputType: event.inputType,
            trusted: event.isTrusted,
            composing: event.isComposing,
          }),
        );
      target.removeAttribute("contenteditable");
      if (variant === "leaf-plaintext") {
        const walker = document.createTreeWalker(target, 4),
          nodes = [];
        for (let n = walker.nextNode(); n; n = walker.nextNode())
          if (!n.parentElement.closest("code")) nodes.push(n);
        for (const node of nodes) {
          const leaf = document.createElement("span");
          leaf.contentEditable = "plaintext-only";
          node.replaceWith(leaf);
          leaf.append(node);
        }
      } else {
        target.contentEditable =
          variant === "whole-plaintext" ? "plaintext-only" : "true";
      }
      if (variant === "whole-controlled-paste")
        target.addEventListener("paste", (event) => {
          event.preventDefault();
          document.execCommand(
            "insertText",
            false,
            event.clipboardData.getData("text/plain"),
          );
        });
    }, variant);
    const before = await page.locator("#target").innerHTML();
    const original = await page.locator("#source").innerHTML();
    await page
      .locator("#target")
      .evaluate((target) =>
        (target.isContentEditable
          ? target
          : target.querySelector("[contenteditable]")
        ).focus(),
      );
    await page.evaluate(() => {
      const text =
        document.querySelector("#target a").querySelector("[contenteditable]")
          ?.firstChild ?? document.querySelector("#target a").firstChild;
      const range = document.createRange();
      range.setStart(text, 2);
      range.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await page.keyboard.insertText("X");
    const typed = await page.locator("#target").innerHTML();
    await page.keyboard.press("Control+z");
    const typingUndo = await page.locator("#target").innerHTML();
    await page.evaluate(async () =>
      navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob(["<unsafe> PASTED & text"], {
            type: "text/plain",
          }),
          "text/html": new Blob(
            [
              '<img src="https://bad.test/x" onerror="window.executed=true"><b>RICH</b>',
            ],
            { type: "text/html" },
          ),
        }),
      ]),
    );
    await page.evaluate(() => {
      const a = document.querySelector("#target a"),
        em = document.querySelector("#target em");
      const start =
          a.querySelector("[contenteditable]")?.firstChild ?? a.firstChild,
        end =
          em.querySelector("[contenteditable]")?.firstChild ?? em.firstChild;
      const range = document.createRange();
      range.setStart(start, 2);
      range.setEnd(end, 3);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await page.keyboard.press("Control+v");
    const pasted = await page.locator("#target").innerHTML();
    await page.keyboard.press("Control+z");
    const pasteUndo = await page.locator("#target").innerHTML();
    await page.evaluate(() => {
      const target = document.querySelector("#target");
      const leaf = target.querySelector('[contenteditable="plaintext-only"]');
      const host = target.isContentEditable ? target : leaf;
      host.focus();
      const range = document.createRange();
      range.selectNodeContents(host);
      range.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.imeSetComposition", {
      text: "中文",
      selectionStart: 2,
      selectionEnd: 2,
    });
    await cdp.send("Input.insertText", { text: "中文" });
    const composed = await page.locator("#target").innerHTML();
    await page.keyboard.press("Control+z");
    const imeUndo = await page.locator("#target").innerHTML();
    const trace = await page
      .locator("#target")
      .evaluate((target) => target.__trace);
    await cdp.detach();
    const observation = {
      variant,
      before,
      typed,
      typingUndo,
      pasted,
      pasteUndo,
      composed,
      imeUndo,
      trace,
      sourceUnchanged: original === (await page.locator("#source").innerHTML()),
      linkHref: await page.locator("#target a").getAttribute("href"),
    };
    assert.equal(observation.sourceUnchanged, true);
    result.variants.push(observation);
    console.log(
      JSON.stringify({
        variant,
        typingUndoMatches: typingUndo === before,
        pasteChanged: pasted !== before,
        pasteUndoMatches: pasteUndo === before,
        imeUndoMatches: imeUndo === before,
        sourceUnchanged: observation.sourceUnchanged,
        linkHref: observation.linkHref,
        inputTypes: [
          ...new Set(trace.map((event) => event.inputType).filter(Boolean)),
        ],
        compositionStartTrusted: trace.some(
          (event) => event.type === "compositionstart" && event.trusted,
        ),
        pasted,
      }),
    );
  }
} catch (error) {
  result.error = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  if (page && !page.isClosed())
    await page.evaluate(async () => {
      const backup = window.__clipboardBackup;
      if (!backup) return;
      if (backup.length) await navigator.clipboard.write(backup);
      else await navigator.clipboard.writeText("");
      delete window.__clipboardBackup;
    });
  saveResult("editing-ablation", result);
  await browser.close();
}
