import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { ArrowUpRight, Ellipsis, Languages, Settings2, X } from "lucide-react";
import type { ModelStatus } from "../entities/translation";
import {
  LanguagePreferences,
  type PreferencesProps,
} from "../features/preferences";
import {
  copy,
  readingControlsLabel,
  temporaryTranslationUntil,
} from "../shared/i18n";
import {
  Brand,
  Button,
  IconButton,
  ModelStatusView,
  Notice,
  Toggle,
} from "../shared/ui";
import "./popup.css";
export interface PopupPageProps extends PreferencesProps {
  status: ModelStatus;
  error?: string;
  pageTranslated?: boolean;
  temporaryEditing?: boolean;
  temporaryEditingPending?: boolean;
  onTemporaryEditingChange?: (enabled: boolean) => void;
  onReadingControlsOpen?: () => void;
  temporaryTranslationUntil?: number;
  onStopTemporaryTranslation?: () => void;
  onTranslatePage: () => void;
  onTranslateWithContext?: () => void;
  onRestorePage: () => void;
  onOpenWorkspace: () => void;
  onOpenSettings: () => void;
}
export function PopupPage(props: PopupPageProps) {
  const [readingOpen, setReadingOpen] = useState(false);
  const error = props.error || props.status.error;
  const busy = ["downloading", "loading", "translating"].includes(
    props.status.phase,
  );
  return (
    <main className="popup-page">
      <header className="popup-header">
        <Brand compact />
        <div className="popup-header-actions">
          {props.onTemporaryEditingChange && (
            <Popover.Root
              open={readingOpen}
              onOpenChange={(open) => {
                setReadingOpen(open);
                if (open) props.onReadingControlsOpen?.();
              }}
            >
              <Popover.Trigger
                className="button button--ghost icon-button popup-more"
                aria-label={readingControlsLabel(!!props.temporaryEditing)}
                title={readingControlsLabel(!!props.temporaryEditing)}
                data-editing-active={props.temporaryEditing || undefined}
              >
                <Ellipsis size={19} strokeWidth={1.7} />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner
                  className="popup-reading-positioner"
                  side="bottom"
                  align="end"
                  sideOffset={8}
                  collisionPadding={12}
                >
                  <Popover.Popup className="popup-reading-content">
                    <header className="popup-reading-heading">
                      <Popover.Title>{copy.readingControls}</Popover.Title>
                      <Popover.Close
                        className="button button--ghost icon-button"
                        aria-label={copy.close}
                        title={copy.close}
                      >
                        <X size={17} />
                      </Popover.Close>
                    </header>
                    <div aria-busy={props.temporaryEditingPending || undefined}>
                      <Toggle
                        label={copy.temporaryEditing}
                        checked={!!props.temporaryEditing}
                        disabled={
                          props.temporaryEditing === undefined ||
                          props.temporaryEditingPending
                        }
                        onChange={props.onTemporaryEditingChange}
                      />
                    </div>
                    {props.onTranslateWithContext && (
                      <button
                        type="button"
                        className="button button--ghost"
                        disabled={busy || props.temporaryEditing === undefined}
                        onClick={() => {
                          setReadingOpen(false);
                          props.onTranslateWithContext?.();
                        }}
                      >
                        {copy.translateWithContext}
                      </button>
                    )}
                    {error && <Notice>{error}</Notice>}
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          )}
          <IconButton label={copy.settings} onClick={props.onOpenSettings}>
            <Settings2 size={18} strokeWidth={1.7} />
          </IconButton>
        </div>
      </header>
      <LanguagePreferences
        preferences={props.preferences}
        onPreferencesChange={props.onPreferencesChange}
        compact
      />
      <div className="popup-actions">
        <Button
          variant="primary"
          disabled={busy && !props.pageTranslated}
          onClick={
            props.pageTranslated ? props.onRestorePage : props.onTranslatePage
          }
        >
          <Languages size={17} />
          {props.pageTranslated ? copy.restorePage : copy.translatePage}
        </Button>
        <Button variant="ghost" onClick={props.onOpenWorkspace}>
          {copy.openWorkspace}
          <ArrowUpRight size={15} />
        </Button>
      </div>
      {props.temporaryTranslationUntil && (
        <div className="popup-temporary">
          <span>
            {temporaryTranslationUntil(
              new Date(props.temporaryTranslationUntil).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            )}
          </span>
          <Button variant="ghost" onClick={props.onStopTemporaryTranslation}>
            {copy.stopTemporaryTranslation}
          </Button>
        </div>
      )}
      {error && !readingOpen && <Notice>{error}</Notice>}
      <footer className="popup-footer">
        <ModelStatusView status={props.status} />
        <p>{copy.localPrivacy}</p>
      </footer>
    </main>
  );
}
