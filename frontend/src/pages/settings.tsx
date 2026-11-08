import { useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  BookOpen,
  Globe2,
  Languages,
  Keyboard,
  LockKeyhole,
  SlidersHorizontal,
} from "lucide-react";
import type { ModelStatus } from "../entities/translation";
import {
  ActivationPreferences,
  DataPreferences,
  GlossaryPreferences,
  LanguagePreferences,
  ReadingPreferences,
  WebsitePreferences,
  ShortcutPreferences,
  type PreferencesProps,
} from "../features/preferences";
import { cacheDescription, copy } from "../shared/i18n";
import { Brand, Button, Group, ModelStatusView, Notice } from "../shared/ui";
type SettingsSection =
  "general" | "activation" | "shortcuts" | "sites" | "glossary" | "model";
export interface SettingsPageProps extends PreferencesProps {
  status: ModelStatus;
  onPrepareModel?: () => void;
  onCancelDownload?: () => void;
  onClearModelCache?: () => void;
  cacheInfo?: {
    bytes: number;
    files?: number;
    complete?: boolean;
    total?: number;
  };
  error?: string;
  onOpenWorkspace?: () => void;
}
export function SettingsPage(props: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>("general");
  const sections = [
    {
      id: "general",
      label: copy.general,
      icon: SlidersHorizontal,
    },
    {
      id: "activation",
      label: copy.activation,
      icon: Languages,
    },
    {
      id: "shortcuts",
      label: copy.shortcuts,
      icon: Keyboard,
    },
    {
      id: "sites",
      label: copy.sites,
      icon: Globe2,
    },
    {
      id: "glossary",
      label: copy.glossary,
      icon: BookOpen,
    },
    {
      id: "model",
      label: copy.localModel,
      icon: LockKeyhole,
    },
  ] as const;
  const current = sections.find((item) => item.id === section)!;
  const preferencesProps = {
    preferences: props.preferences,
    onPreferencesChange: props.onPreferencesChange,
  };
  return (
    <div className="settings-page">
      <aside className="settings-sidebar">
        <Brand compact />
        <nav className="settings-nav" aria-label={copy.settings}>
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={id === section ? "page" : undefined}
              onClick={() => setSection(id)}
              title={label}
            >
              <Icon size={17} strokeWidth={1.7} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        {props.onOpenWorkspace && (
          <Button variant="ghost" onClick={props.onOpenWorkspace}>
            <ArrowUpRight size={16} />
            <span>{copy.openWorkspace}</span>
          </Button>
        )}
        <p className="sidebar-footer">{copy.saveAutomatic}</p>
      </aside>
      <main className="settings-main">
        <div className="settings-content">
          <header className="page-heading">
            <h1>{current.label}</h1>
          </header>
          {props.error && <Notice>{props.error}</Notice>}
          {section === "general" && (
            <>
              <LanguagePreferences {...preferencesProps} />
              <ReadingPreferences {...preferencesProps} />
              <DataPreferences {...preferencesProps} />
            </>
          )}
          {section === "activation" && (
            <ActivationPreferences {...preferencesProps} />
          )}
          {section === "shortcuts" && <ShortcutPreferences />}
          {section === "sites" && <WebsitePreferences {...preferencesProps} />}
          {section === "glossary" && (
            <GlossaryPreferences {...preferencesProps} />
          )}
          {section === "model" && (
            <Group>
              <div className="model-card">
                <p>{copy.localPrivacyDetail}</p>
                <ModelStatusView status={props.status} detail />
                {props.status.error && <Notice>{props.status.error}</Notice>}
                {props.status.phase !== "ready" && (
                  <p>{copy.modelDownloadDetail}</p>
                )}
                {props.onPrepareModel &&
                  ["idle", "error"].includes(props.status.phase) && (
                    <Button variant="primary" onClick={props.onPrepareModel}>
                      <ArrowDown size={16} />
                      {props.status.phase === "error"
                        ? copy.retry
                        : copy.downloadModel}
                    </Button>
                  )}
                {props.onCancelDownload &&
                  ["downloading", "loading"].includes(props.status.phase) && (
                    <Button onClick={props.onCancelDownload}>
                      {copy.cancelDownload}
                    </Button>
                  )}
                {props.cacheInfo && (
                  <div className="cache-row">
                    <div>
                      <span>{copy.cache}</span>
                      <small>
                        {cacheDescription(
                          props.cacheInfo.files,
                          props.cacheInfo.bytes,
                        )}
                      </small>
                    </div>
                    {props.onClearModelCache && props.cacheInfo.bytes > 0 && (
                      <Button
                        variant="ghost"
                        disabled={[
                          "downloading",
                          "loading",
                          "translating",
                        ].includes(props.status.phase)}
                        onClick={props.onClearModelCache}
                      >
                        {copy.clearModelCache}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Group>
          )}
        </div>
      </main>
    </div>
  );
}
