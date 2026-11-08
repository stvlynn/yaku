import { useRef } from "react";
import { Check, Copy, FileText, Image, Upload, X } from "lucide-react";
import { copy, characterCount } from "../../shared/i18n";
import { Button, IconButton } from "../../shared/ui";

import type { WorkspaceMode } from "../../entities/settings";
export type { WorkspaceMode } from "../../entities/settings";
export interface TranslationEditorProps {
  mode: WorkspaceMode;
  source: string;
  onSourceChange: (value: string) => void;
  result: string;
  onCopy: () => void;
  onFile?: (file: File) => void;
  fileName?: string;
  copied?: boolean;
  busy?: boolean;
  resultLabel?: string;
  copyLabel?: string;
}
export function TranslationEditor({
  mode,
  source,
  onSourceChange,
  result,
  onCopy,
  onFile,
  fileName,
  copied,
  busy,
  resultLabel = copy.resultText,
  copyLabel = copy.copy,
}: TranslationEditorProps) {
  const input = useRef<HTMLInputElement>(null);
  const fileMode = mode !== "text" && mode !== "writing";
  const formats =
    mode === "subtitle"
      ? copy.subtitleFormats
      : mode === "image"
        ? copy.imageFormats
        : copy.documentFormats;
  const accept =
    mode === "subtitle"
      ? ".srt,.vtt,.ass,.lrc"
      : mode === "image"
        ? ".png,.jpg,.jpeg,.webp,.bmp"
        : ".txt,.md,.html,.json,.epub,.docx,.pdf";
  return (
    <div className="editor-grid">
      <section className="editor-pane">
        <header className="editor-pane-header">
          <h2>{copy.sourceText}</h2>
          {!fileMode && source && (
            <IconButton
              label={copy.clear}
              disabled={busy}
              onClick={() => onSourceChange("")}
            >
              <X size={15} />
            </IconButton>
          )}
        </header>
        {fileMode ? (
          <div className="file-picker">
            {mode === "image" ? (
              <Image size={32} strokeWidth={1.3} aria-hidden="true" />
            ) : (
              <FileText size={32} strokeWidth={1.3} aria-hidden="true" />
            )}
            {fileName && <div className="file-name">{fileName}</div>}
            {onFile && (
              <>
                <Button disabled={busy} onClick={() => input.current?.click()}>
                  <Upload size={16} />
                  {fileName ? copy.changeFile : copy.chooseFile}
                </Button>
                <input
                  ref={input}
                  type="file"
                  tabIndex={-1}
                  className="sr-only"
                  aria-label={copy.chooseFile}
                  accept={accept}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onFile(file);
                    event.target.value = "";
                  }}
                />
              </>
            )}
            <p>{formats}</p>
            {fileName?.toLowerCase().endsWith(".pdf") && (
              <p>{copy.pdfExportHelp}</p>
            )}
          </div>
        ) : (
          <textarea
            aria-label={copy.sourceText}
            value={source}
            onChange={(event) => onSourceChange(event.target.value)}
            placeholder={copy.sourcePlaceholder}
            spellCheck={false}
            readOnly={busy}
          />
        )}
        <footer className="editor-pane-footer">
          <span>
            {fileMode ? copy.uploadLocal : characterCount(source.length)}
          </span>
        </footer>
      </section>
      <section className="editor-pane">
        <header className="editor-pane-header">
          <h2>{resultLabel}</h2>
          {result && (
            <Button variant="ghost" onClick={onCopy}>
              <span className="icon-swap" key={copied ? "copied" : "copy"}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </span>
              {copied ? copy.copied : copyLabel}
            </Button>
          )}
        </header>
        <div
          className={`editor-result ${result ? "" : "editor-empty"}`}
          aria-live="polite"
          aria-busy={busy}
        >
          {result}
        </div>
        {result && (
          <footer className="editor-pane-footer">
            <span>{characterCount(result.length)}</span>
          </footer>
        )}
      </section>
    </div>
  );
}
