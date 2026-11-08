import type { Translate } from "../../entities/translation";
import { copy } from "../../shared/i18n";
import { exportReadingPdf, type PdfExportOptions } from "./export-pdf";
export type { PdfExportOptions } from "./export-pdf";

export interface PdfParagraph {
  source: string;
  translation?: string;
}
export interface PdfPage {
  number: number;
  width: number;
  height: number;
  pointWidth?: number;
  pointHeight?: number;
  imageDataUrl: string;
  paragraphs: PdfParagraph[];
  scanned: boolean;
}
export interface PdfOptions {
  signal?: AbortSignal;
  password?: string;
  renderScale?: number;
  onProgress?: (completed: number, total: number) => void;
  assets?: {
    workerPath?: string;
    cMapUrl?: string;
    standardFontDataUrl?: string;
    wasmUrl?: string;
  };
  recognize?: (image: Blob) => Promise<{ source: string }>;
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
}
export interface PreparedPdf {
  name: string;
  pages: PdfPage[];
  source: string;
}
export interface PdfTranslationOptions {
  translate: Translate;
  targetLanguage: string;
  sourceLanguage?: string;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}
export interface TranslatedPdf extends PreparedPdf {
  translation: string;
  exportHtml: () => Blob;
  exportPdf: (options?: PdfExportOptions) => Promise<Blob>;
}
const localAsset = (path: string) =>
  new URL(path, globalThis.location.href).href;

/** Render original pages unchanged and extract a separate reading stream; this does not reconstruct PDF layout. */
export async function preparePdf(
  file: File,
  options: PdfOptions = {},
): Promise<PreparedPdf> {
  options.signal?.throwIfAborted();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc =
    options.assets?.workerPath ?? localAsset("/pdf/pdf.worker.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    password: options.password,
    cMapUrl: options.assets?.cMapUrl ?? localAsset("/pdf/cmaps/"),
    cMapPacked: true,
    standardFontDataUrl:
      options.assets?.standardFontDataUrl ?? localAsset("/pdf/standard_fonts/"),
    wasmUrl: options.assets?.wasmUrl ?? localAsset("/pdf/wasm/"),
    enableXfa: false,
    stopAtErrors: true,
  });
  const abort = () => {
    void task.destroy();
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    const pdf = await task.promise;
    const pages: PdfPage[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      options.signal?.throwIfAborted();
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: options.renderScale ?? 1.5 });
      const pointViewport = page.getViewport({ scale: 1 });
      const canvas =
        options.createCanvas?.(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height),
        ) ?? document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error(copy.pdfCanvasUnavailable);
      const render = page.render({
        canvas: null,
        canvasContext: context,
        viewport,
      });
      const cancelRender = () => render.cancel();
      options.signal?.addEventListener("abort", cancelRender, { once: true });
      try {
        await render.promise;
      } finally {
        options.signal?.removeEventListener("abort", cancelRender);
      }
      options.signal?.throwIfAborted();
      const content = await page.getTextContent();
      const paragraphs: PdfParagraph[] = [];
      let line = "";
      let lastY: number | undefined;
      function flush() {
        if (line.trim()) paragraphs.push({ source: line.trim() });
        line = "";
      }
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5] as number;
        if (
          lastY !== undefined &&
          Math.abs(y - lastY) > Math.max(2, item.height * 0.5)
        )
          flush();
        line += `${line && !/\s$/.test(line) && !/^\s/.test(item.str) ? " " : ""}${item.str}`;
        if (item.hasEOL) flush();
        lastY = y;
      }
      flush();
      const scanned = !paragraphs.length;
      if (scanned && options.recognize) {
        const image = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) =>
              blob
                ? resolve(blob)
                : reject(new Error(copy.pdfCanvasUnavailable)),
            "image/png",
          ),
        );
        const result = await options.recognize(image);
        if (result.source.trim())
          paragraphs.push({ source: result.source.trim() });
      }
      options.signal?.throwIfAborted();
      pages.push({
        number,
        width: viewport.width,
        height: viewport.height,
        pointWidth: pointViewport.width,
        pointHeight: pointViewport.height,
        imageDataUrl: canvas.toDataURL("image/png"),
        paragraphs,
        scanned,
      });
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      options.onProgress?.(number, pdf.numPages);
    }
    return {
      name: file.name,
      pages,
      source: pages
        .map((page) =>
          page.paragraphs.map((paragraph) => paragraph.source).join("\n"),
        )
        .join("\n\n"),
    };
  } finally {
    options.signal?.removeEventListener("abort", abort);
    await task.destroy();
  }
}

export async function translatePdf(
  prepared: PreparedPdf,
  options: PdfTranslationOptions,
): Promise<TranslatedPdf> {
  const total = prepared.pages.reduce(
    (sum, page) => sum + page.paragraphs.length,
    0,
  );
  let completed = 0;
  for (const page of prepared.pages)
    for (const paragraph of page.paragraphs) {
      options.signal?.throwIfAborted();
      const result = await options.translate({
        id: crypto.randomUUID(),
        text: paragraph.source,
        targetLanguage: options.targetLanguage,
        sourceLanguage: options.sourceLanguage,
      });
      options.signal?.throwIfAborted();
      paragraph.translation = result.text;
      options.onProgress?.(++completed, total);
    }
  return {
    ...prepared,
    exportPdf: (exportOptions) =>
      exportReadingPdf(prepared.pages, options.targetLanguage, exportOptions),
    translation: prepared.pages
      .map((page) =>
        page.paragraphs
          .map((paragraph) => paragraph.translation ?? "")
          .join("\n"),
      )
      .join("\n\n"),
    exportHtml() {
      const output = document.implementation.createHTMLDocument(
        copy.pdfTranslationTitle,
      );
      output.documentElement.lang = options.targetLanguage;
      const encoding = output.createElement("meta");
      encoding.setAttribute("charset", "utf-8");
      output.head.prepend(encoding);
      const style = output.createElement("style");
      style.textContent =
        "body{font:16px/1.6 system-ui;margin:2rem;color:CanvasText;background:Canvas}.page{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:2rem;margin:0 0 3rem;align-items:start}img{max-width:100%;height:auto}p{white-space:pre-wrap;overflow-wrap:anywhere}small{color:GrayText}@media(max-width:700px){.page{display:block}}@media print{body{margin:0}.page{break-before:page;display:block}.page:first-child{break-before:auto}img{max-height:95vh;object-fit:contain;display:block;margin:auto}.translations{break-before:page}p{break-inside:avoid}}";
      output.head.append(style);
      for (const page of prepared.pages) {
        const section = output.createElement("section");
        section.className = "page";
        const image = output.createElement("img");
        image.src = page.imageDataUrl;
        image.alt = `${copy.pdfOriginalPage} ${page.number}`;
        image.width = page.width;
        image.height = page.height;
        const translations = output.createElement("div");
        translations.className = "translations";
        const heading = output.createElement("h2");
        heading.textContent = `${copy.pdfTranslationPage} ${page.number}`;
        translations.append(heading);
        for (const paragraph of page.paragraphs) {
          const original = output.createElement("small");
          original.textContent = paragraph.source;
          const translated = output.createElement("p");
          translated.textContent = paragraph.translation ?? "";
          translations.append(original, translated);
        }
        if (!page.paragraphs.length) {
          const warning = output.createElement("p");
          warning.textContent = copy.pdfScannedPage;
          translations.append(warning);
        }
        section.append(image, translations);
        output.body.append(section);
      }
      return new Blob(["<!doctype html>\n", output.documentElement.outerHTML], {
        type: "text/html;charset=utf-8",
      });
    },
  };
}
