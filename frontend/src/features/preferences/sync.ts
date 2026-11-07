import { createDefaultSettings, type Settings } from "../../entities/settings";
import { validateSettings } from "./model";
import {
  assertSyncQuota,
  decodeSyncedSettings,
  encodeSyncedSettings,
  settingsPayload,
  mergeSyncedSettings,
  syncPrefix,
} from "./sync-codec";

export interface PreferencesSyncStatus {
  phase: "disabled" | "pending" | "ready" | "error";
  pendingUpload?: boolean;
  error?: string;
}
interface StorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}
type ChangeListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void;
export interface PreferencesSyncStorage {
  local: StorageArea;
  sync: StorageArea;
  onChanged: {
    addListener(listener: ChangeListener): void;
    removeListener(listener: ChangeListener): void;
  };
}

/** Install once in the background worker; UI and content contexts only read local settings. */
export function installPreferencesSync(
  storage: PreferencesSyncStorage = chrome.storage,
  debounceMs = 5000,
) {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastPayload: string | undefined;
  let lastRevision: string | undefined;
  let pendingUpload = false;
  let chain = Promise.resolve();
  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  async function status(value: PreferencesSyncStatus) {
    if (!disposed) await storage.local.set({ preferencesSyncStatus: value });
  }
  async function report(error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    try {
      await status({ phase: "error", pendingUpload, error: detail });
    } catch (failure) {
      console.error(failure);
    }
  }
  function enqueue(operation: () => Promise<void>) {
    chain = chain
      .then(async () => {
        if (!disposed) await operation();
      })
      .catch(report);
    return chain;
  }
  async function localSettings(): Promise<Settings> {
    const items = await storage.local.get("settings");
    return items.settings === undefined
      ? createDefaultSettings()
      : validateSettings(items.settings);
  }
  async function upload() {
    clearTimer();
    const local = await localSettings();
    if (!local.syncPreferences) {
      pendingUpload = false;
      await status({ phase: "disabled" });
      return;
    }
    pendingUpload = true;
    await status({ phase: "pending", pendingUpload: true });
    const existing = await storage.sync.get(null);
    const revision = crypto.randomUUID();
    const update = encodeSyncedSettings(local, revision);
    assertSyncQuota({ ...existing, ...update });
    if (!(await localSettings()).syncPreferences) return;
    lastRevision = revision;
    await storage.sync.set(update);
    const obsolete = Object.keys(existing).filter(
      (key) => key.startsWith(syncPrefix) && !(key in update),
    );
    if (obsolete.length) await storage.sync.remove(obsolete);
    lastPayload = settingsPayload(local);
    const latest = await localSettings();
    if (latest.syncPreferences && settingsPayload(latest) !== lastPayload)
      scheduleUpload();
    else {
      pendingUpload = false;
      await status({ phase: latest.syncPreferences ? "ready" : "disabled" });
    }
  }
  function scheduleUpload() {
    pendingUpload = true;
    clearTimer();
    void status({ phase: "pending", pendingUpload: true }).catch(report);
    timer = setTimeout(() => {
      void enqueue(upload);
    }, debounceMs);
  }
  async function receive(allowInitialUpload = false) {
    const local = await localSettings();
    if (!local.syncPreferences) {
      clearTimer();
      pendingUpload = false;
      await status({ phase: "disabled" });
      return;
    }
    const remote = decodeSyncedSettings(await storage.sync.get(null));
    if (!remote) {
      if (allowInitialUpload) scheduleUpload();
      return;
    }
    if (remote.revision === lastRevision) return;
    clearTimer();
    const incoming = mergeSyncedSettings(remote, local);
    lastPayload = settingsPayload(incoming);
    await storage.local.set({ settings: incoming });
    lastRevision = remote.revision;
    pendingUpload = false;
    await status({ phase: "ready" });
    if (remote.version === 1) scheduleUpload();
  }
  const handle: ChangeListener = (changes, area) => {
    if (disposed) return;
    if (
      area === "sync" &&
      Object.keys(changes).some((key) => key.startsWith(syncPrefix))
    ) {
      void enqueue(() => receive());
      return;
    }
    if (area !== "local") return;
    if (changes.preferencesSyncRetry) {
      void enqueue(() => (pendingUpload ? upload() : receive(true)));
      return;
    }
    if (changes.settings?.newValue === undefined) return;
    let next: Settings;
    try {
      next = validateSettings(changes.settings.newValue);
    } catch (error) {
      void report(error);
      return;
    }
    if (!next.syncPreferences) {
      clearTimer();
      pendingUpload = false;
      void enqueue(() => status({ phase: "disabled" }));
      return;
    }
    const previous = changes.settings.oldValue as Partial<Settings> | undefined;
    if (!previous?.syncPreferences) {
      void enqueue(() => receive(true));
      return;
    }
    if (settingsPayload(next) !== lastPayload) scheduleUpload();
  };
  storage.onChanged.addListener(handle);
  const ready = enqueue(async () => {
    const stored = await storage.local.get("preferencesSyncStatus");
    const previous = stored.preferencesSyncStatus as
      PreferencesSyncStatus | undefined;
    pendingUpload = previous?.pendingUpload === true;
    if (pendingUpload && (await localSettings()).syncPreferences)
      await upload();
    else await receive(true);
  });
  return {
    ready,
    async flush() {
      clearTimer();
      await chain;
      await enqueue(upload);
    },
    dispose() {
      disposed = true;
      clearTimer();
      storage.onChanged.removeListener(handle);
    },
  };
}

export async function retryPreferencesSync() {
  await chrome.storage.local.set({ preferencesSyncRetry: crypto.randomUUID() });
}
