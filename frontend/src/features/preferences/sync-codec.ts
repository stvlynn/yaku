import { defaultSettings, type Settings } from "../../entities/settings";
import { copy } from "../../shared/i18n";
import { validateSettings } from "./model";

export const syncPrefix = "yaku.preferences.v1.";
export const syncManifestKey = `${syncPrefix}manifest`;
const chunkSize = 7000;
const quotaBytes = 102400;
export const legacySettingsKeys = [
  "targetLanguage",
  "sourceLanguage",
  "mode",
  "style",
  "theme",
  "autoTranslate",
  "selectionEnabled",
  "hoverEnabled",
  "inputEnabled",
  "subtitlesEnabled",
  "showFloatingButton",
  "fontSize",
  "siteRules",
  "glossary",
] as const;
export const version2SettingsKeys = [
  ...legacySettingsKeys,
  "translationPosition",
  "fontFamily",
  "fontWeight",
  "lineHeight",
  "textColor",
  "backgroundColor",
  "glossaries",
] as const;
export interface SyncedSettingsSnapshot {
  settings: Settings;
  revision: string;
  version: 1 | 2 | 3;
}
export function settingsPayload(settings: Settings): string {
  const { syncPreferences: _enabled, ...preferences } =
    validateSettings(settings);
  return JSON.stringify(preferences);
}
export function encodeSyncedSettings(
  settings: Settings,
  revision: string,
): Record<string, unknown> {
  const bytes = new TextEncoder().encode(settingsPayload(settings));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary);
  const count = Math.ceil(encoded.length / chunkSize);
  if (count > 14) throw new Error(copy.syncQuota);
  const result: Record<string, unknown> = {
    [syncManifestKey]: { version: 3, revision, count },
  };
  for (let index = 0; index < count; index++)
    result[`${syncPrefix}chunk.${index}`] = {
      revision,
      data: encoded.slice(index * chunkSize, (index + 1) * chunkSize),
    };
  return result;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function decodeSyncedSettings(
  items: Record<string, unknown>,
): SyncedSettingsSnapshot | undefined {
  const manifest = items[syncManifestKey];
  if (manifest === undefined) return undefined;
  if (
    !record(manifest) ||
    (manifest.version !== 1 &&
      manifest.version !== 2 &&
      manifest.version !== 3) ||
    typeof manifest.revision !== "string" ||
    !Number.isInteger(manifest.count) ||
    Number(manifest.count) < 1 ||
    Number(manifest.count) > 14
  )
    throw new Error(copy.syncInvalid);
  let encoded = "";
  for (let index = 0; index < Number(manifest.count); index++) {
    const chunk = items[`${syncPrefix}chunk.${index}`];
    if (
      !record(chunk) ||
      chunk.revision !== manifest.revision ||
      typeof chunk.data !== "string" ||
      chunk.data.length > chunkSize
    )
      throw new Error(copy.syncInvalid);
    encoded += chunk.data;
  }
  try {
    const bytes = Uint8Array.from(atob(encoded), (character) =>
      character.charCodeAt(0),
    );
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    const keys =
      manifest.version === 1
        ? legacySettingsKeys
        : manifest.version === 2
          ? version2SettingsKeys
          : Object.keys(defaultSettings);
    if (
      !record(value) ||
      keys.some(
        (key) =>
          key !== "syncPreferences" &&
          key !== "inputSpaceTrigger" &&
          key !== "inputPrefixKey" &&
          key !== "inputTrailingKey" &&
          key !== "inputTargetLanguage" &&
          key !== "inputMatchConversation" &&
          key !== "inputMatchPage" &&
          !Object.hasOwn(value, key),
      )
    )
      throw new Error(copy.syncInvalid);
    return {
      settings: validateSettings({
        ...Object.fromEntries(
          keys
            .filter(
              (key) => key !== "syncPreferences" && Object.hasOwn(value, key),
            )
            .map((key) => [key, value[key]]),
        ),
        syncPreferences: true,
      }),
      revision: manifest.revision,
      version: manifest.version as 1 | 2 | 3,
    };
  } catch {
    throw new Error(copy.syncInvalid);
  }
}
export function mergeSyncedSettings(
  snapshot: SyncedSettingsSnapshot,
  local: Settings,
): Settings {
  return snapshot.version !== 3
    ? validateSettings({
        ...local,
        ...Object.fromEntries(
          (snapshot.version === 1
            ? legacySettingsKeys
            : version2SettingsKeys
          ).map((key) => [key, snapshot.settings[key]]),
        ),
        syncPreferences: local.syncPreferences,
      })
    : { ...snapshot.settings, syncPreferences: local.syncPreferences };
}
export function assertSyncQuota(items: Record<string, unknown>) {
  const encoder = new TextEncoder();
  let total = 0;
  for (const [key, value] of Object.entries(items)) {
    const bytes =
      encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length;
    if (bytes > 8192) throw new Error(copy.syncQuota);
    total += bytes;
  }
  if (total > quotaBytes || Object.keys(items).length > 512)
    throw new Error(copy.syncQuota);
}
