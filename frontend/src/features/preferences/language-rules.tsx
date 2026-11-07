import { useState } from "react";
import { Plus, X } from "lucide-react";
import { sourceLanguages } from "../../shared/languages";
import { copy } from "../../shared/i18n";
import { Button, Choice, IconButton, SettingRow } from "../../shared/ui";
import type { PreferencesProps } from "./contracts";

function LanguageRuleList({
  label,
  description,
  languages,
  onChange,
}: {
  label: string;
  description: string;
  languages: string[];
  onChange: (languages: string[]) => void;
}) {
  const [chosen, setChosen] = useState("en");
  const options = sourceLanguages
    .filter(([code]) => !languages.includes(code))
    .map(([value]) => ({ value, label: copy.languages[value]! }));
  const selected = options.some((option) => option.value === chosen)
    ? chosen
    : (options[0]?.value ?? "");
  return (
    <div className="language-rule">
      <SettingRow label={label} description={description}>
        <div className="language-rule-actions">
          <Choice
            label={label}
            value={selected}
            options={options}
            onChange={setChosen}
            disabled={!options.length}
          />
          <Button
            disabled={!options.length}
            onClick={() => onChange([...languages, selected])}
            aria-label={`${copy.addLanguage}: ${label}`}
          >
            <Plus size={15} />
            {copy.addLanguage}
          </Button>
        </div>
      </SettingRow>
      {languages.length > 0 && (
        <div className="language-rule-values">
          {languages.map((language) => (
            <span key={language} className="language-chip">
              <span>{copy.languages[language]}</span>
              <IconButton
                label={`${copy.removeLanguage}: ${copy.languages[language]} · ${label}`}
                onClick={() =>
                  onChange(languages.filter((value) => value !== language))
                }
              >
                <X size={13} />
              </IconButton>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
export function SourceLanguagePreferences({
  preferences,
  onPreferencesChange,
}: PreferencesProps) {
  return (
    <>
      <LanguageRuleList
        label={copy.alwaysSourceLanguages}
        description={copy.alwaysSourceHelp}
        languages={preferences.alwaysSourceLanguages}
        onChange={(alwaysSourceLanguages) =>
          onPreferencesChange({ alwaysSourceLanguages })
        }
      />
      <LanguageRuleList
        label={copy.neverSourceLanguages}
        description={copy.neverSourceHelp}
        languages={preferences.neverSourceLanguages}
        onChange={(neverSourceLanguages) =>
          onPreferencesChange({ neverSourceLanguages })
        }
      />
    </>
  );
}
