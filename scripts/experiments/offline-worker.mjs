import {
  launchExtension,
  profileDirectory,
  requireCachedModel,
  saveResult,
} from "./harness.mjs";

const result = { profileDirectory, networkDisabled: true, events: [] };
let session;
const record = async (name, operation) => {
  const started = performance.now();
  const value = await operation();
  const event = { name, value, elapsedMs: performance.now() - started };
  result.events.push(event);
  console.log(JSON.stringify(event));
  saveResult("offline-worker", result);
};
try {
  session = await launchExtension();
  const { context, page, send, browserVersion } = session;
  result.browserVersion = browserVersion;
  result.cache = await requireCachedModel(send);
  await context.setOffline(true);
  await record("offline-prepare", () => send("prepare"));
  await record("english-to-chinese", () =>
    send("translate", {
      id: crypto.randomUUID(),
      text: "The quick brown fox jumps over the lazy dog.",
      targetLanguage: "zh",
    }),
  );
  await record("destroy-offscreen-and-worker", () =>
    page.evaluate(() => chrome.offscreen.closeDocument()),
  );
  await record("offline-recreate-and-translate", () =>
    send("translate", {
      id: crypto.randomUUID(),
      text: "今天天气很好，我们一起去公园散步。",
      targetLanguage: "en",
    }),
  );
  await record("persistent-cache-after-recreation", () => send("cache-info"));
} catch (error) {
  result.error = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  saveResult("offline-worker", result);
  await session?.context.close();
}
