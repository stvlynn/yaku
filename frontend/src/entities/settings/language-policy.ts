import { sourceLanguages } from "../../shared/languages";
import type { Settings } from "./index";

const sourceCodes = new Set<string>(sourceLanguages.map(([code]) => code));
export const temporaryDomainDurations = [0, 5, 10, 15, 30, 60] as const;
export interface SourceLanguageObservation {
  language: string;
  reliable: boolean;
}
export type SourceLanguagePolicy = "always" | "never" | "default";
export function validSourceLanguage(value: unknown): value is string {
  return typeof value === "string" && sourceCodes.has(value);
}
/** Generic Chinese is a source policy, not a claim that CLD recognizes script variants. */
export function resolveSourceLanguagePolicy(
  settings: Pick<Settings, "alwaysSourceLanguages" | "neverSourceLanguages">,
  observation?: SourceLanguageObservation,
): SourceLanguagePolicy {
  if (!observation?.reliable) return "default";
  const language =
    observation.language === "zh-Hant" ? "zh" : observation.language;
  if (!validSourceLanguage(language)) return "default";
  if (settings.neverSourceLanguages.includes(language)) return "never";
  if (settings.alwaysSourceLanguages.includes(language)) return "always";
  return "default";
}
