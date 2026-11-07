import { useEffect, useState } from "react";
import {
  defaultSettings,
  resolveGlossary,
  type Settings,
  type WorkspaceMode,
} from "../../../entities/settings";
import {
  readSettings,
  saveSettings,
  onSettingsChanged,
} from "../../../features/preferences";
import {
  prepareModel,
  useModelStatus,
  useTranslationSession,
  translateText,
  cancelTranslation,
} from "../../../features/translation-session";
import {
  prepareDocument,
  translateDocument,
} from "../../../features/document-translation";
import { copy } from "../../../shared/i18n";
import { ocrLanguageFor } from "../../../entities/translation";
import { request } from "../../../shared/messaging";
import type { TemporaryTranslation } from "../../../features/temporary-translation";

export type Surface =
  "popup" | "options" | "workspace" | "sidepanel" | "welcome";
const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function useExtensionController(surface: Surface) {
  const [preferences, setPreferences] = useState<Settings>(defaultSettings);
  const [error, setError] = useState<string>();
  const [source, setSource] = useState("");
  const [mode, setMode] = useState<WorkspaceMode>("text");
  const [writingStyle, setWritingStyle] = useState<"grammar" | "polite">(
    "grammar",
  );
  const [file, setFile] = useState<File>();
  const [password, setPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [fileResult, setFileResult] = useState("");
  const [download, setDownload] = useState<{ blob: Blob; name: string }>();
  const [renderedDownload, setRenderedDownload] = useState<{
    kind: "image" | "pdf";
    render: () => Promise<Blob>;
    name: string;
  }>();
  const [copied, setCopied] = useState(false);
  const [translated, setTranslated] = useState(false);
  const [temporaryTranslation, setTemporaryTranslation] =
    useState<TemporaryTranslation | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileProgress, setFileProgress] = useState<{
    completed: number;
    total: number;
  }>();
  const [fileController, setFileController] = useState<AbortController>();
  const [step, setStep] = useState<"welcome" | "model" | "try" | "done">(
    "welcome",
  );
  const [cacheInfo, setCacheInfo] = useState<{
    bytes: number;
    total: number;
    complete: boolean;
  }>();
  const status = useModelStatus();
  const session = useTranslationSession();
  const glossary = resolveGlossary(preferences, {
    targetLanguage: preferences.targetLanguage,
  });
  async function refreshTemporaryTranslation(tabId: number) {
    setTemporaryTranslation(
      await request<TemporaryTranslation | null>({
        destination: "background",
        action: "temporary-translation-state",
        payload: { tabId },
      }),
    );
  }
  useEffect(() => () => fileController?.abort(), [fileController]);
  const translationSettings = JSON.stringify([
    preferences.sourceLanguage,
    preferences.targetLanguage,
    glossary,
  ]);
  useEffect(() => {
    fileController?.abort();
    session.clear();
    setDownload(undefined);
    setRenderedDownload(undefined);
    setFileResult("");
  }, [translationSettings]);
  useEffect(() => {
    void readSettings().then(setPreferences, (failure) =>
      setError(describeError(failure)),
    );
    return onSettingsChanged(setPreferences);
  }, []);
  useEffect(() => {
    if (surface !== "popup") return;
    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(async ([tab]) => {
        if (!tab?.id) return;
        const reply = await chrome.tabs.sendMessage(
          tab.id,
          {
            destination: "content",
            action: "page-state",
          },
          { frameId: 0 },
        );
        if (reply?.ok) setTranslated(Boolean(reply.value));
        await refreshTemporaryTranslation(tab.id);
      })
      .catch(() => setError(copy.pageUnavailable));
  }, [surface]);
  useEffect(() => {
    if (surface !== "popup") return;
    const changed = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (
        area !== "local" ||
        !Object.keys(changes).some((key) =>
          key.startsWith("temporaryTranslation:"),
        )
      )
        return;
      void chrome.tabs
        .query({ active: true, currentWindow: true })
        .then(async ([tab]) => {
          if (tab?.id !== undefined) await refreshTemporaryTranslation(tab.id);
        })
        .catch((failure) => setError(describeError(failure)));
    };
    chrome.storage.onChanged.addListener(changed);
    return () => chrome.storage.onChanged.removeListener(changed);
  }, [surface]);
  useEffect(() => {
    if (!temporaryTranslation) return;
    const timer = setTimeout(
      () => setTemporaryTranslation(null),
      Math.max(0, temporaryTranslation.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [temporaryTranslation]);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
  }, [preferences.theme]);
  useEffect(() => {
    if (surface === "options")
      void request<{ bytes: number; total: number; complete: boolean }>({
        destination: "background",
        action: "cache-info",
      }).then(setCacheInfo, (failure) => setError(describeError(failure)));
  }, [surface, status.phase]);
  const modelAction = (action: string) => {
    void request({ destination: "background", action })
      .then(async () => {
        if (surface === "options")
          setCacheInfo(
            await request({ destination: "background", action: "cache-info" }),
          );
      })
      .catch((failure) => setError(describeError(failure)));
  };
  function update(patch: Partial<Settings>) {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    setError(undefined);
    void saveSettings(next).catch((failure) =>
      setError(describeError(failure)),
    );
  }
  function openWorkspace() {
    void chrome.tabs.create({ url: chrome.runtime.getURL("workspace.html") });
  }
  function openSettings() {
    void chrome.runtime.openOptionsPage();
  }
  async function pageAction(action: "translate-page" | "restore-page") {
    try {
      setError(undefined);
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) throw new Error(copy.noActivePage);
      const reply = await chrome.tabs.sendMessage(tab.id, {
        destination: "content",
        action,
      });
      if (!reply?.ok) throw new Error(reply?.error ?? copy.pageUnavailable);
      const state = await chrome.tabs.sendMessage(
        tab.id,
        {
          destination: "content",
          action: "page-state",
        },
        { frameId: 0 },
      );
      if (!state?.ok) throw new Error(state?.error ?? copy.pageUnavailable);
      setTranslated(Boolean(state.value));
      await refreshTemporaryTranslation(tab.id);
    } catch (failure) {
      setError(describeError(failure));
    }
  }
  async function stopTemporaryTranslation() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id === undefined) throw new Error(copy.noActivePage);
      await request({
        destination: "background",
        action: "stop-temporary-translation",
        payload: { tabId: tab.id },
      });
      setTemporaryTranslation(null);
    } catch (failure) {
      setError(describeError(failure));
    }
  }
  async function translateFile() {
    if (!file) return;
    const controller = new AbortController();
    setFileController(controller);
    setFileBusy(true);
    setDownload(undefined);
    setRenderedDownload(undefined);
    setError(undefined);
    setFileResult("");
    setFileProgress(undefined);
    const outputs: string[] = [];
    let documentPreview: (() => string) | undefined;
    try {
      const translate: typeof translateText = async (input) => {
        const abort = () => {
          void cancelTranslation(input.id);
        };
        controller.signal.addEventListener("abort", abort, { once: true });
        try {
          const result = await translateText({
            ...input,
            sourceLanguage: preferences.sourceLanguage,
            glossary,
          });
          controller.signal.throwIfAborted();
          outputs.push(result.text);
          if (!documentPreview) setFileResult(outputs.join("\n\n"));
          return result;
        } finally {
          controller.signal.removeEventListener("abort", abort);
        }
      };
      const options = {
        targetLanguage: preferences.targetLanguage,
        sourceLanguage: preferences.sourceLanguage,
        signal: controller.signal,
        translate,
        onProgress: (completed: number, total: number) =>
          setFileProgress({ completed, total }),
      };
      let blob: Blob;
      let name: string;
      const ocrLanguage = ocrLanguageFor(preferences.sourceLanguage);
      if (mode === "image") {
        const { translateImage } =
          await import("../../../features/image-translation");
        const result = await translateImage(file, {
          ...options,
          ocrLanguage,
          onProgress: (progress) =>
            setFileProgress({
              completed: Math.round(progress * 100),
              total: 100,
            }),
          onTranslationProgress: options.onProgress,
        });
        blob = result.exportHtml();
        name = file.name.replace(/\.[^.]+$/, ".translated.html");
        setRenderedDownload({
          kind: "image",
          render: result.exportPng,
          name: file.name.replace(/\.[^.]+$/, ".translated.png"),
        });
        setSource(result.source);
        setFileResult(result.translation);
      } else if (/\.pdf$/i.test(file.name)) {
        const { preparePdf, translatePdf } =
          await import("../../../features/pdf-translation");
        const { prepareImage } =
          await import("../../../features/image-translation");
        const prepared = await preparePdf(file, {
          password: password || undefined,
          signal: controller.signal,
          recognize: (image) =>
            prepareImage(new File([image], "page.png", { type: "image/png" }), {
              signal: controller.signal,
              ocrLanguage,
            }),
        });
        const result = await translatePdf(prepared, options);
        blob = result.exportHtml();
        name = file.name.replace(/\.pdf$/i, ".translated.html");
        setRenderedDownload({
          kind: "pdf",
          render: result.exportPdf,
          name: file.name.replace(/\.pdf$/i, ".translated.pdf"),
        });
        setSource(result.source);
        setFileResult(result.translation);
      } else {
        const prepared = await prepareDocument(file);
        documentPreview = prepared.translationPreview;
        blob = await translateDocument(prepared, {
          ...options,
          bilingual: preferences.mode === "bilingual",
          onProgress: (completed, total) => {
            options.onProgress(completed, total);
            if (documentPreview) setFileResult(documentPreview());
          },
        });
        setFileResult(documentPreview?.() ?? outputs.join("\n\n"));
        name = prepared.name;
      }
      controller.signal.throwIfAborted();
      setDownload({ blob, name });
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (failure instanceof Error && failure.name === "PasswordException") {
          setPasswordRequired(true);
          setError(
            password ? copy.pdfPasswordInvalid : copy.pdfPasswordRequired,
          );
        } else setError(describeError(failure));
      }
    } finally {
      setFileBusy(false);
      setFileController(undefined);
    }
  }
  const props = { preferences, onPreferencesChange: update, status, error };
  const saveFile = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const textMode = mode === "text" || mode === "writing";
  return {
    popup: {
      ...props,
      pageTranslated: translated,
      temporaryTranslationUntil: temporaryTranslation?.expiresAt,
      onStopTemporaryTranslation: () => void stopTemporaryTranslation(),
      onTranslatePage: () => void pageAction("translate-page"),
      onRestorePage: () => void pageAction("restore-page"),
      onOpenWorkspace: openWorkspace,
      onOpenSettings: openSettings,
    },
    options: {
      ...props,
      cacheInfo,
      onCancelDownload: () => modelAction("cancel-download"),
      onClearModelCache: () => modelAction("clear-model-cache"),
      onOpenWorkspace: openWorkspace,
      onPrepareModel: () =>
        void prepareModel().catch((failure) =>
          setError(describeError(failure)),
        ),
    },
    welcome: {
      ...props,
      step,
      source: source || copy.trySample,
      result: session.result,
      canContinue:
        step === "welcome" ||
        (step === "model" && status.phase === "ready") ||
        (step === "try" && !!session.result),
      onSourceChange: setSource,
      onTranslate: () =>
        void session.translate({
          text: source || copy.trySample,
          targetLanguage: preferences.targetLanguage,
          glossary,
        }),
      onPrepareModel: () => modelAction("prepare"),
      onCancelDownload: () => modelAction("cancel-download"),
      onContinue: () => {
        if (step === "welcome") {
          setStep("model");
          modelAction("prepare");
        } else if (step === "model") setStep("try");
        else setStep("done");
      },
      onBack: () => setStep(step === "try" ? "model" : "welcome"),
      onFinish: () => {
        void chrome.storage.local.set({ onboardingComplete: true });
        location.href = chrome.runtime.getURL("workspace.html");
      },
    },
    workspace: {
      ...props,
      passwordRequired,
      password,
      onPasswordChange: setPassword,
      status:
        fileBusy || session.busy
          ? {
              ...status,
              phase: (["loading", "downloading"].includes(status.phase)
                ? status.phase
                : "translating") as typeof status.phase,
            }
          : status,
      error: error ?? session.error,
      mode,
      availableModes: [
        "text",
        "writing",
        "document",
        "subtitle",
        "image",
      ] as WorkspaceMode[],
      progress: fileProgress,
      writingStyle,
      onWritingStyleChange: (style: "grammar" | "polite") => {
        setWritingStyle(style);
        session.clear();
      },
      onModeChange: (next: WorkspaceMode) => {
        setError(undefined);
        setFileProgress(undefined);
        setCopied(false);
        setMode(next);
        setFile(undefined);
        setPassword("");
        setPasswordRequired(false);
        setSource("");
        session.clear();
        setDownload(undefined);
        setRenderedDownload(undefined);
        setFileResult("");
      },
      source,
      onSourceChange: (value: string) => {
        setError(undefined);
        setSource(value);
        session.clear();
        setCopied(false);
      },
      result: textMode ? session.result : fileResult,
      copied,
      onTranslate: () =>
        textMode
          ? void session.translate({
              text: source,
              targetLanguage: preferences.targetLanguage,
              sourceLanguage: preferences.sourceLanguage,
              glossary,
              task: mode === "writing" ? "rewrite" : "translate",
              writingStyle,
            })
          : void translateFile(),
      onCancel: () => {
        fileController?.abort();
        void session.cancel();
      },
      onCopy: () => {
        void navigator.clipboard
          .writeText(textMode ? session.result : fileResult)
          .then(
            () => setCopied(true),
            (failure) => setError(describeError(failure)),
          );
      },
      onFile: (selected: File) => {
        setSource("");
        setError(undefined);
        setFileProgress(undefined);
        setCopied(false);
        setPassword("");
        setPasswordRequired(false);
        setFile(selected);
        setFileResult("");
        setDownload(undefined);
        setRenderedDownload(undefined);
      },
      fileName: file?.name,
      onOpenSettings: openSettings,
      ...(download
        ? { onDownload: () => saveFile(download.blob, download.name) }
        : {}),
      ...(renderedDownload
        ? {
            [renderedDownload.kind === "image"
              ? "onDownloadImage"
              : "onDownloadPdf"]: () => {
              void renderedDownload.render().then(
                (blob) => saveFile(blob, renderedDownload.name),
                (failure) => setError(describeError(failure)),
              );
            },
          }
        : {}),
    },
  };
}
