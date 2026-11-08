import { languages } from "../../../shared/languages";
const supported = new Set<string>(languages.map(([code]) => code));
/** Track metadata is a BCP 47 tag, never a label or an ASR provenance signal. */
export function nativeTrackLanguage(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return;
  try {
    const locale = new Intl.Locale(value);
    if (locale.language === "zh")
      return locale.script
        ? locale.script === "Hant"
          ? "zh-Hant"
          : "zh"
        : ["TW", "HK", "MO"].includes(locale.region ?? "")
          ? "zh-Hant"
          : "zh";
    const language = locale.language === "fil" ? "tl" : locale.language;
    return supported.has(language) ? language : undefined;
  } catch {
    return;
  }
}
