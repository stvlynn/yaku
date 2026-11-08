import {
  autoUpdate,
  computePosition,
  flip,
  hide,
  offset,
  shift,
} from "@floating-ui/dom";
import {
  inputKeyCharacters,
  inputTriggerPresses,
  type InputTrailingKey,
  type Settings,
} from "../../entities/settings";
import type { Translate } from "../../entities/translation";
import { copy } from "../../shared/i18n";
import { languages } from "../../shared/languages";
import { createRequestId } from "../../shared/request-id";
import { contentThemeCss } from "../../shared/styles/content-theme";
import {
  composedParent,
  matchesComposed,
} from "../../shared/translation-markup";
import { createEditorTracker } from "./editor";
import { contextErrors } from "./config";
import { conversationSample, supportedInputLanguage } from "./input-language";

export function installContextTranslation(options: {
  document: Document;
  getSettings: () => Settings;
  translate: Translate;
  onError: (error: unknown) => void;
  cancel?: (id: string) => Promise<void>;
  saveInputTargetLanguage?: (language: string) => Promise<void>;
  inputGlossary?: (language: string) => Settings["glossary"];
  detectLanguage?: (text: string) => Promise<string | undefined>;
}) {
  const {
    document,
    getSettings,
    translate,
    onError,
    cancel,
    saveInputTargetLanguage,
    inputGlossary,
    detectLanguage,
  } = options;
  const view = document.defaultView!;
  const host = document.createElement("div");
  host.dataset.yakuOwned = "true";
  const shadow = host.attachShadow({ mode: "closed" });
  const sheet = document.createElement("style");
  sheet.textContent = `${contentThemeCss}:host{position:fixed;z-index:2147483647;inset:auto 20px 82px auto}section{width:420px;max-width:calc(100vw - 40px);max-height:60vh;overflow:auto;background:var(--card);border:1px solid var(--border);border-radius:var(--radius-card);padding:16px;box-shadow:var(--shadow-2)}p{white-space:pre-wrap;margin:0 0 16px;line-height:1.7;font-size:14px}nav{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}`;
  shadow.append(sheet);
  sheet.textContent +=
    "select{max-width:100%;min-height:40px;padding:0 8px;font:inherit;font-size:13px;color:var(--foreground);background:var(--card);border:1px solid var(--border);border-radius:var(--radius-control)}select:focus-visible{outline:2px solid var(--ring);outline-offset:3px}";
  sheet.textContent +=
    'section[data-mode="input"]{width:max-content;max-width:calc(100vw - 12px);padding:6px}section[data-mode="input"] nav{justify-content:flex-start}section[data-mode="input"] p{position:absolute;width:1px;height:1px;margin:0;overflow:hidden;clip-path:inset(50%)}';
  sheet.textContent +=
    'section[data-mode="input"] [hidden]{display:none}button[data-input-options]{display:inline-flex;align-items:center;gap:8px;border:0;box-shadow:none}button[data-input-options]::after{content:"";width:6px;height:6px;border:solid currentColor;border-width:0 1px 1px 0;transform:rotate(45deg) translateY(-2px)}';
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
  let resultEditor: HTMLElement | undefined;
  let stopPositioning: (() => void) | undefined;
  let inputResultTimer: number | undefined;
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
  let trailingSequence:
    | {
        editor: HTMLElement;
        key: InputTrailingKey;
        count: number;
        time: number;
      }
    | undefined;
  let repeatingKey = false;
  const editors = createEditorTracker(document, signal, (element, event) => {
    if (element === inputEditor && requestId) close();
    if (event.type === "beforeinput") return;
    if (element === resultEditor) close();
    const settings = getSettings();
    const key = settings.inputTrailingKey;
    if (
      !(event instanceof view.InputEvent) ||
      !event.isTrusted ||
      event.isComposing ||
      event.inputType !== "insertText" ||
      !event.data ||
      event.data.length !== 1 ||
      !inputKeyCharacters(key).includes(event.data) ||
      repeatingKey ||
      !settings.inputEnabled ||
      !settings.inputSpaceTrigger ||
      !editors.caretAtEnd(element)
    ) {
      trailingSequence = undefined;
      return;
    }
    const interval = view.matchMedia("(pointer: coarse)").matches ? 300 : 200;
    const count =
      trailingSequence?.editor === element &&
      trailingSequence.key === key &&
      event.timeStamp - trailingSequence.time <= interval
        ? trailingSequence.count + 1
        : 1;
    trailingSequence = { editor: element, key, count, time: event.timeStamp };
    if (count !== inputTriggerPresses) return;
    trailingSequence = undefined;
    if (editors.activeEditor() === element)
      void translateInput(key).catch(onError);
  });
  for (const type of ["focusout", "pointerdown", "keyup"] as const)
    document.addEventListener(
      type,
      (event) => {
        repeatingKey = false;
        if (type !== "keyup") trailingSequence = undefined;
        if (
          type === "pointerdown" &&
          resultEditor &&
          !event.composedPath().includes(host)
        )
          close();
      },
      { capture: true, signal },
    );
  document.addEventListener(
    "keydown",
    (event) => {
      if (!event.isTrusted) return;
      const matches =
        event.key.length === 1 &&
        inputKeyCharacters(getSettings().inputTrailingKey).includes(event.key);
      repeatingKey = matches && event.repeat;
      if (!matches || repeatingKey) trailingSequence = undefined;
    },
    { capture: true, signal },
  );
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
  function sourceText(element: Element, limit = Infinity): string {
    const walker = document.createTreeWalker(element, 4);
    const values: string[] = [];
    let length = 0;
    for (
      let node = walker.nextNode();
      node && length < limit;
      node = walker.nextNode()
    ) {
      if (!allowed(node)) continue;
      const text = (node.textContent ?? "").slice(0, limit - length);
      values.push(text);
      length += text.length;
    }
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
    resultEditor = undefined;
    view.clearTimeout(inputResultTimer);
    inputResultTimer = undefined;
    stopPositioning?.();
    stopPositioning = undefined;
    host.style.removeProperty("inset");
    host.style.removeProperty("visibility");
    view.speechSynthesis?.cancel();
    speechPanel = undefined;
    panel?.remove();
    panel = undefined;
  }
  function anchorInputResult(editor: HTMLElement, result: HTMLElement) {
    resultEditor = editor;
    result.dataset.mode = "input";
    host.style.inset = "0 auto auto 0";
    host.style.visibility = "hidden";
    stopPositioning = autoUpdate(editor, host, () => {
      if (!editor.isConnected) {
        close();
        return;
      }
      void computePosition(editor, host, {
        strategy: "fixed",
        placement: "top-start",
        middleware: [
          offset(6),
          flip({ padding: 6, crossAxis: false }),
          shift({ padding: 6, crossAxis: true }),
          hide(),
        ],
      })
        .then(({ x, y, middlewareData }) => {
          if (panel !== result) return;
          host.style.inset = `${y}px auto auto ${x}px`;
          host.style.visibility = middlewareData.hide?.referenceHidden
            ? "hidden"
            : "visible";
        })
        .catch(onError);
    });
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
  async function translateInput(trailing?: InputTrailingKey) {
    const settings = getSettings();
    if (!settings.inputEnabled) return;
    const element = editors.activeEditor();
    if (!element || !allowed(element, true)) return;
    let snapshot: ReturnType<typeof editors.capture>;
    try {
      snapshot = editors.capture(element, settings.inputPrefixKey, trailing);
    } catch (error) {
      show(error instanceof Error ? error.message : String(error));
      onError(error);
      return;
    }
    if (!snapshot?.text.trim()) return;
    let target = snapshot.targetLanguage ?? settings.inputTargetLanguage;
    if (!snapshot.hasDirective && detectLanguage) {
      const conversation = settings.inputMatchConversation
        ? conversationSample(element, (node) => sourceText(node, 1024))
        : "";
      const page = settings.inputMatchPage
        ? (document.querySelector("main, article, [role=main]") ??
          document.body)
        : undefined;
      if (conversation || page) {
        close();
        const revision = generation;
        const url = document.URL;
        const observe = async (text: string) => {
          if (!text.trim()) return;
          return supportedInputLanguage(
            await detectLanguage(text).catch(() => undefined),
          );
        };
        const [conversationLanguage, draftLanguage] = await Promise.all([
          observe(conversation),
          settings.sourceLanguage === "auto"
            ? observe(
                snapshot.codec
                  ? snapshot.text.replace(/<\/?yaku-[^>]+>/g, "")
                  : snapshot.text,
              )
            : supportedInputLanguage(settings.sourceLanguage),
        ]);
        const inferred =
          conversationLanguage ??
          (page
            ? ((await observe(sourceText(page, 2048))) ??
              supportedInputLanguage(document.documentElement.lang))
            : undefined);
        const current = getSettings();
        if (
          generation !== revision ||
          document.URL !== url ||
          editors.activeEditor() !== element ||
          !editors.current(snapshot) ||
          current.inputTargetLanguage !== settings.inputTargetLanguage ||
          current.inputMatchConversation !== settings.inputMatchConversation ||
          current.inputMatchPage !== settings.inputMatchPage
        )
          return;
        if (inferred && inferred !== draftLanguage) target = inferred;
      }
    }
    await translateInputSnapshot(snapshot, snapshot.text, target);
  }
  async function translateInputSnapshot(
    snapshot: NonNullable<ReturnType<typeof editors.capture>>,
    text: string,
    targetLanguage: string,
    previous?: NonNullable<ReturnType<typeof editors.apply>>,
  ) {
    const { element } = snapshot;
    const isCurrent = previous?.canUndo ?? (() => editors.current(snapshot));
    const settings = getSettings();
    if (!isCurrent() || !settings.inputEnabled || !allowed(element, true)) {
      close();
      return;
    }
    const glossary = inputGlossary?.(targetLanguage) ?? settings.glossary;
    const settingsKey = requestSettingsKey(settings);
    if (!previous) show(copy.translating, false, true);
    const revision = generation;
    const id = createRequestId();
    requestId = id;
    inputEditor = element;
    let output;
    try {
      output = await translate({
        id,
        text,
        sourceLanguage: settings.sourceLanguage,
        context: snapshot.codec?.instruction,
        targetLanguage,
        glossary,
      });
    } catch (error) {
      if (!currentRequest(revision, settingsKey)) return;
      if (!previous)
        show(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      if (requestId === id) {
        requestId = undefined;
        inputEditor = undefined;
      }
    }
    if (!currentRequest(revision, settingsKey)) return;
    const currentSettings = getSettings();
    if (
      !isCurrent() ||
      !currentSettings.inputEnabled ||
      currentSettings.inputTargetLanguage !== settings.inputTargetLanguage ||
      currentSettings.inputMatchConversation !==
        settings.inputMatchConversation ||
      currentSettings.inputMatchPage !== settings.inputMatchPage ||
      JSON.stringify(
        inputGlossary?.(targetLanguage) ?? currentSettings.glossary,
      ) !== JSON.stringify(glossary)
    ) {
      close();
      return;
    }
    let transaction: ReturnType<typeof editors.apply>;
    try {
      transaction = editors.apply(snapshot, output.text, isCurrent);
    } catch (error) {
      show(error instanceof Error ? error.message : String(error));
      onError(error);
      return;
    }
    if (!transaction) {
      close();
      return;
    }
    const restoreTargetFocus = shadow.activeElement?.localName === "select";
    show(transaction.text, false, false, targetLanguage);
    const undo = document.createElement("button");
    undo.textContent = copy.undoInput;
    undo.onclick = () => {
      if (!transaction.canUndo()) {
        close();
        return;
      }
      if (transaction.undo()) close();
    };
    const target = document.createElement("select");
    target.setAttribute("aria-label", copy.inputTargetLanguage);
    for (const [code, label] of languages)
      target.add(new view.Option(label, code, false, code === targetLanguage));
    target.onchange = () => {
      if (target.getAttribute("aria-busy") === "true") return;
      target.setAttribute("aria-busy", "true");
      void translateInputSnapshot(snapshot, text, target.value, transaction)
        .catch(onError)
        .finally(() => {
          if (!target.isConnected) return;
          target.value = targetLanguage;
          target.removeAttribute("aria-busy");
        });
    };
    const result = panel;
    const actions = result?.querySelector("nav");
    if (result && actions) {
      actions.prepend(target, undo);
      if (!previous) {
        actions.hidden = true;
        actions.id = "input-translation-actions";
        const chip = document.createElement("button");
        chip.type = "button";
        chip.dataset.inputOptions = "";
        chip.textContent =
          target.selectedOptions[0]?.textContent ?? targetLanguage;
        chip.setAttribute(
          "aria-label",
          `${copy.inputTranslationOptions}, ${chip.textContent}`,
        );
        chip.setAttribute("aria-controls", actions.id);
        chip.setAttribute("aria-expanded", "false");
        const expire = () => {
          view.clearTimeout(inputResultTimer);
          inputResultTimer = view.setTimeout(close, 5000);
        };
        chip.onfocus = () => view.clearTimeout(inputResultTimer);
        chip.onblur = () => {
          if (!chip.hidden && resultEditor === element && panel === result)
            expire();
        };
        chip.onclick = () => {
          view.clearTimeout(inputResultTimer);
          chip.setAttribute("aria-expanded", "true");
          chip.hidden = true;
          actions.hidden = false;
          target.focus();
        };
        result.append(chip);
        expire();
      }
      anchorInputResult(element, result);
    }
    if (previous) {
      if (restoreTargetFocus) target.focus();
      await saveInputTargetLanguage?.(targetLanguage);
    }
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
