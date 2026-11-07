/** Inspect actual installed content-world globals; no inference/model download. */
import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { verifyBackgroundSource } from "./background-identity.mjs";
const profile = resolve(
  ".workspace/research/http-crypto-profile-" + crypto.randomUUID(),
);
const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging", "--remote-debugging-port=0"],
});
const evidence = { completed: false, pageErrors: [], contexts: [] };
try {
  const browser = await context.browser().newBrowserCDPSession();
  const { id } = await browser.send("Extensions.loadUnpacked", {
    path: resolve(".output/chrome-mv3"),
  });
  const bridge = await context.newPage();
  await bridge.goto(`chrome-extension://${id}/workspace.html`);
  evidence.background = await verifyBackgroundSource(
    profile,
    id,
    resolve(".output/chrome-mv3/background.js"),
  );
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const contexts = [];
  cdp.on("Runtime.executionContextCreated", (event) =>
    contexts.push(event.context),
  );
  await cdp.send("Runtime.enable");
  const url =
    "http://ordinary-http-fixture.test/reading?run=" + crypto.randomUUID();
  await context.route(url, (route) =>
    route.fulfill({
      contentType: "text/html;charset=utf-8",
      body: "<!doctype html><html><head><title>Ordinary HTTP content-world probe</title></head><body><p>Hello from an insecure nonlocalhost fixture.</p></body></html>",
    }),
  );
  page.on("pageerror", (error) => evidence.pageErrors.push(String(error)));
  await page.goto(url);
  await page.waitForTimeout(500);
  for (const entry of contexts) {
    try {
      const result = await cdp.send("Runtime.evaluate", {
        contextId: entry.id,
        expression:
          "JSON.stringify({origin:location.origin,isSecureContext,randomUUID:typeof crypto.randomUUID,getRandomValues:typeof crypto.getRandomValues,extensionId:globalThis.chrome?.runtime?.id??null})",
        returnByValue: true,
      });
      if (result.result.value)
        evidence.contexts.push({
          name: entry.name,
          origin: entry.origin,
          auxData: entry.auxData,
          globals: JSON.parse(result.result.value),
        });
    } catch (error) {
      evidence.contexts.push({ name: entry.name, error: String(error) });
    }
  }
  const isolated = evidence.contexts.find(
    (entry) => entry.globals?.extensionId === id,
  );
  const main = evidence.contexts.find(
    (entry) =>
      entry.auxData?.isDefault &&
      entry.globals?.origin.startsWith("http://ordinary-http-fixture.test"),
  );
  if (!isolated || !main)
    throw Error("Did not observe both actual content and page worlds");
  evidence.extensionId = id;
  evidence.page = main.globals;
  evidence.content = isolated.globals;
  evidence.completed = true;
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.failure = String(error);
  throw error;
} finally {
  await mkdir(".workspace/qa", { recursive: true });
  await writeFile(
    ".workspace/qa/http-content-crypto.json",
    JSON.stringify(evidence, null, 2),
  );
  await context.close();
}
