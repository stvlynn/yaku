import { copy } from "../../shared/i18n";
import { Group, Toggle } from "../../shared/ui";
import type { PreferencesProps } from "./contracts";
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
    </Group>
  );
}
