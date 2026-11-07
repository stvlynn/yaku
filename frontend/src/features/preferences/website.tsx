import { useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import type { SiteRule } from "../../entities/settings";
import { copy } from "../../shared/i18n";
import { Button, Choice, Group, IconButton, Notice } from "../../shared/ui";
import type { PreferencesProps } from "./contracts";
import { validHostname } from "./model";

export function WebsitePreferences({
  preferences,
  onPreferencesChange,
}: PreferencesProps) {
  const hostnameInput = useRef<HTMLInputElement>(null);
  const [hostname, setHostname] = useState("");
  const [action, setAction] = useState<"always" | "never">("always");
  const [selector, setSelector] = useState("");
  const [excludeSelector, setExcludeSelector] = useState("");
  const [editing, setEditing] = useState<string>();
  const [error, setError] = useState("");
  function clear() {
    setHostname("");
    setSelector("");
    setExcludeSelector("");
    setEditing(undefined);
    setError("");
  }
  function validCss(value: string) {
    if (!value.trim()) return true;
    try {
      document.querySelector(value);
      return true;
    } catch {
      return false;
    }
  }
  return (
    <Group>
      <form
        className="rule-form"
        onSubmit={(event) => {
          event.preventDefault();
          const normalized = hostname.trim().toLowerCase();
          if (!validHostname(normalized)) {
            setError(copy.invalidHostname);
            return;
          }
          if (
            preferences.siteRules.some(
              (rule) =>
                rule.hostname === normalized && rule.hostname !== editing,
            )
          ) {
            setError(copy.duplicateRule);
            return;
          }
          if (!validCss(selector) || !validCss(excludeSelector)) {
            setError(copy.invalidSelector);
            return;
          }
          const rule: SiteRule = {
            hostname: normalized,
            action,
            ...(selector.trim() ? { selector: selector.trim() } : {}),
            ...(excludeSelector.trim()
              ? { excludeSelector: excludeSelector.trim() }
              : {}),
          };
          onPreferencesChange({
            siteRules: editing
              ? preferences.siteRules.map((item) =>
                  item.hostname === editing ? rule : item,
                )
              : [...preferences.siteRules, rule],
          });
          clear();
        }}
      >
        <div className="rule-basics">
          <label>
            <span className="field-label">{copy.hostname}</span>
            <input
              ref={hostnameInput}
              className="input"
              value={hostname}
              placeholder={copy.hostnamePlaceholder}
              onChange={(event) => setHostname(event.target.value)}
              required
            />
          </label>
          <label>
            <span className="field-label">{copy.action}</span>
            <Choice
              label={copy.action}
              value={action}
              options={[
                { value: "always", label: copy.always },
                { value: "never", label: copy.never },
              ]}
              onChange={(value) => setAction(value as "always" | "never")}
            />
          </label>
        </div>
        <details
          className="selector-fields"
          open={editing !== undefined || undefined}
        >
          <summary>{copy.selectors}</summary>
          <label>
            <span className="field-label">{copy.includeSelector}</span>
            <input
              className="input"
              value={selector}
              aria-label={copy.includeSelector}
              onChange={(event) => setSelector(event.target.value)}
              aria-describedby="include-selector-help"
            />
            <small id="include-selector-help">{copy.selectorHelp}</small>
          </label>
          <label>
            <span className="field-label">{copy.excludeSelector}</span>
            <input
              className="input"
              value={excludeSelector}
              aria-label={copy.excludeSelector}
              onChange={(event) => setExcludeSelector(event.target.value)}
              aria-describedby="exclude-selector-help"
            />
            <small id="exclude-selector-help">{copy.excludeSelectorHelp}</small>
          </label>
        </details>
        <div className="rule-actions">
          <Button type="submit">
            {editing ? <Check size={15} /> : <Plus size={15} />}
            {editing ? copy.saveRule : copy.addRule}
          </Button>
          {editing && (
            <Button variant="ghost" onClick={clear}>
              {copy.cancel}
            </Button>
          )}
        </div>
      </form>
      {error && <Notice>{error}</Notice>}
      {preferences.siteRules.length === 0 ? (
        <p className="empty-line">{copy.noRules}</p>
      ) : (
        preferences.siteRules.map((rule) => (
          <div className="list-row" key={rule.hostname}>
            <span className="list-primary">
              {rule.hostname}
              {rule.selector && <code>{rule.selector}</code>}
              {rule.excludeSelector && <code>{rule.excludeSelector}</code>}
            </span>
            <span className="muted">
              {rule.action === "always" ? copy.always : copy.never}
            </span>
            <IconButton
              label={`${copy.editRule}: ${rule.hostname}`}
              onClick={() => {
                setHostname(rule.hostname);
                setAction(rule.action);
                setSelector(rule.selector ?? "");
                setExcludeSelector(rule.excludeSelector ?? "");
                setEditing(rule.hostname);
                setError("");
                hostnameInput.current?.focus();
              }}
            >
              <Pencil size={15} />
            </IconButton>
            <IconButton
              label={`${copy.removeRule}: ${rule.hostname}`}
              onClick={() => {
                onPreferencesChange({
                  siteRules: preferences.siteRules.filter(
                    (item) => item.hostname !== rule.hostname,
                  ),
                });
                if (editing === rule.hostname) clear();
              }}
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))
      )}
    </Group>
  );
}
