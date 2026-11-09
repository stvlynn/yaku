import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyBackgroundSource } from "./background-identity.mjs";

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const profileDirectory = resolve(
  process.env.YAKU_MODEL_PROFILE ??
    resolve(repositoryRoot, ".workspace/experiments/model-profile"),
);
const resultsDirectory = resolve(
  repositoryRoot,
  ".workspace/experiments/results",
);
mkdirSync(resultsDirectory, { recursive: true });

export function saveResult(name, value) {
  writeFileSync(
    resolve(resultsDirectory, `${name}.json`),
    JSON.stringify(value, null, 2),
  );
}

export async function launchExtension(
  surface = "options",
  deviceScaleFactor = 1,
) {
  const extensionDirectory = resolve(repositoryRoot, ".output/chrome-mv3");
  if (!existsSync(resolve(extensionDirectory, "manifest.json")))
    throw new Error(
      "Build the extension with pnpm build before running experiments.",
    );
  const context = await chromium.launchPersistentContext(profileDirectory, {
    deviceScaleFactor,
    channel: process.env.YAKU_BROWSER_CHANNEL ?? "chrome",
    headless: process.env.YAKU_HEADLESS !== "false",
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      "--enable-unsafe-extension-debugging",
      "--remote-debugging-port=0",
      ...(deviceScaleFactor === 1
        ? []
        : [`--force-device-scale-factor=${deviceScaleFactor}`]),
    ],
  });
  try {
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: extensionDirectory,
    });
    let page = await context.newPage();
    page.setDefaultTimeout(900000);
    await page.goto(`chrome-extension://${id}/${surface}.html`);
    await page.evaluate(() =>
      chrome.runtime.sendMessage({
        destination: "background",
        action: "cache-info",
      }),
    );
    const backgroundIdentity = await verifyBackgroundSource(
      profileDirectory,
      id,
      resolve(extensionDirectory, "background.js"),
    );
    console.log(
      "Executed background identity:",
      JSON.stringify(backgroundIdentity),
    );
    const send = async (action, payload) => {
      const reply = await page.evaluate(
        ({ action, payload }) =>
          chrome.runtime.sendMessage({
            destination: "background",
            action,
            payload,
          }),
        { action, payload },
      );
      if (!reply?.ok)
        throw new Error(reply?.error ?? "No reply from extension.");
      return reply.value;
    };
    return {
      context,
      page,
      send,
      browserVersion: context.browser().version(),
      backgroundIdentity,
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}

export async function requireCachedModel(send) {
  const cache = await send("cache-info");
  if (!cache.complete)
    throw new Error(
      "This experiment requires the complete model. Run pnpm experiment:download with the same YAKU_MODEL_PROFILE first.",
    );
  return cache;
}
