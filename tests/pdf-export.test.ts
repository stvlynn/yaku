// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { Blob as NodeBlob } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { exportReadingPdf } from "../frontend/src/features/pdf-translation/export-pdf";

const palette = {
  paper: "#ffffff",
  ink: "#14120e",
  muted: "#6c665f",
  line: "#dfd9d0",
};
beforeEach(() => vi.stubGlobal("Blob", NodeBlob));
afterEach(() => vi.unstubAllGlobals());
describe("binary PDF reading edition", () => {
  it("writes real PDF pages at original dimensions and paginates long multilingual translations", async () => {
    const original = createCanvas(600, 800);
    const drawing = original.getContext("2d");
    drawing.fillStyle = "#ffffff";
    drawing.fillRect(0, 0, 600, 800);
    drawing.fillStyle = "#14120e";
    drawing.font = "28px Arial";
    drawing.fillText("Original page stays intact.", 40, 60);
    const imageDataUrl = original.toDataURL("image/png");
    const body = [
      "你好，世界。这是清晰可读的中文。",
      "مرحبا بالعالم. ترجمة متعددة اللغات.",
      "क्षेत्र में आपका स्वागत है।",
      "A multilingual reading edition preserves every paragraph.",
      "👩🏽‍💻 é combining characters stay together.",
    ].join("\n");
    const blob = await exportReadingPdf(
      [
        {
          number: 1,
          width: 600,
          height: 800,
          pointWidth: 300,
          pointHeight: 400,
          imageDataUrl,
          scanned: false,
          paragraphs: [
            {
              source: "Original text",
              translation: Array(22).fill(body).join("\n\n"),
            },
          ],
        },
      ],
      "zh",
      {
        palette,
        createCanvas: (width, height) =>
          createCanvas(width, height) as unknown as HTMLCanvasElement,
      },
    );
    const buffer = new Uint8Array(
      await (blob as unknown as NodeBlob).arrayBuffer(),
    );
    expect(new TextDecoder().decode(buffer.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(buffer);
    expect(pdf.getPageCount()).toBeGreaterThan(3);
    expect(pdf.getPage(0).getWidth()).toBe(300);
    expect(pdf.getPage(0).getHeight()).toBe(400);
    expect(pdf.getPage(1).getWidth()).toBeCloseTo(595.28);
    expect(pdf.getPage(1).getHeight()).toBeCloseTo(841.89);
    mkdirSync(".workspace/qa", { recursive: true });
    writeFileSync(".workspace/qa/multilingual-reading.pdf", buffer);
  });
  it("rejects unfinished translations and honors a cancelled export", async () => {
    const canvas = createCanvas(20, 20);
    const page = {
      number: 1,
      width: 20,
      height: 20,
      imageDataUrl: canvas.toDataURL("image/png"),
      scanned: false,
      paragraphs: [{ source: "text" }],
    };
    await expect(exportReadingPdf([page], "en", { palette })).rejects.toThrow(
      "Finish translating",
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      exportReadingPdf([page], "en", { palette, signal: controller.signal }),
    ).rejects.toThrow();
  });
});
