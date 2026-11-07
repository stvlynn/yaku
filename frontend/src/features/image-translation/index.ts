import { renderImageOverlay } from "./lib/overlay";
import type { Translate } from "../../entities/translation";
import { copy } from "../../shared/i18n";
import { createWorker, type Worker, type WorkerOptions } from "tesseract.js";

export interface OcrRegion {
  source: string;
  translation?: string;
  confidence: number;
  bounds: { x: number; y: number; width: number; height: number };
}
export interface ImageOptions {
  ocrLanguage?: string;
  signal?: AbortSignal;
  onProgress?: (progress: number, status: string) => void;
  assets?: Partial<
    Pick<
      WorkerOptions,
      "workerPath" | "corePath" | "langPath" | "gzip" | "cachePath"
    >
  >;
}
export interface ImageTranslationOptions extends ImageOptions {
  translate: Translate;
  targetLanguage: string;
  sourceLanguage?: string;
  onTranslationProgress?: (completed: number, total: number) => void;
}
export interface PreparedImage {
  name: string;
  width: number;
  height: number;
  imageDataUrl: string;
  source: string;
  regions: OcrRegion[];
}
export interface TranslatedImage extends PreparedImage {
  translation: string;
  exportHtml: () => Blob;
  exportPng: () => Promise<Blob>;
}
export const imageAccept = ".png,.jpg,.jpeg,.webp,.bmp";

function localAsset(path: string) {
  return new URL(path, globalThis.location.href).href;
}
function imageDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function prepareImage(
  file: File,
  options: ImageOptions = {},
): Promise<PreparedImage> {
  if (!/^image\/(png|jpeg|webp|bmp|x-ms-bmp)$/i.test(file.type))
    throw new Error(copy.imageInvalidFormat);
  options.signal?.throwIfAborted();
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  bitmap.close();
  const image = await imageDataUrl(file);
  let worker: Worker | undefined;
  let rejectAbort!: (reason: unknown) => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    void worker?.terminate();
    rejectAbort(options.signal?.reason);
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    options.signal?.throwIfAborted();
    for (const path of [options.assets?.workerPath, options.assets?.corePath]) {
      if (!path || /^[A-Za-z]:[\\/]/.test(path)) continue;
      const resolved = new URL(path, globalThis.location.href);
      if (
        resolved.protocol !== location.protocol ||
        resolved.host !== location.host
      )
        throw new Error(copy.ocrLocalAssetsRequired);
    }
    const loading = createWorker(options.ocrLanguage ?? "eng", 1, {
      workerPath: localAsset("/ocr/worker.min.js"),
      corePath: localAsset("/ocr/core"),
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
      ...options.assets,
      workerBlobURL: false,
      logger: (message) =>
        options.onProgress?.(message.progress, message.status),
    });
    void loading.then(
      (created) => {
        if (options.signal?.aborted) void created.terminate();
      },
      () => undefined,
    );
    worker = await Promise.race([loading, aborted]);
    options.signal?.throwIfAborted();
    const { data } = await Promise.race([
      worker.recognize(image, {}, { text: true, blocks: true }),
      aborted,
    ]);
    options.signal?.throwIfAborted();
    const regions: OcrRegion[] = [];
    for (const block of data.blocks ?? [])
      for (const paragraph of block.paragraphs) {
        if (!paragraph.text.trim()) continue;
        const { x0, y0, x1, y1 } = paragraph.bbox;
        regions.push({
          source: paragraph.text.trim(),
          confidence: paragraph.confidence,
          bounds: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
        });
      }
    return {
      name: file.name,
      width,
      height,
      imageDataUrl: image,
      source: data.text.trim(),
      regions,
    };
  } finally {
    options.signal?.removeEventListener("abort", abort);
    await worker?.terminate();
  }
}

export async function translateImage(
  file: File,
  options: ImageTranslationOptions,
): Promise<TranslatedImage> {
  const prepared = await prepareImage(file, options);
  for (let index = 0; index < prepared.regions.length; index++) {
    options.signal?.throwIfAborted();
    const region = prepared.regions[index]!;
    const result = await options.translate({
      id: crypto.randomUUID(),
      text: region.source,
      targetLanguage: options.targetLanguage,
      sourceLanguage: options.sourceLanguage,
    });
    options.signal?.throwIfAborted();
    region.translation = result.text;
    options.onTranslationProgress?.(index + 1, prepared.regions.length);
  }
  const translation = prepared.regions
    .map((region) => region.translation ?? "")
    .join("\n\n");
  return {
    ...prepared,
    translation,
    async exportPng() {
      const bitmap = await createImageBitmap(file);
      try {
        return await renderImageOverlay(
          bitmap,
          prepared.width,
          prepared.height,
          prepared.regions,
        );
      } finally {
        bitmap.close();
      }
    },
    exportHtml() {
      const output = document.implementation.createHTMLDocument(
        copy.imageTranslationTitle,
      );
      output.documentElement.lang = options.targetLanguage;
      const encoding = output.createElement("meta");
      encoding.setAttribute("charset", "utf-8");
      output.head.prepend(encoding);
      const style = output.createElement("style");
      style.textContent =
        "body{font:16px/1.6 system-ui;margin:2rem;color:CanvasText;background:Canvas}img{max-width:100%;height:auto}article{display:grid;grid-template-columns:minmax(0,1fr) minmax(18rem,1fr);gap:2rem}section{white-space:pre-wrap;break-inside:avoid}small{color:GrayText}@media(max-width:700px){article{display:block}}@media print{body{margin:0}article{display:block}img{max-height:80vh;object-fit:contain}section{break-inside:avoid}}";
      output.head.append(style);
      const article = output.createElement("article");
      const image = output.createElement("img");
      image.src = prepared.imageDataUrl;
      image.alt = prepared.name;
      image.width = prepared.width;
      image.height = prepared.height;
      article.append(image);
      const translations = output.createElement("div");
      for (const region of prepared.regions) {
        const section = output.createElement("section");
        const original = output.createElement("small");
        original.textContent = region.source;
        const translated = output.createElement("p");
        translated.textContent = region.translation ?? "";
        section.append(original, translated);
        translations.append(section);
      }
      if (!prepared.regions.length) translations.textContent = copy.imageNoText;
      article.append(translations);
      output.body.append(article);
      return new Blob(["<!doctype html>\n", output.documentElement.outerHTML], {
        type: "text/html;charset=utf-8",
      });
    },
  };
}
