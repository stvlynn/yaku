import { copy } from "../../shared/i18n";
import { Choice, Group, SettingRow, Toggle } from "../../shared/ui";
import { languageOptions, type PreferencesProps } from "./contracts";
import {
  inputPunctuation,
  type InputPrefixKey,
  type InputTrailingKey,
} from "../../entities/settings";
export function ActivationPreferences({
  preferences,
  onPreferencesChange,
}: PreferencesProps) {
  const controls = [
    ["autoTranslate", copy.autoTranslate, copy.autoTranslateHelp],
    ["selectionEnabled", copy.selection, copy.selectionHelp],
    ["hoverEnabled", copy.hover, copy.hoverHelp],
    ["inputEnabled", copy.input, undefined],
    ["inputSpaceTrigger", copy.inputSpaceTrigger, undefined],
    ["inputMatchConversation", copy.inputMatchConversation, undefined],
    ["inputMatchPage", copy.inputMatchPage, undefined],
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
      <SettingRow label={copy.inputPrefixKey}>
        <Choice
          label={copy.inputPrefixKey}
          value={preferences.inputPrefixKey}
          options={[
            ...inputPunctuation
              .filter((key) => key !== preferences.inputTrailingKey)
              .map((key) => ({ value: key, label: key })),
            { value: "none", label: copy.inputNoPrefix },
          ]}
          onChange={(key) =>
            onPreferencesChange({ inputPrefixKey: key as InputPrefixKey })
          }
        />
      </SettingRow>
      {preferences.inputSpaceTrigger && (
        <SettingRow label={copy.inputTrailingKey}>
          <Choice
            label={copy.inputTrailingKey}
            value={preferences.inputTrailingKey}
            options={[
              { value: "space", label: copy.inputSpaceKey },
              ...inputPunctuation
                .filter((key) => key !== preferences.inputPrefixKey)
                .map((key) => ({ value: key, label: key })),
            ]}
            onChange={(key) =>
              onPreferencesChange({ inputTrailingKey: key as InputTrailingKey })
            }
          />
        </SettingRow>
      )}
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
