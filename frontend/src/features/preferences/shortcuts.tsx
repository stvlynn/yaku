import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { copy } from "../../shared/i18n";
import { Button, Group, Notice, SettingRow } from "../../shared/ui";

export function ShortcutPreferences() {
  const [commands, setCommands] = useState<chrome.commands.Command[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    void chrome.commands
      .getAll()
      .then(setCommands, () => setError(copy.shortcutsUnavailable));
  }, []);
  const labels: Record<string, string> = {
    "toggle-page": copy.shortcutTogglePage,
    "translate-whole-page": copy.shortcutWholePage,
    "translate-input": copy.shortcutInput,
    "open-sidepanel": copy.shortcutSidePanel,
  };
  return (
    <Group>
      {commands
        .filter((command) => command.name && labels[command.name])
        .map((command) => (
          <SettingRow key={command.name} label={labels[command.name!]!}>
            {command.shortcut ? (
              <kbd className="shortcut-key">{command.shortcut}</kbd>
            ) : (
              <span className="muted">{copy.notAssigned}</span>
            )}
          </SettingRow>
        ))}
      <div className="data-actions">
        <Button
          onClick={() => {
            void chrome.tabs
              .create({ url: "chrome://extensions/shortcuts" })
              .catch(() => setError(copy.shortcutOpenError));
          }}
        >
          {copy.editShortcuts}
          <ArrowUpRight size={15} />
        </Button>
      </div>
      {error && <Notice>{error}</Notice>}
    </Group>
  );
}
