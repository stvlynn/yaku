// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import {
  preparePdf,
  translatePdf,
} from "../frontend/src/features/pdf-translation";
import type { Translate } from "../frontend/src/entities/translation";
const require = createRequire(import.meta.url);
mkdirSync(".workspace/research", { recursive: true });
const assets = {
  workerPath: pathToFileURL(
    require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ).href,
  standardFontDataUrl: require
    .resolve("pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf")
    .replace(/[^\\/]+$/, "")
    .replace(/\\/g, "/"),
};
const sample = () =>
  new NodeFile(
    [new Uint8Array(readFileSync("tests/fixtures/reading-sample.pdf"))],
    "sample.pdf",
  ) as unknown as File;
beforeEach(() => {
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("DOMMatrix", DOMMatrix);
  vi.stubGlobal("ImageData", ImageData);
  vi.stubGlobal("Path2D", Path2D);
});
afterEach(() => vi.unstubAllGlobals());

describe("PDF reading and bilingual export", () => {
  it("requires the correct password for a real encrypted PDF", async () => {
    const encrypted = new NodeFile(
      [new Uint8Array(readFileSync("tests/fixtures/reading-protected.pdf"))],
      "protected.pdf",
    ) as unknown as File;
    const options = {
      assets,
      createCanvas: (width: number, height: number) =>
        createCanvas(width, height) as unknown as HTMLCanvasElement,
    };
    await expect(preparePdf(encrypted, options)).rejects.toMatchObject({
      name: "PasswordException",
    });
    await expect(
      preparePdf(encrypted, { ...options, password: "wrong" }),
    ).rejects.toMatchObject({ name: "PasswordException" });
    const prepared = await preparePdf(encrypted, {
      ...options,
      password: "yaku-test-only",
    });
    expect(prepared.source).toContain("Hello world");
  });
  it("renders a real PDF page, extracts real text and exports a self-contained bilingual reading document", async () => {
    const prepared = await preparePdf(sample(), {
      assets,
      createCanvas: (width, height) =>
        createCanvas(width, height) as unknown as HTMLCanvasElement,
    });
    expect(prepared.pages).toHaveLength(1);
    expect(prepared.source).toContain("Hello world");
    expect(prepared.source).toContain("This is a local PDF translation test.");
    expect(prepared.pages[0]?.scanned).toBe(false);
    expect(prepared.pages[0]?.imageDataUrl).toMatch(/^data:image\/png;base64,/);
    // The PNG is also a visual QA artifact for the real source page.
    writeFileSync(
      ".workspace/research/pdf-render.png",
      Buffer.from(prepared.pages[0]!.imageDataUrl.split(",")[1]!, "base64"),
    );
    const translate: Translate = async (request) => ({
      id: request.id,
      text: "<translated> " + request.text,
      elapsedMs: 0,
    });
    const result = await translatePdf(prepared, {
      translate,
      targetLanguage: "fr",
    });
    const output = await result.exportHtml().text();
    const document = new DOMParser().parseFromString(output, "text/html");
    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      prepared.pages[0]!.imageDataUrl,
    );
    expect(document.querySelector(".translations")?.textContent).toContain(
      "<translated> Hello world",
    );
    expect(document.querySelector("translated")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
    expect(document.documentElement.lang).toBe("fr");
  });

  it("honors cancellation before parsing and after an in-flight translation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      preparePdf(sample(), { signal: controller.signal }),
    ).rejects.toThrow();
    const during = new AbortController();
    const prepared = {
      name: "test.pdf",
      source: "Hello",
      pages: [
        {
          number: 1,
          width: 1,
          height: 1,
          imageDataUrl: "",
          paragraphs: [{ source: "Hello" }],
          scanned: false,
        },
      ],
    };
    await expect(
      translatePdf(prepared, {
        targetLanguage: "fr",
        signal: during.signal,
        translate: async (request) => {
          during.abort();
          return { id: request.id, text: "stale", elapsedMs: 0 };
        },
      }),
    ).rejects.toThrow();
    expect(prepared.pages[0]!.paragraphs[0]).not.toHaveProperty("translation");
  });
});
