import { copy } from "../../shared/i18n";
import { Choice, Group, SettingRow, Toggle } from "../../shared/ui";
import { languageOptions, type PreferencesProps } from "./contracts";
export function ActivationPreferences({
  preferences,
  onPreferencesChange,
}: PreferencesProps) {
  const controls = [
    ["autoTranslate", copy.autoTranslate, copy.autoTranslateHelp],
    ["selectionEnabled", copy.selection, copy.selectionHelp],
    ["hoverEnabled", copy.hover, copy.hoverHelp],
    ["inputEnabled", copy.input, copy.inputHelp],
    ["inputSpaceTrigger", copy.inputSpaceTrigger, undefined],
    ["subtitlesEnabled", copy.subtitles, copy.subtitlesHelp],
    ["showFloatingButton", copy.floating, copy.floatingHelp],
  ] as const;
  return (
    <Group>
      {controls.map(([key, label, description]) => (
        <Toggle
          key={key}
          label={label}
          description={description}
          checked={preferences[key]}
          onChange={(checked) => onPreferencesChange({ [key]: checked })}
        />
      ))}
      <SettingRow label={copy.inputTargetLanguage}>
        <Choice
          label={copy.inputTargetLanguage}
          value={preferences.inputTargetLanguage}
          options={languageOptions}
          onChange={(inputTargetLanguage) =>
            onPreferencesChange({ inputTargetLanguage })
          }
        />
      </SettingRow>
    </Group>
  );
}
