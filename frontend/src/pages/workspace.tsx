import {
  ArrowRight,
  Download,
  FileText,
  Image,
  Languages,
  PencilLine,
  Settings2,
  Subtitles,
} from "lucide-react";
import type { ModelStatus } from "../entities/translation";
import {
  sourceLanguageOptions,
  targetLanguageOptions,
  type PreferencesProps,
} from "../features/preferences";
import {
  TranslationEditor,
  type TranslationEditorProps,
  type WorkspaceMode,
} from "../widgets/translation-editor";
import { copy, progressDescription } from "../shared/i18n";
import {
  Brand,
  Button,
  Choice,
  IconButton,
  ModelStatusView,
  Notice,
} from "../shared/ui";
export interface WorkspacePageProps
  extends PreferencesProps, Omit<TranslationEditorProps, "busy"> {
  status: ModelStatus;
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  onTranslate: () => void;
  onCancel: () => void;
  error?: string;
  availableModes?: WorkspaceMode[];
  onOpenSettings?: () => void;
  onDownload?: () => void;
  onDownloadImage?: () => void;
  onDownloadPdf?: () => void;
  passwordRequired?: boolean;
  password?: string;
  onPasswordChange?: (value: string) => void;
  hasDownload?: boolean;
  downloadLabel?: string;
  progress?: { completed: number; total: number };
  writingStyle?: "grammar" | "polite";
  onWritingStyleChange?: (style: "grammar" | "polite") => void;
}
export type { WorkspaceMode };
export function WorkspacePage(props: WorkspacePageProps) {
  const busy = ["downloading", "loading", "translating"].includes(
    props.status.phase,
  );
  const modes = [
    {
      id: "text",
      label: copy.text,
      icon: Languages,
    },
    {
      id: "document",
      label: copy.document,
      icon: FileText,
    },
    {
      id: "subtitle",
      label: copy.subtitle,
      icon: Subtitles,
    },
    {
      id: "image",
      label: copy.image,
      icon: Image,
    },
    { id: "writing", label: copy.writing, icon: PencilLine },
  ] as const;
  const availableModes = props.availableModes ?? ["text"];
  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <Brand />
        <span className="workspace-header-title">{copy.workspace}</span>
        {props.onOpenSettings && (
          <IconButton label={copy.settings} onClick={props.onOpenSettings}>
            <Settings2 size={18} strokeWidth={1.7} />
          </IconButton>
        )}
      </header>
      <main className="workspace-main">
        {availableModes.length > 1 && (
          <nav className="workspace-tabs" aria-label={copy.workspace}>
            {modes
              .filter((item) => availableModes.includes(item.id))
              .map(({ id, label, icon: Icon }) => (
                <button
                  type="button"
                  aria-pressed={props.mode === id}
                  key={id}
                  disabled={busy}
                  onClick={() => props.onModeChange(id)}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
          </nav>
        )}
        {props.mode === "writing" ? (
          props.onWritingStyleChange && (
            <div className="language-bar">
              <div className="language-control">
                <span className="field-label">{copy.writingStyle}</span>
                <Choice
                  label={copy.writingStyle}
                  value={props.writingStyle ?? "grammar"}
                  options={[
                    { value: "grammar", label: copy.grammar },
                    { value: "polite", label: copy.polite },
                  ]}
                  disabled={busy}
                  onChange={(style) =>
                    props.onWritingStyleChange?.(style as "grammar" | "polite")
                  }
                />
              </div>
              <div className="language-control">
                <span className="field-label">{copy.outputLanguage}</span>
                <Choice
                  label={copy.outputLanguage}
                  value={props.preferences.targetLanguage}
                  options={targetLanguageOptions}
                  disabled={busy}
                  onChange={(targetLanguage) =>
                    props.onPreferencesChange({ targetLanguage })
                  }
                />
              </div>
            </div>
          )
        ) : (
          <div className="language-bar">
            <Choice
              label={copy.source}
              value={props.preferences.sourceLanguage}
              options={sourceLanguageOptions}
              disabled={busy}
              onChange={(sourceLanguage) =>
                props.onPreferencesChange({ sourceLanguage })
              }
            />
            <ArrowRight size={16} className="muted" aria-hidden="true" />
            <Choice
              label={copy.target}
              value={props.preferences.targetLanguage}
              options={targetLanguageOptions}
              disabled={busy}
              onChange={(targetLanguage) =>
                props.onPreferencesChange({ targetLanguage })
              }
            />
          </div>
        )}
        {props.passwordRequired && props.onPasswordChange && (
          <label className="pdf-password">
            <span className="field-label">{copy.pdfPassword}</span>
            <input
              type="password"
              className="input"
              value={props.password ?? ""}
              autoComplete="off"
              onChange={(event) => props.onPasswordChange?.(event.target.value)}
            />
          </label>
        )}
        <TranslationEditor
          mode={props.mode}
          source={props.source}
          onSourceChange={props.onSourceChange}
          result={props.result}
          onCopy={props.onCopy}
          onFile={props.onFile}
          fileName={props.fileName}
          copied={props.copied}
          busy={busy}
          resultLabel={
            props.mode === "writing" ? copy.rewrittenText : copy.resultText
          }
          copyLabel={
            props.mode === "writing" ? copy.copyRewrittenText : copy.copy
          }
        />
        {(props.error || props.status.error) && (
          <Notice>{props.error || props.status.error}</Notice>
        )}
        <footer className="workspace-bottom">
          <div className="workspace-status">
            <ModelStatusView status={props.status} />
            {props.progress && (
              <span className="task-progress" role="status">
                {progressDescription(
                  props.progress.completed,
                  props.progress.total,
                )}
              </span>
            )}
          </div>
          {props.onDownload && props.hasDownload !== false && (
            <Button disabled={busy} onClick={props.onDownload}>
              <Download size={16} />
              {props.downloadLabel ??
                (props.mode === "image" ||
                props.fileName?.toLowerCase().endsWith(".pdf")
                  ? copy.exportBilingualView
                  : copy.downloadResult)}
            </Button>
          )}
          {props.onDownloadImage && (
            <Button disabled={busy} onClick={props.onDownloadImage}>
              <Download size={16} />
              {copy.downloadTranslatedImage}
            </Button>
          )}
          {props.onDownloadPdf && (
            <Button disabled={busy} onClick={props.onDownloadPdf}>
              <Download size={16} />
              {copy.downloadPdf}
            </Button>
          )}
          {busy ? (
            <Button onClick={props.onCancel}>{copy.cancel}</Button>
          ) : (
            <Button
              variant="primary"
              disabled={
                props.mode === "text" || props.mode === "writing"
                  ? !props.source.trim()
                  : !props.fileName
              }
              onClick={props.onTranslate}
            >
              <Languages size={16} />
              {props.mode === "writing" ? copy.rewrite : copy.translate}
            </Button>
          )}
        </footer>
      </main>
    </div>
  );
}
