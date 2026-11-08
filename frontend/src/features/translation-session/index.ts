import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ModelStatus,
  TranslationRequest,
  TranslationResult,
} from "../../entities/translation";
import { isModelStatus } from "../../entities/translation";
import { request } from "../../shared/messaging";

export async function translateText(
  payload: TranslationRequest,
): Promise<TranslationResult> {
  return request({ destination: "background", action: "translate", payload });
}
export async function cancelTranslation(id: string): Promise<void> {
  await request({ destination: "background", action: "cancel", payload: id });
}
export async function prepareModel(): Promise<void> {
  await request({ destination: "background", action: "prepare" });
}
export function useModelStatus() {
  const [status, setStatus] = useState<ModelStatus>({ phase: "idle" });
  useEffect(() => {
    let mounted = true;
    void chrome.storage.session.get("modelStatus").then((value) => {
      if (mounted && isModelStatus(value.modelStatus))
        setStatus(value.modelStatus);
    });
    const changed = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "session" && isModelStatus(changes.modelStatus?.newValue))
        setStatus(changes.modelStatus.newValue);
    };
    chrome.storage.onChanged.addListener(changed);
    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(changed);
    };
  }, []);
  return status;
}

export function useTranslationSession() {
  const [result, setResult] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const current = useRef<string | undefined>(undefined);
  const cancel = useCallback(async () => {
    const id = current.current;
    current.current = undefined;
    setBusy(false);
    if (id) await cancelTranslation(id);
  }, []);
  const translate = useCallback(
    async (input: Omit<TranslationRequest, "id">) => {
      await cancel();
      const id = crypto.randomUUID();
      current.current = id;
      setResult("");
      setError(undefined);
      setBusy(true);
      try {
        const output = await translateText({ ...input, id });
        if (current.current === id) setResult(output.text);
      } catch (failure) {
        if (current.current === id)
          setError(
            failure instanceof Error ? failure.message : String(failure),
          );
      } finally {
        if (current.current === id) {
          current.current = undefined;
          setBusy(false);
        }
      }
    },
    [cancel],
  );
  useEffect(
    () => () => {
      const id = current.current;
      current.current = undefined;
      if (id) void cancelTranslation(id);
    },
    [],
  );
  return {
    result,
    error,
    busy,
    translate,
    cancel,
    clear: () => {
      void cancel();
      setResult("");
    },
  };
}
