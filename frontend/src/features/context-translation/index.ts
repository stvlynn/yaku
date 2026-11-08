import type { Settings } from "../../entities/settings";
import type { Translate } from "../../entities/translation";
import { copy } from "../../shared/i18n";
import { createRequestId } from "../../shared/request-id";
import { contentThemeCss } from "../../shared/styles/content-theme";
import {
  composedParent,
  matchesComposed,
} from "../../shared/translation-markup";
import { createEditorTracker } from "./editor";
import { contextErrors } from "./config";

export function installContextTranslation(options: {
  document: Document;
  getSettings: () => Settings;
  translate: Translate;
  onError: (error: unknown) => void;
  cancel?: (id: string) => Promise<void>;
}) {
  const { document, getSettings, translate, onError, cancel } = options;
  const view = document.defaultView!;
  const host = document.createElement("div");
  host.dataset.yakuOwned = "true";
  const shadow = host.attachShadow({ mode: "closed" });
  const sheet = document.createElement("style");
  sheet.textContent = `${contentThemeCss}:host{position:fixed;z-index:2147483647;inset:auto 20px 82px auto}section{width:420px;max-width:calc(100vw - 40px);max-height:60vh;overflow:auto;background:var(--card);border:1px solid var(--border);border-radius:var(--radius-card);padding:16px;box-shadow:var(--shadow-2)}p{white-space:pre-wrap;margin:0 0 16px;line-height:1.7;font-size:14px}nav{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}`;
  shadow.append(sheet);
  document.documentElement.append(host);
  let generation = 0;
  const requestSettingsKey = (settings = getSettings()) =>
    JSON.stringify([
      settings.sourceLanguage,
      settings.targetLanguage,
      settings.glossary,
    ]);
  function currentRequest(revision: number, settingsKey: string) {
    if (generation !== revision) return false;
    if (settingsKey !== requestSettingsKey()) {
      close();
      return false;
    }
    return true;
  }
  let panel: HTMLElement | undefined;
  let selected = "";
  let selectedContext = "";
  let hovered: Element | undefined;
  let hoverResult: Element | undefined;
  let requestId: string | undefined;
  let inputEditor: HTMLElement | undefined;
  let selectedLanguage =
    document.documentElement.lang || view.navigator.language;
  let speechPanel:
    | {
        result: HTMLElement;
        actions: HTMLElement;
        language: string;
        original: boolean;
        busy: boolean;
      }
    | undefined;
  const abort = new AbortController();
  const signal = abort.signal;
  const editors = createEditorTracker(document, signal, (element) => {
    if (element === inputEditor && requestId) close();
  });
  function allowed(node: Node, editable = false): boolean {
    const exclusions =
      '[data-yaku-owned]:not([data-yaku-owned="source"]),[translate="no"],.notranslate,script,style,code,pre,kbd,samp,[hidden],[aria-hidden="true"]';
    if (
      matchesComposed(node, exclusions) ||
      (!editable &&
        matchesComposed(
          node,
          'input,textarea,select,[contenteditable]:not([contenteditable="false"])',
        ))
    )
      return false;
    const rule = getSettings().siteRules.find(
      (item) =>
        document.location.hostname === item.hostname ||
        document.location.hostname.endsWith(`.${item.hostname}`),
    );
    if (
      rule?.action === "never" ||
      (rule?.excludeSelector && matchesComposed(node, rule.excludeSelector))
    )
      return false;
    for (
      let element =
        node.nodeType === 1 ? (node as Element) : composedParent(node);
      element;
      element = composedParent(element)
    ) {
      const style = view.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse"
      )
        return false;
    }
    return true;
  }
  function paragraph(node: Node): Element | undefined {
    for (
      let element =
        node.nodeType === 1 ? (node as Element) : composedParent(node);
      element;
      element = composedParent(element)
    )
      if (element.matches("p,li,blockquote,h1,h2,h3,td,th,figcaption"))
        return element;
  }
  function sourceText(element: Element): string {
    const walker = document.createTreeWalker(element, 4);
    const values: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode())
      if (allowed(node)) values.push(node.textContent ?? "");
    return values.join("");
  }
  function hoverTranslate() {
    if (!hovered || !allowed(hovered)) return;
    if (hoverResult === hovered && panel) {
      close();
      hoverResult = undefined;
      return;
    }
    const text = sourceText(hovered);
    if (!text.trim()) return;
    void run(text);
    hoverResult = hovered;
  }
  function refreshSpeech() {
    const state = speechPanel;
    if (!state) return;
    state.actions.querySelector("[data-speech]")?.remove();
    if (state.busy || !view.speechSynthesis) return;
    const voices = view.speechSynthesis
      .getVoices()
      .filter((voice) => voice.localService);
    const language = state.language.toLowerCase();
    const voice =
      voices.find((voice) => voice.lang.toLowerCase() === language) ??
      voices.find(
        (voice) =>
          voice.lang.toLowerCase().split("-")[0] === language.split("-")[0],
      );
    if (!voice) return;
    const speak = document.createElement("button");
    speak.dataset.speech = "true";
    speak.textContent = state.original
      ? copy.listenOriginal
      : copy.listenTranslation;
    speak.onclick = () => {
      view.speechSynthesis.cancel();
      const utterance = new view.SpeechSynthesisUtterance(
        state.result.textContent ?? "",
      );
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.onerror = (event) => {
        if (!["canceled", "interrupted"].includes(event.error))
          onError(new Error(`${contextErrors.speech} (${event.error})`));
      };
      view.speechSynthesis.speak(utterance);
    };
    state.actions.prepend(speak);
  }
  view.speechSynthesis?.addEventListener("voiceschanged", refreshSpeech, {
    signal,
  });
  view.speechSynthesis?.getVoices();
  function close() {
    generation++;
    if (requestId) void cancel?.(requestId).catch(onError);
    requestId = undefined;
    inputEditor = undefined;
    view.speechSynthesis?.cancel();
    speechPanel = undefined;
    panel?.remove();
    panel = undefined;
  }
  function show(
    text: string,
    canTranslate = false,
    busy = false,
    languageOverride?: string,
  ) {
    close();
    host.dataset.theme = getSettings().theme;
    panel = document.createElement("section");
    panel.dataset.mode = canTranslate ? "selection" : "result";
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", copy.resultText);
    const result = document.createElement("p");
    result.textContent = text;
    const language =
      languageOverride ??
      (canTranslate
        ? getSettings().sourceLanguage === "auto"
          ? selectedLanguage
          : getSettings().sourceLanguage
        : getSettings().targetLanguage);
    result.dir = "auto";
    result.lang = language;
    result.setAttribute("aria-live", "polite");
    const actions = document.createElement("nav");
    const dismiss = document.createElement("button");
    dismiss.textContent = copy.close;
    dismiss.className = "ghost";
    dismiss.onclick = close;
    if (canTranslate) {
      const start = document.createElement("button");
      start.textContent = copy.translateSelection;
      start.className = "primary";
      start.onclick = () => {
        void run(selected);
      };
      actions.append(start);
      const explain = document.createElement("button");
      explain.textContent = copy.explainSelection;
      explain.onclick = () => {
        void run(selected, "explain");
      };
      actions.append(explain);
    } else {
      const button = document.createElement("button");
      button.textContent = copy.copyTranslation;
      button.dataset.copy = "true";
      button.disabled = busy;
      button.onclick = () => {
        button.disabled = true;
        void view.navigator.clipboard.writeText(result.textContent ?? "").then(
          () => {
            button.textContent = copy.copied;
            button.disabled = false;
          },
          (error) => {
            button.disabled = false;
            onError(error);
          },
        );
      };
      actions.append(button);
    }
    actions.append(dismiss);
    panel.append(result, actions);
    shadow.append(panel);
    speechPanel = { result, actions, language, original: canTranslate, busy };
    refreshSpeech();
    return result;
  }
  async function run(
    text: string,
    task: "translate" | "explain" = "translate",
  ) {
    if (!text.trim()) return;
    const result = show(copy.translating, false, true);
    const revision = generation;
    const settings = getSettings();
    const settingsKey = requestSettingsKey(settings);
    const id = createRequestId();
    requestId = id;
    try {
      const output = await translate({
        id,
        text,
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
        glossary: settings.glossary,
        task,
        context: task === "explain" ? selectedContext : undefined,
      });
      if (currentRequest(revision, settingsKey)) {
        requestId = undefined;
        show(output.text, false, false, settings.targetLanguage);
      }
    } catch (error) {
      if (currentRequest(revision, settingsKey))
        result.textContent =
          error instanceof Error ? error.message : String(error);
      if (currentRequest(revision, settingsKey)) onError(error);
    } finally {
      if (requestId === id) requestId = undefined;
    }
  }
  document.addEventListener(
    "mouseup",
    (event) => {
      if (
        !getSettings().selectionEnabled ||
        event.composedPath().includes(host)
      )
        return;
      const text = view.getSelection()?.toString().trim();
      const anchor = view.getSelection()?.anchorNode;
      if (!text || !anchor || !allowed(anchor)) {
        selected = "";
        selectedContext = "";
        if (panel?.dataset.mode === "selection") close();
        return;
      }
      selected = text;
      hoverResult = undefined;
      selectedLanguage =
        document.documentElement.lang || view.navigator.language;
      for (
        let element: Element | null = anchor.parentElement;
        element;
        element = composedParent(element)
      )
        if (element.getAttribute("lang")) {
          selectedLanguage = element.getAttribute("lang")!;
          break;
        }
      selectedContext = paragraph(anchor)
        ? sourceText(paragraph(anchor)!)
        : text;
      show(text, true);
    },
    { signal },
  );
  document.addEventListener(
    "pointerover",
    (event) => {
      const target = event
        .composedPath()
        .find((node) => node instanceof view.Element) as Element | undefined;
      if (target) {
        const previous = hovered;
        hovered = undefined;
        hovered = paragraph(target);
        if (hovered && !allowed(hovered)) hovered = undefined;
        if (
          event.altKey &&
          !event.ctrlKey &&
          getSettings().hoverEnabled &&
          hovered !== previous &&
          hovered
        )
          hoverTranslate();
      }
    },
    { signal },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.isComposing) return;
      if (event.key === "Escape") close();
      if (
        event.key === "Alt" &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.metaKey &&
        !editors.activeEditor() &&
        getSettings().hoverEnabled
      )
        hoverTranslate();
    },
    { signal },
  );
  async function translateInput() {
    if (!getSettings().inputEnabled) return;
    const element = editors.activeEditor();
    if (!element || !allowed(element, true)) return;
    let snapshot: ReturnType<typeof editors.capture>;
    try {
      snapshot = editors.capture(element);
    } catch (error) {
      show(error instanceof Error ? error.message : String(error));
      onError(error);
      return;
    }
    if (!snapshot?.text.trim()) return;
    const settings = getSettings();
    const settingsKey = requestSettingsKey(settings);
    show(copy.translating, false, true);
    const revision = generation;
    const id = createRequestId();
    requestId = id;
    inputEditor = element;
    let output;
    try {
      output = await translate({
        id,
        text: snapshot.text,
        sourceLanguage: settings.sourceLanguage,
        context: snapshot.codec?.instruction,
        targetLanguage: settings.targetLanguage,
        glossary: settings.glossary,
      });
    } catch (error) {
      if (!currentRequest(revision, settingsKey)) return;
      if (generation === revision)
        show(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      if (requestId === id) {
        requestId = undefined;
        inputEditor = undefined;
      }
    }
    if (!currentRequest(revision, settingsKey)) return;
    if (!editors.current(snapshot)) {
      close();
      return;
    }
    let transaction: ReturnType<typeof editors.apply>;
    try {
      transaction = editors.apply(snapshot, output.text);
    } catch (error) {
      show(error instanceof Error ? error.message : String(error));
      onError(error);
      return;
    }
    if (!transaction) {
      close();
      return;
    }
    show(transaction.text, false, false, settings.targetLanguage);
    const undo = document.createElement("button");
    undo.textContent = copy.undoInput;
    undo.onclick = () => {
      if (!transaction.canUndo()) {
        close();
        return;
      }
      if (transaction.undo()) close();
    };
    panel?.querySelector("nav")?.prepend(undo);
  }
  return {
    translateSelection: () => {
      const selection = view.getSelection();
      const text = selection?.toString().trim();
      if (text && selection?.anchorNode && allowed(selection.anchorNode)) {
        selected = text;
        selectedContext = paragraph(selection.anchorNode)
          ? sourceText(paragraph(selection.anchorNode)!)
          : text;
        return run(text);
      }
      return Promise.resolve();
    },
    translateInput,
    dispose: () => {
      abort.abort();
      close();
      host.remove();
    },
  };
}
