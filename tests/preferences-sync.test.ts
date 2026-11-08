import { describe, expect, it } from "vitest";
import {
  defaultSettings,
  type Settings,
} from "../frontend/src/entities/settings";
import {
  installPreferencesSync,
  type PreferencesSyncStorage,
} from "../frontend/src/features/preferences/sync";
import {
  assertSyncQuota,
  decodeSyncedSettings,
  encodeSyncedSettings,
  syncManifestKey,
  syncPrefix,
} from "../frontend/src/features/preferences/sync-codec";

type Listener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void;
function devices() {
  const remote: Record<string, unknown> = {};
  const all = new Set<Set<Listener>>();
  let writes = 0;
  let fail = false;
  function device() {
    const local: Record<string, unknown> = {
      settings: structuredClone(defaultSettings),
    };
    const listeners = new Set<Listener>();
    all.add(listeners);
    function area(data: Record<string, unknown>, name: "local" | "sync") {
      const emit = (changes: Record<string, chrome.storage.StorageChange>) => {
        if (!Object.keys(changes).length) return;
        for (const group of name === "sync" ? all : [listeners])
          for (const listener of group) listener(changes, name);
      };
      return {
        async get(keys?: string | string[] | null) {
          const selected =
            keys === undefined || keys === null
              ? Object.keys(data)
              : typeof keys === "string"
                ? [keys]
                : keys;
          return Object.fromEntries(
            selected
              .filter((key) => Object.hasOwn(data, key))
              .map((key) => [key, structuredClone(data[key])]),
          );
        },
        async set(values: Record<string, unknown>) {
          if (name === "sync") {
            if (fail) throw new Error("Simulated sync failure");
            writes++;
            assertSyncQuota({ ...data, ...values });
          }
          const changes: Record<string, chrome.storage.StorageChange> = {};
          for (const [key, value] of Object.entries(values)) {
            if (JSON.stringify(data[key]) === JSON.stringify(value)) continue;
            changes[key] = {
              oldValue: data[key],
              newValue: structuredClone(value),
            };
            data[key] = structuredClone(value);
          }
          emit(changes);
        },
        async remove(keys: string | string[]) {
          const changes: Record<string, chrome.storage.StorageChange> = {};
          for (const key of typeof keys === "string" ? [keys] : keys) {
            if (!Object.hasOwn(data, key)) continue;
            changes[key] = { oldValue: data[key] };
            delete data[key];
          }
          emit(changes);
        },
      };
    }
    const storage: PreferencesSyncStorage = {
      local: area(local, "local"),
      sync: area(remote, "sync"),
      onChanged: {
        addListener(listener) {
          listeners.add(listener);
        },
        removeListener(listener) {
          listeners.delete(listener);
        },
      },
    };
    return { storage, local };
  }
  return {
    device,
    remote,
    get writes() {
      return writes;
    },
    setFail(value: boolean) {
      fail = value;
    },
  };
}

