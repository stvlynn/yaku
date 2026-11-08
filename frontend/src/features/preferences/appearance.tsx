import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { validReadingColor, type Settings } from "../../entities/settings";
import { copy } from "../../shared/i18n";
import {
  readingTextColors,
  readingBackgroundColors,
} from "../../shared/styles/reading-presets";
import { Choice, IconButton, Notice, SettingRow } from "../../shared/ui";
import type { PreferencesProps } from "./contracts";
type ColorPreset =
  (typeof readingTextColors)[number] | (typeof readingBackgroundColors)[number];

function ReadingColor({
  label,
  value,
  presets,
  onChange,
}: {
  label: string;
  value: string;
  presets: readonly { value: string; label: ColorPreset["label"] }[];
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft(value);
    setError("");
  }, [value]);
  const options = presets.map((item) => ({
    value: item.value,
    label: copy[item.label] as string,
  }));
  if (!options.some((option) => option.value === value))
    options.push({ value, label: `${copy.customColor} (${value})` });
  function commit() {
    const next = draft.trim();
    if (!validReadingColor(next)) {
      setError(copy.invalidReadingColor);
      return;
    }
    setError("");
    onChange(next.toLowerCase());
  }
  return (
    <>
      <SettingRow label={label}>
        <div className="color-controls">
          <span
            className="reading-swatch"
            aria-hidden="true"
            style={value ? { backgroundColor: value } : undefined}
          />
          <Choice
            label={`${label} ${copy.colorPreset}`}
            value={value}
            options={options}
            onChange={onChange}
          />
          <input
            className="input"
            aria-label={label}
            placeholder={copy.hexColor}
            spellCheck={false}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
            }}
          />
          {value && (
            <IconButton
              label={`${copy.clearReadingColor}: ${label}`}
              onClick={() => onChange("")}
            >
              <X size={15} />
            </IconButton>
          )}
        </div>
      </SettingRow>
      {error && <Notice>{error}</Notice>}
    </>
  );
}

export function AppearancePreferences({
  preferences,
  onPreferencesChange,
}: PreferencesProps) {
  const lineOptions = [
    { value: "0", label: copy.pageSpacing },
    ...[1.2, 1.4, 1.6, 1.8, 2, 2.4].map((value) => ({
      value: String(value),
      label: String(value),
    })),
  ];
  if (
    !lineOptions.some(
      (option) => option.value === String(preferences.lineHeight),
    )
  )
    lineOptions.push({
      value: String(preferences.lineHeight),
      label: String(preferences.lineHeight),
    });
  return (
    <details className="reading-details">
      <summary>{copy.typographyColors}</summary>
      <SettingRow label={copy.fontFamily}>
        <Choice
          label={copy.fontFamily}
          value={preferences.fontFamily}
          options={[
            { value: "inherit", label: copy.pageFont },
            { value: "system-ui", label: copy.fontSystem },
            { value: "sans-serif", label: copy.fontSans },
            { value: "serif", label: copy.fontSerif },
            { value: "monospace", label: copy.fontMono },
          ]}
          onChange={(fontFamily) =>
            onPreferencesChange({
              fontFamily: fontFamily as Settings["fontFamily"],
            })
          }
        />
      </SettingRow>
      <SettingRow label={copy.fontWeight}>
        <Choice
          label={copy.fontWeight}
          value={String(preferences.fontWeight)}
          options={[
            { value: "inherit", label: copy.pageWeight },
            { value: "400", label: copy.weightNormal },
            { value: "500", label: copy.weightMedium },
            { value: "600", label: copy.weightSemibold },
            { value: "700", label: copy.weightBold },
          ]}
          onChange={(value) =>
            onPreferencesChange({
              fontWeight:
                value === "inherit"
                  ? "inherit"
                  : (Number(value) as Settings["fontWeight"]),
            })
          }
        />
      </SettingRow>
      <SettingRow label={copy.lineHeight}>
        <Choice
          label={copy.lineHeight}
          value={String(preferences.lineHeight)}
          options={lineOptions}
          onChange={(value) =>
            onPreferencesChange({ lineHeight: Number(value) })
          }
        />
      </SettingRow>
      <ReadingColor
        label={copy.textColor}
        value={preferences.textColor}
        presets={readingTextColors}
        onChange={(textColor) => onPreferencesChange({ textColor })}
      />
      <ReadingColor
        label={copy.backgroundColor}
        value={preferences.backgroundColor}
        presets={readingBackgroundColors}
        onChange={(backgroundColor) => onPreferencesChange({ backgroundColor })}
      />
    </details>
  );
}
