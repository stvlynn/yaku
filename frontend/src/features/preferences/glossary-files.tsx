import { useEffect, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { copy } from "../../shared/i18n";
import { Button, Notice } from "../../shared/ui";
import type { GlossaryTermsProps } from "./contracts";
import {
  exportGlossaryCsv,
  GlossaryCsvError,
  importGlossaryCsv,
} from "./glossary-csv";

export function GlossaryFiles({ terms, onTermsChange }: GlossaryTermsProps) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const current = useRef({ terms, onTermsChange });
  current.current = { terms, onTermsChange };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return (
    <>
      <div className="data-actions">
        <Button onClick={() => input.current?.click()}>
          <Upload size={15} />
          {copy.importCsv}
        </Button>
        <Button
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([exportGlossaryCsv(terms)], {
                type: "text/csv;charset=utf-8",
              }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = "yaku-glossary.csv";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          <Download size={15} />
          {copy.exportCsv}
        </Button>
        <input
          ref={input}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-label={copy.importCsv}
          accept=".csv,text/csv"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              const text = await file.text();
              if (!mounted.current) return;
              const latest = current.current;
              const glossary = importGlossaryCsv(text, latest.terms);
              if (glossary !== latest.terms) latest.onTermsChange(glossary);
              setError("");
              setMessage(copy.glossaryCsvImported);
            } catch (failure) {
              setMessage("");
              setError(
                failure instanceof GlossaryCsvError
                  ? failure.message
                  : copy.glossaryCsvReadFailed,
              );
            }
            event.target.value = "";
          }}
        />
      </div>
      <p className="settings-feedback">{copy.glossaryCsvFormat}</p>
      {message && (
        <p className="settings-feedback" role="status">
          {message}
        </p>
      )}
      {error && <Notice>{error}</Notice>}
    </>
  );
}
