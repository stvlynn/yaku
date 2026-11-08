import type { Translate } from "../../../entities/translation";

export interface DocumentTranslationOptions {
  translate: Translate;
  targetLanguage: string;
  bilingual: boolean;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}
export interface Segment {
  source: string;
  context?: string;
  write: (translation: string, bilingual: boolean) => void;
}
export interface PreparedDocument {
  name: string;
  segments: Segment[];
  export: () => Promise<Blob>;
  preview: () => string;
  translationPreview?: () => string;
  setLanguage?: (language: string, bilingual: boolean) => void;
}

export function rangeDocument(
  name: string,
  source: string,
  ranges: {
    start: number;
    end: number;
    encode?: (text: string) => string;
    separator?: string;
  }[],
  type = "text/plain;charset=utf-8",
): PreparedDocument {
  const replacements = new Map<number, string>();
  const segments: Segment[] = ranges
    .filter(({ start, end }) => source.slice(start, end).trim())
    .map(({ start, end, encode = (text) => text, separator = "\n" }) => ({
      source: source.slice(start, end),
      write: (text, bilingual) =>
        replacements.set(
          start,
          `${bilingual ? source.slice(start, end) + separator : ""}${source.slice(start, end).match(/^\s*/)?.[0] ?? ""}${encode(text.trim())}${source.slice(start, end).match(/\s*$/)?.[0] ?? ""}`,
        ),
    }));
  const preview = () => {
    let result = source;
    for (const { start, end } of [...ranges].sort(
      (a, b) => b.start - a.start,
    )) {
      if (replacements.has(start))
        result =
          result.slice(0, start) + replacements.get(start)! + result.slice(end);
    }
    return result;
  };
  return {
    name,
    segments,
    preview,
    export: async () => new Blob([preview()], { type }),
  };
}