describe("browser preference sync", () => {
  it("loads a version 3 snapshot written before the Space trigger preference", () => {
    const {
      inputSpaceTrigger: _trigger,
      inputTargetLanguage: _inputLanguage,
      syncPreferences: _sync,
      ...previousSettings
    } = defaultSettings;
    expect(
      decodeSyncedSettings({
        [syncManifestKey]: { version: 3, revision: "previous", count: 1 },
        [`${syncPrefix}chunk.0`]: {
          revision: "previous",
          data: Buffer.from(JSON.stringify(previousSettings)).toString(
            "base64",
          ),
        },
      })?.settings.inputSpaceTrigger,
    ).toBe(true);
  });
  it("rejects a validly encoded but incomplete snapshot instead of replacing local data with defaults", () => {
    expect(() =>
      decodeSyncedSettings({
        [syncManifestKey]: { version: 1, revision: "incomplete", count: 1 },
        [`${syncPrefix}chunk.0`]: { revision: "incomplete", data: "e30=" },
      }),
    ).toThrow("incomplete or invalid");
  });
  it("keeps disabled devices local and hydrates an explicitly enabled second device without echoes", async () => {
    const bus = devices();
    const a = bus.device();
    const b = bus.device();
    const ca = installPreferencesSync(a.storage);
    const cb = installPreferencesSync(b.storage);
    try {
      await Promise.all([ca.ready, cb.ready]);
      expect(bus.writes).toBe(0);
      await a.storage.local.set({
        settings: {
          ...defaultSettings,
          syncPreferences: true,
          targetLanguage: "ja",
          alwaysSourceLanguages: ["en"],
          neverSourceLanguages: ["zh"],
          temporaryDomainMinutes: 15,
        },
      });
      await ca.flush();
      expect(bus.writes).toBe(1);
      expect((b.local.settings as Settings).targetLanguage).toBe("zh");
      await b.storage.local.set({
        settings: { ...defaultSettings, syncPreferences: true },
      });
      await expect
        .poll(() => (b.local.settings as Settings).targetLanguage)
        .toBe("ja");
      expect(b.local.settings).toMatchObject({
        alwaysSourceLanguages: ["en"],
        neverSourceLanguages: ["zh"],
        temporaryDomainMinutes: 15,
      });
      expect(bus.writes).toBe(1);
      await a.storage.local.set({
        settings: { ...(a.local.settings as Settings), targetLanguage: "fr" },
      });
      await ca.flush();
      await expect
        .poll(() => (b.local.settings as Settings).targetLanguage)
        .toBe("fr");
      expect(bus.writes).toBe(2);
      expect(decodeSyncedSettings(bus.remote)?.settings.syncPreferences).toBe(
        true,
      );
      const encoded = JSON.stringify(bus.remote);
      expect(encoded).not.toContain("syncPreferences");
    } finally {
      ca.dispose();
      cb.dispose();
    }
  });
  it("round-trips Unicode over multiple 7KB chunks and removes old tail chunks after shrinking", async () => {
    const bus = devices();
    const a = bus.device();
    const controller = installPreferencesSync(a.storage);
    try {
      await controller.ready;
      await a.storage.local.set({
        settings: {
          ...defaultSettings,
          syncPreferences: true,
          glossary: { term: "世界".repeat(4000) },
        },
      });
      await controller.flush();
      expect(Object.keys(bus.remote).length).toBeGreaterThan(3);
      expect(decodeSyncedSettings(bus.remote)?.settings.glossary.term).toBe(
        "世界".repeat(4000),
      );
      for (const [key, value] of Object.entries(bus.remote))
        expect(
          new TextEncoder().encode(key + JSON.stringify(value)).length,
        ).toBeLessThan(8192);
      await a.storage.local.set({
        settings: { ...defaultSettings, syncPreferences: true },
      });
      await controller.flush();
      expect(Object.keys(bus.remote).sort()).toEqual(
        [`${syncPrefix}chunk.0`, syncManifestKey].sort(),
      );
    } finally {
      controller.dispose();
    }
  });
  it("rejects incomplete incoming revisions without overwriting local settings", async () => {
    const bus = devices();
    const a = bus.device();
    const controller = installPreferencesSync(a.storage);
    try {
      await controller.ready;
      await a.storage.local.set({
        settings: {
          ...defaultSettings,
          syncPreferences: true,
          targetLanguage: "ja",
        },
      });
      await controller.flush();
      const update = encodeSyncedSettings(
        { ...defaultSettings, targetLanguage: "fr" },
        "remote-revision",
      );
      delete update[`${syncPrefix}chunk.0`];
      await a.storage.sync.set(update);
      await expect
        .poll(() => (a.local.preferencesSyncStatus as { phase: string }).phase)
        .toBe("error");
      expect((a.local.settings as Settings).targetLanguage).toBe("ja");
    } finally {
      controller.dispose();
    }
  });
  it("reports upload failures and retries the latest local values without losing them", async () => {
    const bus = devices();
    const a = bus.device();
    const controller = installPreferencesSync(a.storage);
    try {
      await controller.ready;
      await a.storage.local.set({
        settings: { ...defaultSettings, syncPreferences: true },
      });
      await controller.flush();
      bus.setFail(true);
      await a.storage.local.set({
        settings: {
          ...defaultSettings,
          syncPreferences: true,
          targetLanguage: "ko",
        },
      });
      await controller.flush();
      expect((a.local.preferencesSyncStatus as { phase: string }).phase).toBe(
        "error",
      );
      expect((a.local.settings as Settings).targetLanguage).toBe("ko");
      bus.setFail(false);
      await a.storage.local.set({ preferencesSyncRetry: crypto.randomUUID() });
      await expect
        .poll(() => decodeSyncedSettings(bus.remote)?.settings.targetLanguage)
        .toBe("ko");
    } finally {
      controller.dispose();
    }
  });
  it("coalesces rapid edits and stops pending writes when disabled", async () => {
    const bus = devices();
    const a = bus.device();
    const controller = installPreferencesSync(a.storage);
    try {
      await controller.ready;
      await a.storage.local.set({
        settings: { ...defaultSettings, syncPreferences: true },
      });
      await controller.flush();
      const count = bus.writes;
      for (const targetLanguage of ["ja", "fr", "ko"])
        await a.storage.local.set({
          settings: {
            ...defaultSettings,
            syncPreferences: true,
            targetLanguage,
          },
        });
      await controller.flush();
      expect(bus.writes).toBe(count + 1);
      expect(decodeSyncedSettings(bus.remote)?.settings.targetLanguage).toBe(
        "ko",
      );
      await a.storage.local.set({
        settings: {
          ...defaultSettings,
          syncPreferences: true,
          targetLanguage: "fr",
        },
      });
      await a.storage.local.set({
        settings: {
          ...defaultSettings,
          syncPreferences: false,
          targetLanguage: "fr",
        },
      });
      await controller.flush();
      expect(bus.writes).toBe(count + 1);
    } finally {
      controller.dispose();
    }
  });
  it("rejects oversized payloads instead of silently truncating preferences", () => {
    expect(() =>
      encodeSyncedSettings(
        { ...defaultSettings, glossary: { term: "界".repeat(60000) } },
        "revision",
      ),
    ).toThrow("100 KB");
  });
});
