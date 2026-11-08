import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  launchExtension,
  profileDirectory,
  requireCachedModel,
  saveResult,
} from "./harness.mjs";
const mixed =
  "The museum opens at nine every morning. Visitors can buy tickets online. 博物馆每周一闭馆，请提前安排您的参观时间。儿童可以免费参观，但需要由成年人陪同。";
const result = {
  profileDirectory,
  usesModelStubs: false,
  usesExtraPromptContext: false,
  ui: [],
};
let session, originalSettings;
const choose = async (page, name, option) => {
  await page.getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
};
try {
  session = await launchExtension("workspace");
  result.backgroundIdentity = session.backgroundIdentity;
  result.cache = await requireCachedModel(session.send);
  const { page: workspace, context } = session;
  originalSettings = await workspace.evaluate(
    async () => (await chrome.storage.local.get("settings")).settings,
  );
  const worker = context
    .serviceWorkers()
    .find(
      (worker) =>
        worker.url() === new URL("background.js", workspace.url()).href,
    );
  if (!worker) throw Error("No worker");
  await worker.evaluate(() => {
    globalThis.__productRequests = [];
    chrome.runtime.onMessage.addListener((message) => {
      if (
        message?.destination === "background" &&
        message.action === "translate"
      )
        globalThis.__productRequests.push(message.payload);
    });
  });
  await choose(workspace, "Translate to", "Chinese");
  for (const sample of [
    { source: "German", expected: "毒药" },
    { source: "English", expected: "礼物" },
  ]) {
    await choose(workspace, "Translate from", sample.source);
    await workspace
      .getByRole("textbox", { name: "Original text", exact: true })
      .fill("Gift");
    await workspace
      .getByRole("button", { name: "Translate", exact: true })
      .click();
    await expect(workspace.locator(".editor-result")).toHaveText(
      sample.expected,
      { timeout: 180000 },
    );
    await expect(
      workspace.getByRole("button", { name: "Translate", exact: true }),
    ).toBeEnabled({ timeout: 180000 });
    result.ui.push({
      ...sample,
      output: await workspace.locator(".editor-result").innerText(),
    });
    console.log(JSON.stringify(result.ui.at(-1)));
  }
  await choose(workspace, "Translate from", "Detect language");
  await choose(workspace, "Translate to", "Traditional Chinese");
  await workspace
    .getByRole("textbox", { name: "Original text", exact: true })
    .fill("The library opens at nine every morning. Students need 2 tickets.");
  await workspace
    .getByRole("button", { name: "Translate", exact: true })
    .click();
  await expect(workspace.locator(".editor-result")).toContainText("圖書館", {
    timeout: 180000,
  });
  await expect(
    workspace.getByRole("button", { name: "Translate", exact: true }),
  ).toBeEnabled({ timeout: 180000 });
  result.traditionalUi = await workspace.locator(".editor-result").innerText();
  assert.ok(result.traditionalUi.includes("學生"));
  assert.ok(result.traditionalUi.includes("2"));
  await mkdir(resolve(".workspace/qa"), { recursive: true });
  await workspace.screenshot({
    path: resolve(".workspace/qa/product-prompt-traditional-ui.png"),
    fullPage: true,
  });
  result.explicitFrench = await session.send("translate", {
    id: crypto.randomUUID(),
    text: "pain",
    sourceLanguage: "fr",
    targetLanguage: "zh",
  });
  assert.equal(result.explicitFrench.text, "面包");
  await workspace.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      settings: {
        ...settings,
        sourceLanguage: "auto",
        targetLanguage: "zh-Hant",
        autoTranslate: false,
        mode: "bilingual",
        siteRules: [],
        glossary: { report: "報告書" },
        glossaries: [],
      },
    });
  });
  const nonce = crypto.randomUUID();
  await context.route("https://product-prompt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body:
        new URL(route.request().url()).pathname === "/mixed"
          ? `<!doctype html><html lang="en"><main><p id="source">${mixed}</p></main></html>`
          : '<!doctype html><html lang="en"><main><p id="source">Read <a href="/report">the report</a> before Friday. 订单编号是731。Run <code>npm install</code> now.</p></main></html>',
    }),
  );
  const sendPage = async (page, action) =>
    workspace.evaluate(
      async ({ url, action }) => {
        const tabs = await chrome.tabs.query({ url });
        if (tabs.length !== 1)
          throw Error("Fixture URL must match exactly one tab");
        return chrome.tabs.sendMessage(tabs[0].id, {
          destination: "content",
          action,
        });
      },
      { url: page.url(), action },
    );
  const combined = await context.newPage();
  await combined.goto(`https://product-prompt.test/combined?run=${nonce}`);
  await combined.locator("[data-yaku-floating]").waitFor();
  assert.ok(
    (await combined.locator("#source").textContent()).includes("订单编号是731"),
  );
  await sendPage(combined, "translate-page");
  const target = combined.locator('#source [data-yaku-owned="translation"]');
  await expect(target.locator("code")).toHaveText("npm install", {
    timeout: 180000,
  });
  assert.equal(await target.locator("a").getAttribute("href"), "/report");
  assert.ok((await target.locator("a").innerText()).includes("報告書"));
  assert.ok((await target.innerText()).includes("731"));
  result.traditionalPage = await target.innerHTML();
  console.log("traditional-page", result.traditionalPage);
  await sendPage(combined, "restore-page");
  assert.equal(
    await combined.locator("#source code").innerText(),
    "npm install",
  );
  await workspace.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      settings: { ...settings, targetLanguage: "zh", glossary: {} },
    });
  });
  const mixedPage = await context.newPage();
  await mixedPage.goto(`https://product-prompt.test/mixed?run=${nonce}`);
  await mixedPage.locator("[data-yaku-floating]").waitFor();
  assert.equal(await mixedPage.locator("#source").textContent(), mixed);
  result.mixedCharacterSet = await mixedPage.evaluate(
    () => document.characterSet,
  );
  assert.equal(result.mixedCharacterSet, "UTF-8");
  await sendPage(mixedPage, "translate-page");
  const translated = mixedPage.locator(
    '#source [data-yaku-owned="translation"]',
  );
  await translated.waitFor({ timeout: 180000 });
  result.mixedOutput = await translated.innerText();
  assert.ok(
    result.mixedOutput.includes("周一") && result.mixedOutput.includes("闭馆"),
  );
  assert.ok(result.mixedOutput.includes("儿童"));
  assert.ok(
    result.mixedOutput.includes("成年人") ||
      result.mixedOutput.includes("成人"),
  );
  console.log("mixed", result.mixedOutput);
  await sendPage(mixedPage, "restore-page");
  assert.equal(await mixedPage.locator("#source").textContent(), mixed);
  result.requests = await worker.evaluate(() => globalThis.__productRequests);
  for (const code of ["de", "en"])
    assert.ok(
      result.requests.some(
        (request) =>
          request.text === "Gift" &&
          request.sourceLanguage === code &&
          !request.context,
      ),
    );
  assert.ok(
    result.requests.some(
      (request) =>
        request.text === mixed &&
        request.targetLanguage === "zh" &&
        !request.context,
    ),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  result.error = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  saveResult("product-prompt-regression", result);
  if (session && originalSettings)
    await session.page.evaluate(
      (settings) => chrome.storage.local.set({ settings }),
      originalSettings,
    );
  await session?.context.close();
}
