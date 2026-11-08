import { launchExtension, profileDirectory, saveResult } from "./harness.mjs";

const result = {
  profileDirectory,
  requestInterception: false,
  seededAssets: false,
  events: [],
  errors: [],
};
let session;
const save = () => saveResult("production-download", result);
try {
  session = await launchExtension("welcome");
  const { context, page, send, browserVersion } = session;
  result.browserVersion = browserVersion;
  page.on("pageerror", (error) => {
    result.errors.push(String(error));
    save();
  });
  const cache = await send("cache-info");
  result.events.push({ name: "initial-cache", cache });
  save();
  const resume = process.argv.includes("--resume");
  if (cache.complete || (!resume && cache.bytes !== 0))
    throw new Error(
      "Use a fresh YAKU_MODEL_PROFILE, or --resume for a previously interrupted incomplete download.",
    );
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  const started = Date.now();
  let cancelled = resume;
  let lastStatus;
  let ready = false;
  while (Date.now() - started < 900000) {
    const { modelStatus: status } = await page.evaluate(() =>
      chrome.storage.session.get("modelStatus"),
    );
    if (status?.phase === "error") throw new Error(status.error);
    const key = `${status?.phase}:${Math.floor(status?.progress ?? 0)}`;
    if (key !== lastStatus) {
      const event = { elapsedMs: Date.now() - started, status };
      result.events.push(event);
      console.log(JSON.stringify(event));
      save();
      lastStatus = key;
    }
    if (
      !cancelled &&
      status?.phase === "downloading" &&
      (status.progress ?? 0) >= 1
    ) {
      await page
        .getByRole("button", { name: "Cancel download", exact: true })
        .click();
      await page.waitForFunction(
        async () =>
          (await chrome.storage.session.get("modelStatus")).modelStatus
            ?.phase === "idle",
      );
      result.events.push({
        name: "cancelled-cache",
        cache: await send("cache-info"),
      });
      save();
      await page
        .getByRole("button", { name: "Download & prepare", exact: true })
        .click();
      cancelled = true;
    }
    if (status?.phase === "ready") {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!ready)
    throw new Error(
      "The real production download did not become ready within the experiment timeout.",
    );
  result.events.push({
    name: "complete-cache",
    cache: await requireComplete(send),
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("#practice-input").fill("The weather is pleasant today.");
  await page.getByRole("button", { name: "Translate", exact: true }).click();
  await page.locator(".practice-result").waitFor();
  const text = await page.locator(".practice-result").innerText();
  if (!/[\u3400-\u9fff]/.test(text))
    throw new Error("The welcome practice did not produce Chinese output.");
  result.events.push({
    name: "welcome-practice",
    text,
    elapsedMs: Date.now() - started,
  });
  console.log(JSON.stringify(result.events.at(-1)));
} catch (error) {
  result.error = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  save();
  await session?.context.close();
}

async function requireComplete(send) {
  const cache = await send("cache-info");
  if (!cache.complete)
    throw new Error(
      "The model reported ready without a complete persistent cache.",
    );
  return cache;
}
