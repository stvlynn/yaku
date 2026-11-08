// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  prepareImage,
  translateImage,
} from "../frontend/src/features/image-translation";
const require = createRequire(import.meta.url);
mkdirSync(".workspace/research", { recursive: true });
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const canvas = createCanvas(900, 180);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 900, 180);
  context.fillStyle = "#000000";
  context.font = "52px Arial";
  context.fillText("HELLO WORLD", 40, 100);
  const png = canvas.toBuffer("image/png");
  writeFileSync(".workspace/research/ocr-fixture.png", png);
  return new File([new Uint8Array(png)], "words.png", { type: "image/png" });
}
async function decode(file: Blob) {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const image = await loadImage(data);
  return {
    width: image.width,
    height: image.height,
    close() {},
  } as ImageBitmap;
}
const options = {
  assets: {
    workerPath: require.resolve("tesseract.js/src/worker-script/node/index.js"),
    langPath: resolve(".workspace/ocr-data"),
    cachePath: resolve(".workspace/ocr-data"),
  },
  ocrLanguage: "eng",
};

describe("image translation", () => {
  it("rejects unsupported media and honors already-aborted work", async () => {
    await expect(
      prepareImage(
        new File(["<svg/>"], "image.svg", { type: "image/svg+xml" }),
      ),
    ).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(
      prepareImage(new File([], "image.png", { type: "image/png" }), {
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });

  it("refuses remote worker and core code before OCR starts", async () => {
    vi.stubGlobal("createImageBitmap", decode);
    await expect(
      prepareImage(fixture(), {
        assets: { workerPath: "https://external.invalid/worker.js" },
      }),
    ).rejects.toThrow();
    await expect(
      prepareImage(fixture(), {
        assets: { corePath: "https://external.invalid/core" },
      }),
    ).rejects.toThrow();
  });

  it.runIf(existsSync(".workspace/ocr-data/eng.traineddata.gz"))(
    "recognizes actual pixels locally and exports original image alongside safely encoded translations",
    async () => {
      vi.stubGlobal("createImageBitmap", decode);
      const result = await translateImage(fixture(), {
        ...options,
        targetLanguage: "fr",
        translate: async (request) => ({
          id: request.id,
          text: "<Bonjour> " + request.text,
          elapsedMs: 0,
        }),
      });
      expect(result.source).toMatch(/HELLO WORLD/);
      expect(result.regions.length).toBeGreaterThan(0);
      expect(result.regions[0]!.bounds.width).toBeGreaterThan(100);
      expect(result.regions[0]!.confidence).toBeGreaterThan(50);
      const html = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(result.exportHtml());
      });
      const document = new DOMParser().parseFromString(html, "text/html");
      expect(document.querySelector("img")?.src).toMatch(
        /^data:image\/png;base64,/,
      );
      expect(document.body.textContent).toContain("<Bonjour> HELLO WORLD");
      expect(document.querySelector("Bonjour")).toBeNull();
      expect(document.querySelector("script")).toBeNull();
    },
    60000,
  );
});
