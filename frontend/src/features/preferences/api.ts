import { createDefaultSettings, type Settings } from "../../entities/settings";
import { validateSettings } from "./model";

export async function readSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get("settings");
  return stored.settings === undefined
    ? createDefaultSettings()
    : validateSettings(stored.settings);
}
export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings: validateSettings(settings) });
}
export function onSettingsChanged(
  listener: (settings: Settings) => void,
  onError: (error: Error) => void = console.error,
): () => void {
  const handle = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== "local" || changes.settings?.newValue === undefined) return;
    let settings: Settings;
    try {
      settings = validateSettings(changes.settings.newValue);
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    listener(settings);
  };
  chrome.storage.onChanged.addListener(handle);
  return () => chrome.storage.onChanged.removeListener(handle);
}
