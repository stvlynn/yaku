import { chromium } from "@playwright/test";
import { saveResult } from "./harness.mjs";

const browser = await chromium.launch({
  channel: process.env.YAKU_BROWSER_CHANNEL ?? "chrome",
  headless: true,
});
const page = await browser.newPage();
const result = {};
try {
  for (const strategy of ["wrappers", "transparent-highlight", "empty-text"]) {
    await page.setContent(
      "<style>p{font:20px/28px sans-serif;width:260px;margin:0}</style><p>This original source paragraph deliberately wraps across several lines before an inline <strong>important phrase</strong> and a protected command <code>npm install</code>. It demonstrates why retaining the entire source layout makes translation-only reading unnecessarily tall.</p>",
    );
    result[strategy] = await page.evaluate((strategy) => {
      const p = document.querySelector("p");
      const originalText = p.firstChild;
      const initialHeight = p.getBoundingClientRect().height;
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      const nodes = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode())
        nodes.push(node);
      if (strategy === "wrappers")
        for (const node of nodes) {
          const span = document.createElement("span");
          node.replaceWith(span);
          span.append(node);
          span.hidden = true;
        }
      if (strategy === "transparent-highlight") {
        const ranges = nodes.map((node) => {
          const range = new Range();
          range.selectNodeContents(node);
          return range;
        });
        CSS.highlights.set("yaku-source", new Highlight(...ranges));
        const sheet = document.createElement("style");
        sheet.textContent = "::highlight(yaku-source){color:transparent}";
        document.head.append(sheet);
      }
      if (strategy === "empty-text") {
        for (const node of nodes) node.data = "";
        for (const element of p.querySelectorAll("strong,code"))
          element.setAttribute("style", "display:none!important");
      }
      const target = document.createElement("span");
      target.style.display = "block";
      target.textContent = "A concise translated result.";
      p.append(target);
      return {
        initialHeight,
        renderedHeight: p.getBoundingClientRect().height,
        targetHeight: target.getBoundingClientRect().height,
        originalParentPreserved: originalText.parentNode === p,
        geometryFixtureOnly: true,
      };
    }, strategy);
    console.log(strategy, result[strategy]);
  }
} catch (error) {
  result.error = String(error);
  process.exitCode = 1;
  throw error;
} finally {
  saveResult("rendering-strategies", result);
  await browser.close();
}
