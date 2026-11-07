import { copy } from "../../shared/i18n";
import { archiveDocument, xmlTextSegments } from "./lib/archive";
import { markdownDocument } from "./lib/markdown";
import { subtitleDocument } from "./lib/subtitles";
import {
  rangeDocument,
  type DocumentTranslationOptions,
  type PreparedDocument,
  type Segment,
} from "./model/types";
export type {
  DocumentTranslationOptions,
  PreparedDocument,
} from "./model/types";

const supported = [
  "txt",
  "html",
  "htm",
  "md",
  "json",
  "srt",
  "vtt",
  "lrc",
  "ass",
  "epub",
  "docx",
];
export const documentAccept = supported
  .map((extension) => `.${extension}`)
  .join(",");

export async function prepareDocument(file: File): Promise<PreparedDocument> {
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (!supported.includes(extension))
    throw new Error(copy.documentUnsupportedFormat);
  const name = file.name.replace(/(\.[^.]+)$/, ".translated$1");
  if (extension === "epub" || extension === "docx")
    return archiveDocument(
      name,
      new Uint8Array(await file.arrayBuffer()),
      extension,
    );
  const text = await file.text();
  if (extension === "md") return markdownDocument(name, text);
  if (["srt", "vtt", "lrc", "ass"].includes(extension))
    return subtitleDocument(name, text, extension);
  if (extension === "json") {
    const root: { value: unknown } = { value: JSON.parse(text) };
    const segments: Segment[] = [];
    const visit = (
      parent: Record<string, unknown> | unknown[],
      key: string | number,
    ) => {
      const holder = parent as Record<string | number, unknown>;
      const value = holder[key];
      if (typeof value === "string" && value.trim())
        segments.push({
          source: value,
          write: (result, bilingual) => {
            holder[key] = bilingual ? `${value}\n${result}` : result;
          },
        });
      else if (Array.isArray(value))
        value.forEach((_, index) => visit(value, index));
      else if (value && typeof value === "object")
        Object.keys(value).forEach((child) =>
          visit(value as Record<string, unknown>, child),
        );
    };
    visit(root, "value");
    const preview = () => JSON.stringify(root.value, null, 2);
    return {
      name,
      segments,
      preview,
      export: async () => new Blob([preview()], { type: "application/json" }),
    };
  }
  if (extension === "html" || extension === "htm") {
    const document = new DOMParser().parseFromString(text, "text/html");
    const segments = xmlTextSegments(document);
    const preview = () =>
      `<!doctype html>\n${document.documentElement.outerHTML}`;
    return {
      name,
      segments,
      preview,
      export: async () => new Blob([preview()], { type: "text/html" }),
    };
  }
  return rangeDocument(
    name,
    text,
    [...text.matchAll(/[^\r\n]+/g)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
    })),
  );
}

export async function translateDocument(
  document: PreparedDocument,
  options: DocumentTranslationOptions,
): Promise<Blob> {
  const { segments } = document;
  for (let index = 0; index < segments.length; index++) {
    options.signal?.throwIfAborted();
    const segment = segments[index]!;
    const translated = await options.translate({
      id: crypto.randomUUID(),
      text: segment.source,
      context: segment.context,
      targetLanguage: options.targetLanguage,
    });
    options.signal?.throwIfAborted();
    segment.write(translated.text, options.bilingual);
    options.onProgress?.(index + 1, segments.length);
  }
  options.signal?.throwIfAborted();
  document.setLanguage?.(options.targetLanguage, options.bilingual);
  return document.export();
}
