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
  selectionEnabled: boolean;
  hoverEnabled: boolean;
  inputEnabled: boolean;
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
  selectionEnabled: true,
  hoverEnabled: false,
  inputEnabled: true,
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
  return { ...defaultSettings, siteRules: [], glossary: {}, glossaries: [] };
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
