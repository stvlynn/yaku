import assert from "node:assert/strict";
import {
  launchExtension,
  profileDirectory,
  requireCachedModel,
  saveResult,
} from "./harness.mjs";
const source =
  "The museum opens at nine every morning. Visitors can buy tickets online. 博物馆每周一闭馆，请提前安排您的参观时间。儿童可以免费参观，但需要由成年人陪同。";
const result = { profileDirectory, source, usesModelStubs: false };
let session, originalSettings;
try {
  session = await launchExtension();
  result.backgroundIdentity = session.backgroundIdentity;
  result.cache = await requireCachedModel(session.send);
  const { context, page: bridge } = session;
  originalSettings = await bridge.evaluate(
    async () => (await chrome.storage.local.get("settings")).settings,
  );
  await bridge.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      settings: {
        ...settings,
        autoTranslate: false,
        mode: "bilingual",
        sourceLanguage: "auto",
        targetLanguage: "zh",
        glossary: {},
        glossaries: [],
        siteRules: [],
        alwaysSourceLanguages: [],
        neverSourceLanguages: ["en", "zh"],
      },
    });
  });
  const worker = context
    .serviceWorkers()
    .find((worker) => worker.url().endsWith("/background.js"));
  if (!worker) throw new Error("No running background worker");
  await worker.evaluate(() => {
    globalThis.__observedTranslationRequests = [];
    chrome.runtime.onMessage.addListener((message, sender) => {
      if (
        message?.destination === "background" &&
        message.action === "translate"
      )
        globalThis.__observedTranslationRequests.push({
          payload: message.payload,
          tabId: sender.tab?.id,
          frameId: sender.frameId,
        });
    });
  });
  const url = `https://payload-fixture.test/reading?run=${crypto.randomUUID()}`;
  await context.route("https://payload-fixture.test/**", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html lang="en"><main><p id="mixed">${source}</p></main></html>`,
    }),
  );
  const page = await context.newPage();
  await page.goto(url);
  await page.locator("[data-yaku-floating]").waitFor();
  result.dom = await page.evaluate(() => ({
    characterSet: document.characterSet,
    text: document.querySelector("#mixed").textContent,
  }));
  assert.equal(result.dom.text, source);
  assert.equal(result.dom.characterSet, "UTF-8");
  result.command = await bridge.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({ url });
    if (tabs.length !== 1) throw new Error("Fixture tab is not unique");
    return chrome.tabs.sendMessage(tabs[0].id, {
      destination: "content",
      action: "translate-page",
    });
  }, url);
  await page
    .locator('#mixed [data-yaku-owned="translation"]')
    .waitFor({ timeout: 180000 });
  result.rendered = await page
    .locator('#mixed [data-yaku-owned="translation"]')
    .innerText();
  result.observed = await worker.evaluate(
    () => globalThis.__observedTranslationRequests,
  );
  assert.equal(result.observed.length, 1);
  assert.equal(result.observed[0].payload.text, source);
  result.replayed = await session.send("translate", {
    ...result.observed[0].payload,
    id: crypto.randomUUID(),
  });
  result.sameOutput = result.replayed.text === result.rendered;
  result.sourceFacts = {
    mondayClosure:
      result.rendered.includes("周一") && result.rendered.includes("闭馆"),
    children: result.rendered.includes("儿童"),
    adultAccompaniment:
      result.rendered.includes("成年人") || result.rendered.includes("成人"),
  };
  assert.equal(result.sourceFacts.mondayClosure, true);
  assert.equal(result.sourceFacts.children, true);
  assert.equal(result.sourceFacts.adultAccompaniment, true);
  console.log(JSON.stringify(result));
} catch (error) {
  result.error = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  saveResult("page-payload", result);
  if (session && originalSettings)
    await session.page.evaluate(
      (settings) => chrome.storage.local.set({ settings }),
      originalSettings,
    );
  await session?.context.close();
}
