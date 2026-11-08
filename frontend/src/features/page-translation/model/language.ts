import type { LanguageDetection } from "./page-translator";
import type { SourceLanguageObservation } from "../../../entities/settings";

export function reliableLanguageObservation(
  detection: LanguageDetection,
): SourceLanguageObservation | undefined {
  const candidate = detection.languages[0];
  if (
    !detection.isReliable ||
    detection.languages.length !== 1 ||
    !candidate ||
    candidate.percentage !== 100 ||
    candidate.language === "und"
  )
    return;
  return { language: candidate.language, reliable: true };
}

export function alreadyTargetLanguage(
  source: string,
  target: string,
  detection: LanguageDetection,
): boolean {
  const observation = reliableLanguageObservation(detection);
  if (source !== "auto" || !observation) return false;
  const normalize = (language: string) =>
    language.toLowerCase().replaceAll("_", "-");
  const language = normalize(observation.language);
  // Chrome reports the same zh label for Simplified and Traditional text.
  if (language === "zh" || language.startsWith("zh-")) return false;
  return language === normalize(target);
}
