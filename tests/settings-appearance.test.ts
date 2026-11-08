import { describe, expect, it } from "vitest";
import {
  createDefaultSettings,
  defaultSettings,
} from "../frontend/src/entities/settings";
import { validateSettings } from "../frontend/src/features/preferences";
import {
  decodeSyncedSettings,
  encodeSyncedSettings,
  legacySettingsKeys,
  mergeSyncedSettings,
  syncManifestKey,
  syncPrefix,
} from "../frontend/src/features/preferences/sync-codec";

describe("appearance and settings migration", () => {
  it("migrates old local preferences without changing their reading behavior or glossary", () => {
    const legacy = Object.fromEntries(
      legacySettingsKeys.map((key) => [key, defaultSettings[key]]),
    );
    const settings = validateSettings({
      ...legacy,
      fontSize: 125,
      glossary: { term: "译文" },
    });
    expect(settings).toMatchObject({
      fontSize: 125,
      translationPosition: "after",
      fontFamily: "inherit",
      fontWeight: "inherit",
      lineHeight: 0,
      textColor: "",
      backgroundColor: "",
      glossaries: [],
      glossary: { term: "译文" },
    });
  });
  it("validates finite typography values and restricts colors to data instead of CSS declarations", () => {
    const base = createDefaultSettings();
    for (const patch of [
      { lineHeight: Infinity },
      { lineHeight: 0.5 },
      { fontWeight: 123 },
      { fontFamily: "url(https://example.com/font)" },
      { translationPosition: "floating" },
      { textColor: "red;display:none" },
      { backgroundColor: "var(--external)" },
      { textColor: "#xyzxyz" },
    ])
      expect(() => validateSettings({ ...base, ...patch })).toThrow();
    expect(
      validateSettings({
        ...base,
        fontFamily: "serif",
        fontWeight: 600,
        lineHeight: 1.7,
        textColor: "#123AbC",
        backgroundColor: "#faf8f5",
      }),
    ).toMatchObject({
      fontFamily: "serif",
      fontWeight: 600,
      lineHeight: 1.7,
      textColor: "#123AbC",
    });
  });
  it("writes complete current snapshots and migrates v1 without discarding local appearance", () => {
    const current = {
      ...createDefaultSettings(),
      syncPreferences: true,
      fontFamily: "serif" as const,
      translationPosition: "before" as const,
      glossaries: [
        {
          id: "named",
          name: "Named",
          targetLanguage: "zh",
          urlPatterns: [],
          terms: { term: "named" },
        },
      ],
    };
    const v2 = encodeSyncedSettings(current, "new");
    expect((v2[syncManifestKey] as { version: number }).version).toBe(3);
    expect(decodeSyncedSettings(v2)?.settings.glossaries).toEqual(
      current.glossaries,
    );
    const legacy = Object.fromEntries(
      legacySettingsKeys.map((key) => [key, defaultSettings[key]]),
    );
    legacy.targetLanguage = "ja";
    const v1 = {
      [syncManifestKey]: { version: 1, revision: "old", count: 1 },
      [`${syncPrefix}chunk.0`]: {
        revision: "old",
        data: Buffer.from(JSON.stringify(legacy)).toString("base64"),
      },
    };
    const decoded = decodeSyncedSettings(v1)!;
    const merged = mergeSyncedSettings(decoded, current);
    expect(merged).toMatchObject({
      targetLanguage: "ja",
      fontFamily: "serif",
      translationPosition: "before",
      glossaries: current.glossaries,
      syncPreferences: true,
    });
    expect(() =>
      decodeSyncedSettings({
        ...v2,
        [syncManifestKey]: { version: "2", revision: "new", count: 1 },
      }),
    ).toThrow();
  });
});
