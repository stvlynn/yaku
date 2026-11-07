import { ArrowUpRight, Languages, Settings2 } from "lucide-react";
import type { ModelStatus } from "../entities/translation";
import {
  LanguagePreferences,
  type PreferencesProps,
} from "../features/preferences";
import { copy, temporaryTranslationUntil } from "../shared/i18n";
import {
  Brand,
  Button,
  IconButton,
  ModelStatusView,
  Notice,
} from "../shared/ui";
export interface PopupPageProps extends PreferencesProps {
  status: ModelStatus;
  error?: string;
  pageTranslated?: boolean;
  temporaryTranslationUntil?: number;
  onStopTemporaryTranslation?: () => void;
  onTranslatePage: () => void;
  onRestorePage: () => void;
  onOpenWorkspace: () => void;
  onOpenSettings: () => void;
}
export function PopupPage(props: PopupPageProps) {
  const busy = ["downloading", "loading", "translating"].includes(
    props.status.phase,
  );
  return (
    <main className="popup-page">
      <header className="popup-header">
        <Brand compact />
        <IconButton label={copy.settings} onClick={props.onOpenSettings}>
          <Settings2 size={18} strokeWidth={1.7} />
        </IconButton>
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
      {(props.error || props.status.error) && (
        <Notice>{props.error || props.status.error}</Notice>
      )}
      <footer className="popup-footer">
        <ModelStatusView status={props.status} />
        <p>{copy.localPrivacy}</p>
      </footer>
    </main>
  );
}
