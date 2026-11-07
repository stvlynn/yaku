import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { JSDOM } from "jsdom";
import {
  launchExtension,
  profileDirectory,
  requireCachedModel,
  saveResult,
} from "./harness.mjs";
const require = createRequire(import.meta.url);
const wxtRequire = createRequire(require.resolve("wxt"));
const { build } = wxtRequire("esbuild");
const compiled = resolve(".workspace/experiments/temp/inline-codec.cjs");
await mkdir(resolve(".workspace/experiments/temp"), { recursive: true });
await build({
  entryPoints: [
    resolve("frontend/src/shared/translation-markup/inline-codec.ts"),
  ],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: compiled,
  logLevel: "error",
});
const { createInlineCodec } = require(compiled);
const dom = new JSDOM(
  '<!doctype html><p id="source">Read <a href="/report">the report</a> before Friday. 订单编号是731。Run <code>npm install</code> now.</p>',
  { url: "https://marker-fixture.test/reading" },
);
const document = dom.window.document;
const block = document.querySelector("#source");
const walker = document.createTreeWalker(block, 4);
const nodes = [];
for (let node = walker.nextNode(); node; node = walker.nextNode())
  if (!node.parentElement.closest("code")) nodes.push(node);
const codec = createInlineCodec(document, block, nodes, {
  preserveProtected: true,
});
const scriptInstruction =
  "請將全部文字完整翻譯為繁體中文，輸出必須全部使用繁體字，不可使用簡體字。保留所有句子、數字與資訊，只輸出譯文。";
const result = {
  profileDirectory,
  usesModelStubs: false,
  source: block.innerHTML,
  request: {
    text: codec.text,
    targetLanguage: "zh-Hant",
    context: [codec.instruction, scriptInstruction].join("\n"),
    glossary: { report: "報告書" },
  },
};
let session;
try {
  session = await launchExtension();
  result.backgroundIdentity = session.backgroundIdentity;
  await requireCachedModel(session.send);
  await session.context.setOffline(true);
  result.output = await session.send("translate", {
    ...result.request,
    id: crypto.randomUUID(),
  });
  const decoded = document.createElement("div");
  decoded.append(codec.decode(result.output.text));
  result.decoded = decoded.innerHTML;
  assert.equal(decoded.querySelector("code")?.textContent, "npm install");
  assert.equal(decoded.querySelector("a")?.getAttribute("href"), "/report");
  assert.ok(decoded.textContent.includes("731"));
  assert.ok(decoded.querySelector("a")?.textContent.includes("報告書"));
  console.log(JSON.stringify(result));
} catch (error) {
  result.error = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  saveResult("script-marker-combination", result);
  await session?.context.close();
  dom.window.close();
}
