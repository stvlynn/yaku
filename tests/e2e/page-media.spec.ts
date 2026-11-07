import { test, expect, chromium } from "@playwright/test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Settings } from "../../frontend/src/entities/settings";

/** Debugger-dispatched real registered menu events; this does not test OS menu item selection. */
test("page image menu route and observed video captions use real OCR and HY-MT2", async () => {
  test.skip(
    !process.env.YAKU_MODEL_PROFILE,
    "Requires the real cached local model profile.",
  );
  test.setTimeout(300_000);
  console.log("page-media: launch");
  const context = await chromium.launchPersistentContext(
    process.env.YAKU_MODEL_PROFILE!,
    {
      channel: "chrome",
      headless: true,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: ["--enable-unsafe-extension-debugging"],
      viewport: { width: 1180, height: 860 },
      acceptDownloads: true,
    },
  );
  const errors: string[] = [];
  const nonce = crypto.randomUUID();
  const imageUrl = `https://media-fixture.test/image?run=${nonce}`;
  const captionUrl = `https://www.youtube.com/watch?v=yaku-local-fixture&run=${nonce}`;
  try {
    const cdp = await context.browser()!.newBrowserCDPSession();
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: path.resolve(".output/chrome-mv3"),
    });
    const bridge = await context.newPage();
    await bridge.goto(`chrome-extension://${id}/workspace.html`);
    console.log("page-media: bridge ready");
    const cache = await bridge.evaluate(async () =>
      chrome.runtime.sendMessage({
        destination: "background",
        action: "cache-info",
      }),
    );
    expect(cache.ok).toBe(true);
    expect(cache.value.complete).toBe(true);
    console.log("page-media: cache ready");
    const originalSettings = await bridge.evaluate(
      async () =>
        (await chrome.storage.local.get("settings")).settings as Settings,
    );
    await bridge.evaluate(
      async (settings) =>
        chrome.storage.local.set({
          settings: {
            ...settings,
            targetLanguage: "zh",
            sourceLanguage: "en",
            subtitlesEnabled: true,
            mode: "bilingual",
            autoTranslate: false,
          },
        }),
      originalSettings,
    );
    if (existsSync(".workspace/ocr-data/eng.traineddata.gz"))
      await context.route(
        "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz",
        (route) =>
          route.fulfill({
            path: path.resolve(".workspace/ocr-data/eng.traineddata.gz"),
            contentType: "application/gzip",
            headers: { "access-control-allow-origin": "*" },
          }),
      );
    const canvas = createCanvas(900, 180);
    const paint = canvas.getContext("2d");
    paint.fillStyle = "#ffffff";
    paint.fillRect(0, 0, 900, 180);
    paint.fillStyle = "#000000";
    paint.font = "52px Arial";
    paint.fillText("HELLO WORLD", 40, 100);
    const originalImage =
      "data:image/png;base64," +
      canvas.toBuffer("image/png").toString("base64");
    await context.route(imageUrl, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head><title>Page image fixture</title></head><body><h1>Page image fixture</h1><picture><source srcset="${originalImage}" type="image/png"><img id="image" alt="Fixture words" src="${originalImage}" srcset="${originalImage} 1x" sizes="900px" width="900" height="180"></picture></body></html>`,
      }),
    );
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(imageUrl);
    console.log("page-media: image page ready");
    await page
      .locator("#image")
      .evaluate((image) => (image as HTMLImageElement).decode());
    console.log("page-media: image decoded");
    const initialPicture = await page
      .locator("picture")
      .evaluate((node) => node.outerHTML);
    await page.locator("#image").dispatchEvent("contextmenu");
    console.log("page-media: target captured");
    const imageTabs = await bridge.evaluate(
      async (url) => chrome.tabs.query({ url }),
      imageUrl,
    );
    expect(imageTabs).toHaveLength(1);
    const tab = imageTabs[0]!;
    console.log("page-media: unique target", tab.id, tab.url);
    const nativeSource = await page
      .locator("#image")
      .evaluate(
        (node) =>
          (node as HTMLImageElement).currentSrc ||
          (node as HTMLImageElement).src,
      );
    const worker = context
      .serviceWorkers()
      .find((worker) => worker.url().startsWith(`chrome-extension://${id}/`))!;
    expect(worker).toBeTruthy();
    await worker.evaluate(
      ({ tab, url }) => {
        const event = chrome.contextMenus.onClicked as unknown as {
          dispatch: (
            info: chrome.contextMenus.OnClickData,
            tab: chrome.tabs.Tab,
          ) => void;
        };
        event.dispatch(
          {
            menuItemId: "translate-image",
            srcUrl: url,
            frameId: 0,
            editable: false,
          },
          tab,
        );
      },
      { tab, url: nativeSource },
    );
    console.log("page-media: menu dispatched", tab.id);
    await expect(page.locator("[data-yaku-image]")).toHaveCount(1, {
      timeout: 10000,
    });
    console.log("page-media: image panel visible");
    await expect
      .poll(
        async () => {
          const alert = page.locator("[data-yaku-image]").getByRole("alert");
          if (await alert.count()) throw new Error(await alert.innerText());
          return page.locator("#image").getAttribute("src");
        },
        {
          timeout: 180_000,
        },
      )
      .not.toBe(originalImage);
    console.log("page-media: image replaced");
    const replacement = await page.locator("#image").evaluate(async (node) => {
      const image = node as HTMLImageElement;
      await image.decode();
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        source: image.src,
      };
    });
    expect([replacement.width, replacement.height]).toEqual([900, 180]);
    const decoded = await loadImage(
      Buffer.from(replacement.source.split(",")[1]!, "base64"),
    );
    expect([decoded.width, decoded.height]).toEqual([900, 180]);
    await mkdir(".workspace/qa", { recursive: true });
    await writeFile(
      ".workspace/qa/page-image.translated.png",
      Buffer.from(replacement.source.split(",")[1]!, "base64"),
    );
    await page.screenshot({
      path: ".workspace/qa/page-image-translated.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Restore image", exact: true })
      .click();
    await page
      .locator("#image")
      .evaluate((image) => (image as HTMLImageElement).decode());
    expect(
      await page.locator("picture").evaluate((node) => node.outerHTML),
    ).toBe(initialPicture);
    await expect(page.locator("[data-yaku-image]")).toHaveCount(0);
    await page.screenshot({
      path: ".workspace/qa/page-image-restored.png",
      fullPage: true,
    });

    if (process.env.YAKU_PAGE_IMAGE_ONLY) {
      await bridge.evaluate(
        async (settings) => chrome.storage.local.set({ settings }),
        originalSettings,
      );
      console.log("page-media: image-only complete");
      return;
    }
    await context.route(captionUrl, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><title>Synthetic caption fixture</title><style>.html5-video-player{position:relative;width:900px;height:400px;background:#161616}.caption-window{position:absolute;left:40px;bottom:30px;color:white;font:28px Arial;text-shadow:0 1px 3px black}</style></head><body><h1>Synthetic caption fixture</h1><div class="html5-video-player"><video id="video" muted controls width="900" height="400"></video><div class="caption-window"><span class="caption-visual-line">Thank you.</span></div></div></body></html>',
      }),
    );
    await page.goto(captionUrl);
    await expect(
      page.locator('.caption-window [data-yaku-owned="subtitle-translation"]'),
    ).toContainText(/[\u3400-\u9fff]/, { timeout: 120_000 });
    await page.screenshot({
      path: ".workspace/qa/dom-caption-real-model.png",
      fullPage: true,
    });
    const captionTabs = await bridge.evaluate(
      async (url) => chrome.tabs.query({ url }),
      captionUrl,
    );
    expect(captionTabs).toHaveLength(1);
    const captionTab = captionTabs[0]!;
    const pending = page.waitForEvent("download");
    await worker.evaluate((tab) => {
      const event = chrome.contextMenus.onClicked as unknown as {
        dispatch: (
          info: chrome.contextMenus.OnClickData,
          tab: chrome.tabs.Tab,
        ) => void;
      };
      event.dispatch(
        { menuItemId: "download-subtitles", frameId: 0, editable: false },
        tab,
      );
    }, captionTab);
    const download = await pending;
    const filename = await download.path();
    const captions = await readFile(filename!, "utf8");
    expect(download.suggestedFilename()).toBe("observed-captions.vtt");
    expect(captions).toContain("NOTE Observed captions only.");
    expect(captions).toContain("Thank you.");
    expect(captions).toMatch(/[\u3400-\u9fff]/);
    await download.saveAs(".workspace/qa/observed-captions.real-model.vtt");
    await bridge.evaluate(
      async (settings) => chrome.storage.local.set({ settings }),
      originalSettings,
    );
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
