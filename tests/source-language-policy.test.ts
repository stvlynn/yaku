import { describe, expect, it } from "vitest";
import {
  createDefaultSettings,
  resolveSourceLanguagePolicy,
} from "../frontend/src/entities/settings";
import { validateSettings } from "../frontend/src/features/preferences";
import {
  decodeSyncedSettings,
  encodeSyncedSettings,
  mergeSyncedSettings,
  syncManifestKey,
  syncPrefix,
  version2SettingsKeys,
} from "../frontend/src/features/preferences/sync-codec";

describe("source-language preference policy", () => {
  it("requires a reliable supported observation and gives never priority without blocking unknown languages", () => {
    const settings = {
      alwaysSourceLanguages: ["en", "zh"],
      neverSourceLanguages: ["en", "ja"],
    };
    expect(resolveSourceLanguagePolicy(settings)).toBe("default");
    for (const language of ["en", "zh", "ja", "auto", "unknown", ""])
      expect(
        resolveSourceLanguagePolicy(settings, { language, reliable: false }),
      ).toBe("default");
    expect(
      resolveSourceLanguagePolicy(settings, { language: "en", reliable: true }),
    ).toBe("never");
    expect(
      resolveSourceLanguagePolicy(settings, { language: "zh", reliable: true }),
    ).toBe("always");
    expect(
      resolveSourceLanguagePolicy(settings, {
        language: "zh-Hant",
        reliable: true,
      }),
    ).toBe("always");
    expect(
      resolveSourceLanguagePolicy(settings, { language: "fr", reliable: true }),
    ).toBe("default");
    expect(
      resolveSourceLanguagePolicy(
        {
          alwaysSourceLanguages: ["unknown", "auto"],
          neverSourceLanguages: [],
        },
        { language: "unknown", reliable: true },
      ),
    ).toBe("default");
  });
  it("migrates old local records and validates language codes and duration presets", () => {
    expect(validateSettings({ targetLanguage: "en" })).toMatchObject({
      alwaysSourceLanguages: [],
      neverSourceLanguages: [],
      temporaryDomainMinutes: 0,
    });
    for (const patch of [
      { alwaysSourceLanguages: ["auto"] },
      { neverSourceLanguages: ["zh-Hant"] },
      { alwaysSourceLanguages: "en" },
      { temporaryDomainMinutes: -1 },
      { temporaryDomainMinutes: 12 },
      { temporaryDomainMinutes: "15" },
      { temporaryDomainMinutes: Infinity },
    ])
      expect(() =>
        validateSettings({ ...createDefaultSettings(), ...patch }),
      ).toThrow();
    expect(
      validateSettings({
        ...createDefaultSettings(),
        alwaysSourceLanguages: ["en"],
        neverSourceLanguages: ["en"],
        temporaryDomainMinutes: 15,
      }),
    ).toMatchObject({
      alwaysSourceLanguages: ["en"],
      neverSourceLanguages: ["en"],
      temporaryDomainMinutes: 15,
    });
    const first = createDefaultSettings();
    first.alwaysSourceLanguages.push("en");
    expect(createDefaultSettings().alwaysSourceLanguages).toEqual([]);
  });
  it("writes complete v3 snapshots, preserves policy on v2 input, and rejects incomplete v3", () => {
    const local = {
      ...createDefaultSettings(),
      syncPreferences: true,
      alwaysSourceLanguages: ["en"],
      neverSourceLanguages: ["ja"],
      temporaryDomainMinutes: 30,
    };
    const v3 = encodeSyncedSettings(local, "v3");
    expect((v3[syncManifestKey] as { version: number }).version).toBe(3);
    expect(decodeSyncedSettings(v3)?.settings).toEqual(local);
    const old = Object.fromEntries(
      version2SettingsKeys.map((key) => [key, local[key]]),
    );
    old.targetLanguage = "fr";
    old.fontFamily = "serif";
    const v2 = {
      [syncManifestKey]: { version: 2, revision: "v2", count: 1 },
      [`${syncPrefix}chunk.0`]: {
        revision: "v2",
        data: Buffer.from(JSON.stringify(old)).toString("base64"),
      },
    };
    const migrated = mergeSyncedSettings(decodeSyncedSettings(v2)!, local);
    expect(migrated).toMatchObject({
      targetLanguage: "fr",
      fontFamily: "serif",
      alwaysSourceLanguages: ["en"],
      neverSourceLanguages: ["ja"],
      temporaryDomainMinutes: 30,
      syncPreferences: true,
    });
    expect(() =>
      decodeSyncedSettings({
        ...v2,
        [syncManifestKey]: { version: 3, revision: "v2", count: 1 },
      }),
    ).toThrow();
  });
});
