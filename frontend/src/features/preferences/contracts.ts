import type { Settings } from "../../entities/settings";
import { languages } from "../../entities/translation";
import { copy } from "../../shared/i18n";
export type PreferencesProps = {
  preferences: Settings;
  onPreferencesChange: (patch: Partial<Settings>) => void;
};
export interface GlossaryTermsProps {
  terms: Record<string, string>;
  onTermsChange: (terms: Record<string, string>) => void;
}
export const languageOptions = languages.map(([value]) => ({
  value,
  label: copy.languages[value] ?? value,
}));
export const targetLanguageOptions = languageOptions;
export const sourceLanguageOptions = [
  { value: "auto", label: copy.automatic },
  ...languageOptions,
];
