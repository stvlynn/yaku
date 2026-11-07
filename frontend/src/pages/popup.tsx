import { ArrowUpRight, Languages, Settings2 } from "lucide-react";
import type { ModelStatus } from "../entities/translation";
import {
  LanguagePreferences,
  type PreferencesProps,
} from "../features/preferences";
import { copy } from "../shared/i18n";
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
          disabled={busy}
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
