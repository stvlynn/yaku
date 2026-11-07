export type TranslationMode = "bilingual" | "translation";
export type TranslationStyle =
  "plain" | "underline" | "highlight" | "quote" | "blur";
export interface TranslationRequest {
  id: string;
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
  context?: string;
  glossary?: Record<string, string>;
  task?: "translate" | "rewrite" | "explain";
  writingStyle?: "grammar" | "polite" | "concise" | "formal";
}
export interface TranslationResult {
  id: string;
  text: string;
  elapsedMs: number;
}
export interface ModelStatus {
  phase: "idle" | "downloading" | "loading" | "ready" | "translating" | "error";
  progress?: number;
  file?: string;
  error?: string;
}
export type Translate = (
  request: TranslationRequest,
) => Promise<TranslationResult>;

export function isModelStatus(value: unknown): value is ModelStatus {
  return (
    typeof value === "object" &&
    value !== null &&
    "phase" in value &&
    [
      "idle",
      "downloading",
      "loading",
      "ready",
      "translating",
      "error",
    ].includes(String(value.phase))
  );
}

export const languages = [
  ["en", "English"],
  ["zh", "Chinese"],
  ["zh-Hant", "Traditional Chinese"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["fr", "French"],
  ["de", "German"],
  ["es", "Spanish"],
  ["pt", "Portuguese"],
  ["it", "Italian"],
  ["ru", "Russian"],
  ["ar", "Arabic"],
  ["hi", "Hindi"],
  ["th", "Thai"],
  ["vi", "Vietnamese"],
  ["id", "Indonesian"],
  ["tr", "Turkish"],
  ["pl", "Polish"],
  ["nl", "Dutch"],
  ["uk", "Ukrainian"],
  ["cs", "Czech"],
  ["ro", "Romanian"],
  ["hu", "Hungarian"],
  ["el", "Greek"],
  ["he", "Hebrew"],
  ["fa", "Persian"],
  ["ms", "Malay"],
  ["tl", "Filipino"],
  ["bn", "Bengali"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["ur", "Urdu"],
  ["bo", "Tibetan"],
] as const;

export function languageName(code: string): string {
  return languages.find(([id]) => id === code)?.[1] ?? code;
}
export { ocrLanguageFor } from "./ocr";
