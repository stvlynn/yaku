import { useEffect, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { copy } from "../../shared/i18n";
import { Button, Group, Notice, Toggle } from "../../shared/ui";
import { validateSettings } from "./model";
import type { PreferencesProps } from "./contracts";
import { createDefaultSettings } from "../../entities/settings";
import { retryPreferencesSync, type PreferencesSyncStatus } from "./sync";
export function DataPreferences({
  preferences,
  onPreferencesChange,
}: PreferencesProps) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [syncStatus, setSyncStatus] = useState<PreferencesSyncStatus>();
  useEffect(() => {
    void chrome.storage.local.get("preferencesSyncStatus").then(
      (items) =>
        setSyncStatus(
          items.preferencesSyncStatus as PreferencesSyncStatus | undefined,
        ),
      () => setError(copy.syncError),
    );
    const changed = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && changes.preferencesSyncStatus)
        setSyncStatus(
          changes.preferencesSyncStatus.newValue as
            PreferencesSyncStatus | undefined,
        );
    };
    chrome.storage.onChanged.addListener(changed);
    return () => chrome.storage.onChanged.removeListener(changed);
  }, []);
  return (
    <Group title={copy.data}>
      <Toggle
        label={copy.browserSync}
        description={copy.browserSyncHelp}
        checked={preferences.syncPreferences}
        onChange={(syncPreferences) => onPreferencesChange({ syncPreferences })}
      />
      {preferences.syncPreferences && syncStatus?.phase === "pending" && (
        <p className="settings-feedback" role="status">
          {copy.syncPending}
        </p>
      )}
      {preferences.syncPreferences && syncStatus?.phase === "ready" && (
        <p className="settings-feedback" role="status">
          {copy.syncReady}
        </p>
      )}
      {preferences.syncPreferences && syncStatus?.phase === "error" && (
        <Notice>
          <div>
            <p>{copy.syncError}</p>
            {syncStatus.error && <p>{syncStatus.error}</p>}
            <Button
              onClick={() => {
                void retryPreferencesSync().catch(() =>
                  setError(copy.syncError),
                );
              }}
            >
              {copy.syncRetry}
            </Button>
          </div>
        </Notice>
      )}
      <div className="data-actions">
        <Button
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(preferences, null, 2)], {
                type: "application/json",
              }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = "yaku-settings.json";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setMessage(copy.exportSuccess);
          }}
        >
          <Download size={15} />
          {copy.exportSettings}
        </Button>
        <Button onClick={() => input.current?.click()}>
          <Upload size={15} />
          {copy.importSettings}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            onPreferencesChange(createDefaultSettings());
            setError("");
            setMessage(copy.resetSuccess);
          }}
        >
          {copy.resetSettings}
        </Button>
        <input
          ref={input}
          type="file"
          tabIndex={-1}
          className="sr-only"
          accept=".json,application/json"
          aria-label={copy.importSettings}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              const settings = validateSettings(JSON.parse(await file.text()));
              onPreferencesChange({
                ...settings,
                syncPreferences: preferences.syncPreferences,
              });
              setError("");
              setMessage(copy.importSuccess);
            } catch {
              setError(copy.invalidSettings);
              setMessage("");
            }
            event.target.value = "";
          }}
        />
      </div>
      {message && (
        <p className="settings-feedback" role="status">
          {message}
        </p>
      )}
      {error && <Notice>{error}</Notice>}
    </Group>
  );
}
