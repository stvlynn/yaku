import { PDFDocument } from "pdf-lib";
import type { PdfPage } from "./index";
import { paginateParagraphs } from "./layout";
import { copy, pdfReadingPageLabel } from "../../shared/i18n";

export interface PdfExportOptions {
  signal?: AbortSignal;
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
  palette?: { paper: string; ink: string; muted: string; line: string };
}

function paperPalette() {
  const style = getComputedStyle(document.documentElement);
  const values = ["--ink-50", "--ink-900", "--ink-500", "--ink-200"].map(
    (token) => style.getPropertyValue(token).trim(),
  );
  if (values.some((value) => !value)) throw new Error(copy.pdfThemeUnavailable);
  return {
    paper: values[0]!,
    ink: values[1]!,
    muted: values[2]!,
    line: values[3]!,
  };
}

/** Original page images alternate with paginated rasterized translations; no source layout is reconstructed. */
export async function exportReadingPdf(
  pages: readonly PdfPage[],
  language: string,
  options: PdfExportOptions = {},
): Promise<Blob> {
  options.signal?.throwIfAborted();
  const palette = options.palette ?? paperPalette();
  const output = await PDFDocument.create();
  output.setTitle(copy.pdfTranslationTitle);
  output.setCreator(copy.app);
  output.setSubject(copy.pdfReadingEdition);
  const width = 595.28;
  const height = 841.89;
  const margin = 48;
  const top = 90;
  const bottom = 58;
  const lineHeight = 19;
  const ratio = 2;
  const fontStack =
    '"Segoe UI", "Microsoft YaHei", "Noto Sans SC", "Nirmala UI", "Noto Sans Devanagari", "Noto Sans Arabic", "Segoe UI Emoji", sans-serif';
  const font = `12.5px ${fontStack}`;
  for (const source of pages) {
    options.signal?.throwIfAborted();
    if (
      source.paragraphs.some((paragraph) => paragraph.translation === undefined)
    )
      throw new Error(copy.pdfTranslationIncomplete);
    const pointWidth = source.pointWidth ?? source.width;
    const pointHeight = source.pointHeight ?? source.height;
    if (!(pointWidth > 0) || !(pointHeight > 0))
      throw new Error(copy.pdfLayoutInvalid);
    const image = await output.embedPng(source.imageDataUrl);
    const original = output.addPage([pointWidth, pointHeight]);
    original.drawImage(image, {
      x: 0,
      y: 0,
      width: pointWidth,
      height: pointHeight,
    });
    const canvas =
      options.createCanvas?.(
        Math.ceil(width * ratio),
        Math.ceil(height * ratio),
      ) ?? document.createElement("canvas");
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) throw new Error(copy.pdfCanvasUnavailable);
    context.scale(ratio, ratio);
    context.font = font;
    const textPages = paginateParagraphs(
      source.paragraphs.length
        ? source.paragraphs.map((paragraph) => paragraph.translation!)
        : [copy.pdfScannedPage],
      {
        width: width - 2 * margin - 4,
        height: height - top - bottom,
        lineHeight,
        paragraphGap: 12,
        language,
        measure: (text) => {
          const metrics = context.measureText(text);
          return Math.max(
            metrics.width,
            metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
          );
        },
      },
    );
    for (const [index, page] of textPages.entries()) {
      options.signal?.throwIfAborted();
      context.fillStyle = palette.paper;
      context.fillRect(0, 0, width, height);
      context.textBaseline = "top";
      context.direction = "ltr";
      context.textAlign = "left";
      context.fillStyle = palette.ink;
      context.font = `600 16px ${fontStack}`;
      context.fillText(pdfReadingPageLabel(source.number), margin, 36);
      context.fillStyle = palette.line;
      context.fillRect(margin, 78, width - 2 * margin, 0.5);
      context.font = font;
      context.fillStyle = palette.ink;
      for (const line of page.lines) {
        context.direction = line.direction;
        context.textAlign = line.direction === "rtl" ? "right" : "left";
        context.fillText(
          line.text,
          line.direction === "rtl" ? width - margin - 2 : margin + 2,
          top + line.y,
        );
      }
      context.direction = "ltr";
      context.textAlign = "right";
      context.font = `9px ${fontStack}`;
      context.fillStyle = palette.muted;
      context.fillText(
        `${index + 1} / ${textPages.length}`,
        width - margin,
        height - 35,
      );
      const translatedImage = await output.embedPng(
        canvas.toDataURL("image/png"),
      );
      output
        .addPage([width, height])
        .drawImage(translatedImage, { x: 0, y: 0, width, height });
    }
    canvas.width = 0;
    canvas.height = 0;
  }
  options.signal?.throwIfAborted();
  return new Blob([new Uint8Array(await output.save())], {
    type: "application/pdf",
  });
}
