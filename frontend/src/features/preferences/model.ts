import {
  defaultSettings,
  validReadingColor,
  validGlossaryUrlPattern,
  validSourceLanguage,
  temporaryDomainDurations,
  type Settings,
} from "../../entities/settings";
import { languages } from "../../entities/translation";
import { copy } from "../../shared/i18n";

export function validHostname(value: string): boolean {
  return (
    value.length <= 253 &&
    /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(
      value,
    )
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validTerms(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([key, entry]) =>
        key.trim().length > 0 &&
        typeof entry === "string" &&
        entry.trim().length > 0,
    )
  );
}
export function validateSettings(value: unknown): Settings {
  if (
    !isRecord(value) ||
    !Object.keys(defaultSettings).some((key) => Object.hasOwn(value, key))
  )
    throw new Error(copy.invalidSettings);
  const result = { ...defaultSettings, ...value };
  if (
    ![result.alwaysSourceLanguages, result.neverSourceLanguages].every(
      (list) => Array.isArray(list) && list.every(validSourceLanguage),
    ) ||
    !temporaryDomainDurations.some(
      (value) => value === result.temporaryDomainMinutes,
    )
  )
    throw new Error(copy.invalidSettings);
  result.alwaysSourceLanguages = [...new Set(result.alwaysSourceLanguages)];
  result.neverSourceLanguages = [...new Set(result.neverSourceLanguages)];
  const codes = new Set<string>(languages.map(([code]) => code));
  if (
    !["before", "after"].includes(result.translationPosition) ||
    !["inherit", "system-ui", "sans-serif", "serif", "monospace"].includes(
      result.fontFamily,
    ) ||
    !["inherit", 400, 500, 600, 700].includes(result.fontWeight) ||
    typeof result.lineHeight !== "number" ||
    !Number.isFinite(result.lineHeight) ||
    !(
      result.lineHeight === 0 ||
      (result.lineHeight >= 1.2 && result.lineHeight <= 2.4)
    ) ||
    !validReadingColor(result.textColor) ||
    !validReadingColor(result.backgroundColor)
  )
    throw new Error(copy.invalidSettings);
  if (
    !Array.isArray(result.glossaries) ||
    !result.glossaries.every(
      (collection) =>
        isRecord(collection) &&
        typeof collection.id === "string" &&
        collection.id.trim().length > 0 &&
        typeof collection.name === "string" &&
        collection.name.trim().length > 0 &&
        typeof collection.targetLanguage === "string" &&
        (!collection.targetLanguage || codes.has(collection.targetLanguage)) &&
        Array.isArray(collection.urlPatterns) &&
        collection.urlPatterns.every(
          (pattern) =>
            typeof pattern === "string" && validGlossaryUrlPattern(pattern),
        ) &&
        validTerms(collection.terms),
    ) ||
    new Set(result.glossaries.map((collection) => collection.id)).size !==
      result.glossaries.length
  )
    throw new Error(copy.invalidSettings);
  if (
    !codes.has(result.targetLanguage) ||
    !(result.sourceLanguage === "auto" || codes.has(result.sourceLanguage)) ||
    !["bilingual", "translation"].includes(result.mode) ||
    !["plain", "underline", "highlight", "quote", "blur"].includes(
      result.style,
    ) ||
    !["system", "light", "dark"].includes(result.theme) ||
    typeof result.fontSize !== "number" ||
    !Number.isFinite(result.fontSize) ||
    result.fontSize < 75 ||
    result.fontSize > 150
  )
    throw new Error(copy.invalidSettings);
  for (const key of [
    "autoTranslate",
    "selectionEnabled",
    "hoverEnabled",
    "inputEnabled",
    "inputSpaceTrigger",
    "subtitlesEnabled",
    "showFloatingButton",
    "syncPreferences",
  ] as const)
    if (typeof result[key] !== "boolean") throw new Error(copy.invalidSettings);
  if (
    !Array.isArray(result.siteRules) ||
    !result.siteRules.every(
      (rule) =>
        isRecord(rule) &&
        typeof rule.hostname === "string" &&
        validHostname(rule.hostname) &&
        ["always", "never"].includes(String(rule.action)) &&
        (rule.selector === undefined || typeof rule.selector === "string") &&
        (rule.excludeSelector === undefined ||
          typeof rule.excludeSelector === "string"),
    ) ||
    !validTerms(result.glossary)
  )
    throw new Error(copy.invalidSettings);
  if (
    new Set(result.siteRules.map((rule) => rule.hostname)).size !==
    result.siteRules.length
  )
    throw new Error(copy.invalidSettings);
  return Object.fromEntries(
    Object.keys(defaultSettings).map((key) => [
      key,
      result[key as keyof Settings],
    ]),
  ) as unknown as Settings;
}
