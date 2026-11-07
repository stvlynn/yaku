import type { Settings } from "../../entities/settings";
import { copy, percentage } from "../../shared/i18n";
import { Choice, Group, SettingRow } from "../../shared/ui";
import {
  languageOptions,
  sourceLanguageOptions,
  type PreferencesProps,
} from "./contracts";
import { AppearancePreferences } from "./appearance";
import { SourceLanguagePreferences } from "./language-rules";
export function LanguagePreferences({
  preferences,
  onPreferencesChange,
  compact = false,
}: PreferencesProps & { compact?: boolean }) {
  return compact ? (
    <div className="popup-controls">
      <div>
        <span className="field-label">{copy.target}</span>
        <Choice
          label={copy.target}
          value={preferences.targetLanguage}
          options={languageOptions}
          onChange={(targetLanguage) => onPreferencesChange({ targetLanguage })}
        />
      </div>
      <div className="popup-mode" role="group" aria-label={copy.pageMode}>
        {(["bilingual", "translation"] as const).map((mode) => (
          <button
            type="button"
            key={mode}
            aria-pressed={preferences.mode === mode}
            onClick={() => onPreferencesChange({ mode })}
          >
            {mode === "bilingual" ? copy.bilingual : copy.translationOnly}
          </button>
        ))}
      </div>
    </div>
  ) : (
    <Group title={copy.supportedLanguages}>
      <SettingRow label={copy.source}>
        <Choice
          label={copy.source}
          value={preferences.sourceLanguage}
          options={sourceLanguageOptions}
          onChange={(sourceLanguage) => onPreferencesChange({ sourceLanguage })}
        />
      </SettingRow>
      <SettingRow label={copy.target}>
        <Choice
          label={copy.target}
          value={preferences.targetLanguage}
          options={languageOptions}
          onChange={(targetLanguage) => onPreferencesChange({ targetLanguage })}
        />
      </SettingRow>
      <SourceLanguagePreferences
        preferences={preferences}
        onPreferencesChange={onPreferencesChange}
      />
    </Group>
  );
}

export function ReadingPreferences({
  preferences,
  onPreferencesChange,
}: PreferencesProps) {
  return (
    <Group title={copy.reading}>
      <SettingRow label={copy.translationPosition}>
        <Choice
          label={copy.translationPosition}
          value={preferences.translationPosition}
          options={[
            { value: "after", label: copy.positionAfter },
            { value: "before", label: copy.positionBefore },
          ]}
          onChange={(translationPosition) =>
            onPreferencesChange({
              translationPosition:
                translationPosition as Settings["translationPosition"],
            })
          }
        />
      </SettingRow>
      <SettingRow label={copy.pageMode}>
        <Choice
          label={copy.pageMode}
          value={preferences.mode}
          options={[
            { value: "bilingual", label: copy.bilingual },
            { value: "translation", label: copy.translationOnly },
          ]}
          onChange={(mode) =>
            onPreferencesChange({ mode: mode as Settings["mode"] })
          }
        />
      </SettingRow>
      <SettingRow label={copy.style}>
        <Choice
          label={copy.style}
          value={preferences.style}
          options={(
            ["plain", "underline", "highlight", "quote", "blur"] as const
          ).map((value) => ({ value, label: copy[value] }))}
          onChange={(style) =>
            onPreferencesChange({ style: style as Settings["style"] })
          }
        />
      </SettingRow>
      <SettingRow label={copy.fontSize}>
        <div className="text-size">
          <input
            aria-label={copy.fontSize}
            type="range"
            min={75}
            max={150}
            step={5}
            value={preferences.fontSize}
            onChange={(event) =>
              onPreferencesChange({ fontSize: Number(event.target.value) })
            }
          />
          <output>{percentage(preferences.fontSize)}</output>
        </div>
      </SettingRow>
      <SettingRow label={copy.appearance}>
        <Choice
          label={copy.appearance}
          value={preferences.theme}
          options={(["system", "light", "dark"] as const).map((value) => ({
            value,
            label: copy[value],
          }))}
          onChange={(theme) =>
            onPreferencesChange({ theme: theme as Settings["theme"] })
          }
        />
      </SettingRow>
      <AppearancePreferences
        preferences={preferences}
        onPreferencesChange={onPreferencesChange}
      />
    </Group>
  );
}
