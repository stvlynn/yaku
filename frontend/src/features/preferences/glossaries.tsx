import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import {
  validGlossaryUrlPattern,
  type GlossaryCollection,
} from "../../entities/settings";
import { copy } from "../../shared/i18n";
import { Button, Choice, Group, IconButton, Notice } from "../../shared/ui";
import { targetLanguageOptions, type PreferencesProps } from "./contracts";
import { GlossaryTermsEditor } from "./terms-editor";

const globalId = "global";
export function GlossaryPreferences({
  preferences,
  onPreferencesChange,
}: PreferencesProps) {
  const [selected, setSelected] = useState(globalId);
  const [form, setForm] = useState<"new" | "edit">();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("");
  const [patterns, setPatterns] = useState("");
  const [error, setError] = useState("");
  const collection = preferences.glossaries.find(
    (item) => `library:${item.id}` === selected,
  );
  useEffect(() => {
    if (
      selected !== globalId &&
      !preferences.glossaries.some((item) => `library:${item.id}` === selected)
    ) {
      setSelected(globalId);
      setForm(undefined);
    }
  }, [selected, preferences.glossaries]);
  function openNew() {
    setName("");
    setLanguage("");
    setPatterns("");
    setError("");
    setForm("new");
  }
  function edit() {
    if (!collection) return;
    setName(collection.name);
    setLanguage(collection.targetLanguage);
    setPatterns(collection.urlPatterns.join("\n"));
    setError("");
    setForm("edit");
  }
  const options = [
    { value: globalId, label: copy.generalGlossary },
    ...preferences.glossaries.map((item) => ({
      value: `library:${item.id}`,
      label: item.name,
    })),
  ];
  return (
    <Group>
      <div className="glossary-toolbar">
        <Choice
          label={copy.glossaryCollection}
          value={selected}
          options={options}
          onChange={(value) => {
            setSelected(value);
            setForm(undefined);
            setError("");
          }}
        />
        <Button onClick={openNew}>
          <Plus size={15} />
          {copy.newGlossary}
        </Button>
        {collection && (
          <>
            <IconButton label={copy.editGlossary} onClick={edit}>
              <Pencil size={15} />
            </IconButton>
            <IconButton
              label={copy.deleteGlossary}
              onClick={() => {
                onPreferencesChange({
                  glossaries: preferences.glossaries.filter(
                    (item) => item.id !== collection.id,
                  ),
                });
                setSelected(globalId);
                setForm(undefined);
              }}
            >
              <Trash2 size={15} />
            </IconButton>
          </>
        )}
      </div>
      {form ? (
        <form
          className="glossary-metadata"
          onSubmit={(event) => {
            event.preventDefault();
            const title = name.trim();
            if (!title) {
              setError(copy.glossaryNameRequired);
              return;
            }
            const urls = [
              ...new Set(
                patterns
                  .split(/\r?\n/)
                  .map((value) => value.trim())
                  .filter(Boolean),
              ),
            ];
            const invalid = urls.find(
              (pattern) => !validGlossaryUrlPattern(pattern),
            );
            if (invalid) {
              setError(`${copy.invalidGlossaryPattern}: ${invalid}`);
              return;
            }
            const next: GlossaryCollection = {
              id:
                form === "edit" && collection
                  ? collection.id
                  : crypto.randomUUID(),
              name: title,
              targetLanguage: language,
              urlPatterns: urls,
              terms: form === "edit" && collection ? collection.terms : {},
            };
            onPreferencesChange({
              glossaries:
                form === "edit"
                  ? preferences.glossaries.map((item) =>
                      item.id === next.id ? next : item,
                    )
                  : [...preferences.glossaries, next],
            });
            setSelected(`library:${next.id}`);
            setForm(undefined);
            setError("");
          }}
        >
          <div className="glossary-metadata-row">
            <label>
              <span className="field-label">{copy.glossaryName}</span>
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <div>
              <span className="field-label">{copy.target}</span>
              <Choice
                label={copy.glossaryLanguage}
                value={language}
                options={[
                  { value: "", label: copy.allLanguages },
                  ...targetLanguageOptions,
                ]}
                onChange={setLanguage}
              />
            </div>
          </div>
          <label>
            <span className="field-label">{copy.glossaryUrls}</span>
            <textarea
              className="input"
              value={patterns}
              onChange={(event) => setPatterns(event.target.value)}
              placeholder={copy.glossaryUrlExample}
              aria-describedby="glossary-url-help"
            />
          </label>
          <small id="glossary-url-help">{copy.glossaryUrlHelp}</small>
          {error && <Notice>{error}</Notice>}
          <div className="rule-actions">
            <Button type="submit">
              <Check size={15} />
              {copy.saveGlossary}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setForm(undefined);
                setError("");
              }}
            >
              {copy.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="glossary-scope">
            <span>
              {collection?.targetLanguage
                ? copy.languages[collection.targetLanguage]
                : copy.allLanguages}
            </span>
            <span>
              {collection?.urlPatterns.length
                ? collection.urlPatterns.join(", ")
                : copy.allPages}
            </span>
          </div>
          {(selected === globalId || collection) && (
            <GlossaryTermsEditor
              key={selected}
              terms={collection ? collection.terms : preferences.glossary}
              onTermsChange={(terms) =>
                collection
                  ? onPreferencesChange({
                      glossaries: preferences.glossaries.map((item) =>
                        item.id === collection.id ? { ...item, terms } : item,
                      ),
                    })
                  : onPreferencesChange({ glossary: terms })
              }
            />
          )}
        </>
      )}
    </Group>
  );
}
