import type { InputPrefixKey, InputTrailingKey } from "./input-keys";
export {
  inputKeyCharacters,
  inputPunctuation,
  inputTriggerPresses,
} from "./input-keys";
export type { InputPrefixKey, InputTrailingKey } from "./input-keys";

export type WorkspaceMode =
  "text" | "writing" | "document" | "subtitle" | "image";

export interface SiteRule {
  hostname: string;
  action: "always" | "never";
  selector?: string;
  excludeSelector?: string;
}
export interface GlossaryCollection {
  id: string;
  name: string;
  targetLanguage: string;
  urlPatterns: string[];
  terms: Record<string, string>;
}
export interface Settings {
  targetLanguage: string;
  sourceLanguage: string;
  mode: "bilingual" | "translation";
  style: "plain" | "underline" | "highlight" | "quote" | "blur";
  theme: "system" | "light" | "dark";
  autoTranslate: boolean;
  alwaysSourceLanguages: string[];
  neverSourceLanguages: string[];
  temporaryDomainMinutes: number;
  selectionEnabled: boolean;
  hoverEnabled: boolean;
  inputEnabled: boolean;
  inputTargetLanguage: string;
  inputMatchConversation: boolean;
  inputMatchPage: boolean;
  inputSpaceTrigger: boolean;
  inputPrefixKey: InputPrefixKey;
  inputTrailingKey: InputTrailingKey;
  subtitlesEnabled: boolean;
  showFloatingButton: boolean;
  syncPreferences: boolean;
  fontSize: number;
  translationPosition: "before" | "after";
  fontFamily: "inherit" | "system-ui" | "sans-serif" | "serif" | "monospace";
  fontWeight: "inherit" | 400 | 500 | 600 | 700;
  lineHeight: number;
  textColor: string;
  backgroundColor: string;
  siteRules: SiteRule[];
  glossary: Record<string, string>;
  glossaries: GlossaryCollection[];
}
export const defaultSettings: Settings = {
  targetLanguage: "zh",
  sourceLanguage: "auto",
  mode: "bilingual",
  style: "plain",
  theme: "system",
  autoTranslate: false,
  alwaysSourceLanguages: [],
  neverSourceLanguages: [],
  temporaryDomainMinutes: 0,
  selectionEnabled: true,
  hoverEnabled: false,
  inputEnabled: true,
  inputTargetLanguage: "en",
  inputMatchConversation: true,
  inputMatchPage: false,
  inputSpaceTrigger: true,
  inputPrefixKey: "/",
  inputTrailingKey: "space",
  subtitlesEnabled: true,
  showFloatingButton: true,
  syncPreferences: false,
  fontSize: 100,
  translationPosition: "after",
  fontFamily: "inherit",
  fontWeight: "inherit",
  lineHeight: 0,
  textColor: "",
  backgroundColor: "",
  siteRules: [],
  glossary: {},
  glossaries: [],
};
export function createDefaultSettings(): Settings {
  return {
    ...defaultSettings,
    alwaysSourceLanguages: [],
    neverSourceLanguages: [],
    siteRules: [],
    glossary: {},
    glossaries: [],
  };
}
export function validReadingColor(value: unknown): value is string {
  return (
    typeof value === "string" && (value === "" || /^#[0-9a-f]{6}$/i.test(value))
  );
}
export {
  resolveGlossary,
  validGlossaryUrlPattern,
  type GlossaryContext,
} from "./glossary";
export {
  resolveSourceLanguagePolicy,
  validSourceLanguage,
  temporaryDomainDurations,
  type SourceLanguageObservation,
  type SourceLanguagePolicy,
} from "./language-policy";
