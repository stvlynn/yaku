import { test, expect, chromium } from "@playwright/test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { existsSync } from "node:fs";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

test("image OCR and PDF extraction feed the real cached HY-MT2 model and export bilingual HTML", async () => {
  test.skip(
    !process.env.YAKU_MODEL_PROFILE,
    "Requires an explicitly supplied profile containing the real local model.",
  );
  test.setTimeout(300_000);
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
  try {
    const cdp = await context.browser()!.newBrowserCDPSession();
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: path.resolve(".output/chrome-mv3"),
    });
    if (existsSync(".workspace/ocr-data/eng.traineddata.gz")) {
      await context.route(
        "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz",
        (route) =>
          route.fulfill({
            path: path.resolve(".workspace/ocr-data/eng.traineddata.gz"),
            contentType: "application/gzip",
            headers: { "access-control-allow-origin": "*" },
          }),
      );
    }
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`chrome-extension://${id}/workspace.html`);
    const cache = await page.evaluate(async () =>
      chrome.runtime.sendMessage({
        destination: "background",
        action: "cache-info",
      }),
    );
    expect(cache.ok).toBe(true);
    expect(cache.value.complete).toBe(true);
    await page
      .getByRole("combobox", { name: "Translate to", exact: true })
      .click();
    await page.getByRole("option", { name: "Chinese", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Translate from", exact: true })
      .click();
    await page.getByRole("option", { name: "English", exact: true }).click();
    const canvas = createCanvas(900, 180);
    const drawing = canvas.getContext("2d");
    drawing.fillStyle = "#ffffff";
    drawing.fillRect(0, 0, 900, 180);
    drawing.fillStyle = "#000000";
    drawing.font = "52px Arial";
    drawing.fillText("HELLO WORLD", 40, 100);
    const cases = [
      {
        mode: "Image",
        name: "words.png",
        mimeType: "image/png",
        buffer: canvas.toBuffer("image/png"),
        expected: "HELLO WORLD",
      },
      {
        mode: "Document",
        name: "reading.pdf",
        mimeType: "application/pdf",
        buffer: await readFile("tests/fixtures/reading-sample.pdf"),
        expected: "Hello world",
      },
    ];
    await mkdir(".workspace/qa", { recursive: true });
    for (const item of cases) {
      await page.getByRole("button", { name: item.mode, exact: true }).click();
      await page.getByLabel("Choose a file", { exact: true }).setInputFiles({
        name: item.name,
        mimeType: item.mimeType,
        buffer: item.buffer,
      });
      await page
        .getByRole("button", { name: "Translate", exact: true })
        .click();
      const downloadButton = page.getByRole("button", {
        name: "Export bilingual view",
        exact: true,
      });
      await expect(downloadButton).toBeVisible({ timeout: 240_000 });
      const pending = page.waitForEvent("download");
      await downloadButton.click();
      const download = await pending;
      const filename = await download.path();
      expect(download.suggestedFilename()).toMatch(/\.translated\.html$/);
      const html = await readFile(filename!, "utf8");
      expect(html).toContain(item.expected);
      expect(html).toMatch(/[\u3400-\u9fff]/);
      expect(html).toContain("data:image/png;base64,");
      expect(html).not.toContain("<script");
      await download.saveAs(
        path.resolve(".workspace/qa", download.suggestedFilename()),
      );
      await page.screenshot({
        path: path.resolve(
          ".workspace/qa",
          `${item.mode.toLowerCase()}-real-model.png`,
        ),
        fullPage: true,
      });
      if (item.mode === "Image") {
        const pendingPng = page.waitForEvent("download");
        await page
          .getByRole("button", {
            name: "Download translated image",
            exact: true,
          })
          .click();
        const png = await pendingPng;
        const pngPath = await png.path();
        const translatedImage = await loadImage(await readFile(pngPath!));
        expect([translatedImage.width, translatedImage.height]).toEqual([
          900, 180,
        ]);
        expect(png.suggestedFilename()).toMatch(/\.png$/);
        await png.saveAs(path.resolve(".workspace/qa", "words.translated.png"));
      }
      if (item.mode === "Document") {
        const pendingPdf = page.waitForEvent("download");
        await page
          .getByRole("button", { name: "Download reading PDF", exact: true })
          .click();
        const pdfDownload = await pendingPdf;
        expect(pdfDownload.suggestedFilename()).toBe("reading.translated.pdf");
        const bytes = await readFile((await pdfDownload.path())!);
        expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
        const originalPdf = await PDFDocument.load(item.buffer);
        const translatedPdf = await PDFDocument.load(bytes);
        expect(translatedPdf.getPageCount()).toBeGreaterThan(
          originalPdf.getPageCount(),
        );
        expect(translatedPdf.getPage(0).getSize()).toEqual(
          originalPdf.getPage(0).getSize(),
        );
        await pdfDownload.saveAs(
          path.resolve(".workspace/qa", "reading.translated.pdf"),
        );
      }
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
