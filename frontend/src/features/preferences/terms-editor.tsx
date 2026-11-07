import { useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { copy } from "../../shared/i18n";
import { Button, IconButton, Notice } from "../../shared/ui";
import type { GlossaryTermsProps } from "./contracts";
import { GlossaryFiles } from "./glossary-files";

export function GlossaryTermsEditor({
  terms,
  onTermsChange,
}: GlossaryTermsProps) {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [editing, setEditing] = useState<string>();
  const [error, setError] = useState("");
  const sourceInput = useRef<HTMLInputElement>(null);
  function clear() {
    setSource("");
    setTarget("");
    setEditing(undefined);
    setError("");
  }
  const updating = editing !== undefined || Object.hasOwn(terms, source.trim());
  return (
    <>
      <GlossaryFiles terms={terms} onTermsChange={onTermsChange} />
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const term = source.trim();
          const value = target.trim();
          if (!term || !value) {
            setError(copy.requiredTerms);
            return;
          }
          const next = { ...terms, [term]: value };
          if (editing !== undefined && editing !== term) delete next[editing];
          onTermsChange(next);
          clear();
        }}
      >
        <label>
          <span className="field-label">{copy.sourceTerm}</span>
          <input
            ref={sourceInput}
            className="input"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            required
          />
        </label>
        <label>
          <span className="field-label">{copy.translatedTerm}</span>
          <input
            className="input"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            required
          />
        </label>
        <Button type="submit">
          {updating ? <Check size={16} /> : <Plus size={16} />}
          {updating ? copy.saveTerm : copy.addTerm}
        </Button>
        {editing !== undefined && (
          <Button variant="ghost" onClick={clear}>
            {copy.cancel}
          </Button>
        )}
      </form>
      {error && <Notice>{error}</Notice>}
      {Object.keys(terms).length === 0 ? (
        <p className="empty-line">{copy.noTerms}</p>
      ) : (
        Object.entries(terms).map(([term, translation]) => (
          <div className="list-row" key={term}>
            <span className="list-primary">{term}</span>
            <span className="muted">{translation}</span>
            <IconButton
              label={`${copy.editTerm}: ${term}`}
              onClick={() => {
                setSource(term);
                setTarget(translation);
                setEditing(term);
                sourceInput.current?.focus();
              }}
            >
              <Pencil size={15} />
            </IconButton>
            <IconButton
              label={`${copy.removeTerm}: ${term}`}
              onClick={() => {
                const next = { ...terms };
                delete next[term];
                onTermsChange(next);
                if (editing === term) clear();
              }}
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))
      )}
    </>
  );
}
