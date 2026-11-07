import type { LanguageDetection } from "./page-translator";

export function alreadyTargetLanguage(
  source: string,
  target: string,
  detection: LanguageDetection,
): boolean {
  if (
    source !== "auto" ||
    !detection.isReliable ||
    detection.languages.length !== 1
  )
    return false;
  const candidate = detection.languages[0];
  if (
    !candidate ||
    candidate.percentage !== 100 ||
    candidate.language === "und"
  )
    return false;
  const normalize = (language: string) =>
    language.toLowerCase().replaceAll("_", "-");
  const language = normalize(candidate.language);
  // Chrome reports the same zh label for Simplified and Traditional text.
  if (language === "zh" || language.startsWith("zh-")) return false;
  return language === normalize(target);
}
