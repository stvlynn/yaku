import {
  resolveSourceLanguagePolicy,
  type Settings,
} from "../../../entities/settings";
import type { Translate, TranslationMode } from "../../../entities/translation";
import { alreadyTargetLanguage, reliableLanguageObservation } from "./language";
import { createInlineCodec } from "../../../shared/translation-markup";
import {
  collectOpenRoots,
  composedParent,
  isShadowRoot,
  matchesComposed,
  visibilityTarget,
  type TranslationRoot,
} from "../../../shared/translation-markup";

export interface PageTranslatorOptions {
  document: Document;
  translate: Translate;
  getSettings: () => Settings;
  onError?: (error: unknown) => void;
  cancel?: (id: string) => Promise<void>;
  detectLanguage?: (text: string) => Promise<LanguageDetection>;
}

export interface LanguageDetection {
  isReliable: boolean;
  languages: { language: string; percentage: number }[];
}

const excluded =
  'script,style,noscript,template,code,pre,kbd,samp,textarea,input,select,option,button,svg,math,iframe,[contenteditable]:not([contenteditable="false"]),[translate="no"],.notranslate,[data-yaku-owned]';
const blocks = new Set([
  "BODY",
  "MAIN",
  "ARTICLE",
  "SECTION",
  "DIV",
  "P",
  "LI",
  "TD",
  "TH",
  "DT",
  "DD",
  "BLOCKQUOTE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "FIGCAPTION",
  "SUMMARY",
  "LABEL",
]);
const styles = {
  plain: "",
  underline:
    "text-decoration:underline;text-decoration-color:currentColor;text-underline-offset:0.2em",
  highlight:
    "background:var(--yaku-translation-highlight,Highlight);color:var(--yaku-translation-highlight-text,HighlightText)",
  quote:
    "border-inline-start:0.2em solid currentColor;padding-inline-start:0.7em",
  blur: "filter:blur(0.24em)",
} satisfies Record<Settings["style"], string>;

type RecordEntry = {
  block: TranslationRoot;
  nodes: Text[];
  values: string[];
  target: HTMLElement | null;
  masked: Set<Text>;
  hiddenElements: Map<
    Element,
    {
      hidden: string | null;
      style: string | null;
      appliedStyle: string;
      display: string;
      priority: string;
    }
  >;
  originals: Element[];
  codecCurrent?: () => boolean;
  pending: boolean;
  version: number;
  skipped: boolean;
};

/** Independent generic DOM translation; site adapters and frame injection belong to callers. */
export function createPageTranslator({
  document,
  translate,
  getSettings,
  onError,
  cancel,
  detectLanguage,
}: PageTranslatorOptions) {
  const view = document.defaultView!;
  const entries = new Map<TranslationRoot, RecordEntry>();
  const observationRoots = new Set<TranslationRoot>();
  let generation = 0;
  let active = false;
  let disposed = false;
  let mode: TranslationMode | undefined;
  let scope: Element | null = null;
  const requests = new Set<string>();
  let scheduled = false;
  let observer: MutationObserver | undefined;
  let visibility: IntersectionObserver | undefined;
  let wholePageScope = false;
  let translationSettings = "";
  const routeKey = () =>
    `${view.location.pathname}${view.location.search}${/^#!?\//.test(view.location.hash) ? view.location.hash : ""}`;
  let observedRoute = routeKey();
  const settingsKey = () => {
    const settings = getSettings();
    return JSON.stringify([
      settings.targetLanguage,
      settings.sourceLanguage,
      settings.glossary,
      settings.siteRules,
      settings.alwaysSourceLanguages,
      settings.neverSourceLanguages,
    ]);
  };
  const lifecycle = new AbortController();
  function routeChanged() {
    const next = routeKey();
    if (next === observedRoute) return;
    observedRoute = next;
    if (active)
      void controller
        .translatePage({ wholePage: wholePageScope })
        .catch(onError);
  }
  view.addEventListener("popstate", routeChanged, { signal: lifecycle.signal });
  view.addEventListener("hashchange", routeChanged, {
    signal: lifecycle.signal,
  });
  (view as Window & { navigation?: EventTarget }).navigation?.addEventListener(
    "navigatesuccess",
    routeChanged,
    { signal: lifecycle.signal },
  );

  function eligible(node: Text): boolean {
    if (
      !node.data.trim() ||
      !composedParent(node) ||
      matchesComposed(node, excluded)
    )
      return false;
    for (
      let el: Element | null = composedParent(node);
      el;
      el = composedParent(el)
    ) {
      if (
        el.hasAttribute("hidden") ||
        el.getAttribute("aria-hidden") === "true"
      )
        return false;
      const style = view.getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse"
      )
        return false;
    }
    return true;
  }

  function blockFor(node: Text): TranslationRoot {
    if (!node.parentElement) {
      const root = node.getRootNode();
      if (isShadowRoot(root)) return root;
      throw new Error("The paragraph is detached from its translation root.");
    }
    let element = node.parentElement;
    while (element.parentElement && !blocks.has(element.tagName))
      element = element.parentElement;
    if (!blocks.has(element.tagName) && isShadowRoot(element.getRootNode()))
      return element.getRootNode() as ShadowRoot;
    return element;
  }

  function observeRoots() {
    if (!active) return;
    for (const root of observationRoots)
      if (root.isConnected)
        observer?.observe(root, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: [
            "hidden",
            "aria-hidden",
            "translate",
            "lang",
            "style",
          ],
        });
  }

  function mutate(action: () => void) {
    observer?.disconnect();
    action();
    observeRoots();
  }

  function original(entry: RecordEntry) {
    mutate(() => {
      reveal(entry);
      entry.target?.remove();
      entry.target = null;
    });
  }

  function inlineStyle(element: Element) {
    const style = document.createElement("span").style;
    style.cssText = element.getAttribute("style") ?? "";
    return style;
  }

  function reveal(entry: RecordEntry) {
    for (const [index, node] of entry.nodes.entries())
      if (entry.masked.has(node) && node.isConnected && node.data === "")
        node.data = entry.values[index]!;
    entry.masked.clear();
    for (const [element, original] of entry.hiddenElements)
      if (element.isConnected) {
        if (element.getAttribute("hidden") === "") {
          if (original.hidden === null) element.removeAttribute("hidden");
          else element.setAttribute("hidden", original.hidden);
        }
        const style = inlineStyle(element);
        if (element.getAttribute("style") === original.appliedStyle) {
          if (original.style === null) element.removeAttribute("style");
          else element.setAttribute("style", original.style);
        } else if (
          style.getPropertyValue("display") === "none" &&
          style.getPropertyPriority("display") === "important"
        ) {
          if (original.display)
            style.setProperty("display", original.display, original.priority);
          else style.removeProperty("display");
          if (original.style === null && !style.cssText)
            element.removeAttribute("style");
          else element.setAttribute("style", style.cssText);
        }
      }
    entry.hiddenElements.clear();
  }

  function refreshStyle(entry: RecordEntry) {
    const settings = getSettings();
    if (entry.target) {
      entry.target.style.cssText = `display:block;font-size:${settings.fontSize}%;${styles[settings.style]}`;
      entry.target.dataset.yakuStyle = settings.style;
      entry.target.style.fontFamily =
        settings.fontFamily === "inherit" ? "" : settings.fontFamily;
      entry.target.style.fontWeight =
        settings.fontWeight === "inherit" ? "" : String(settings.fontWeight);
      entry.target.style.lineHeight =
        settings.lineHeight === 0 ? "" : String(settings.lineHeight);
      if (settings.textColor) entry.target.style.color = settings.textColor;
      if (settings.backgroundColor)
        entry.target.style.backgroundColor = settings.backgroundColor;
      if (settings.translationPosition === "before")
        entry.block.prepend(entry.target);
      else entry.block.append(entry.target);
      if (settings.style === "blur") {
        entry.target.onpointerenter = () => {
          if (entry.target) entry.target.style.filter = "none";
        };
        entry.target.onpointerleave = () => {
          if (entry.target) entry.target.style.filter = "blur(0.24em)";
        };
      } else {
        entry.target.onpointerenter = null;
        entry.target.onpointerleave = null;
      }
    }
    if (!entry.target) return;
    mutate(() => {
      if ((mode ?? settings.mode) !== "translation") {
        reveal(entry);
        return;
      }
      for (const [index, node] of entry.nodes.entries())
        if (
          !entry.masked.has(node) &&
          node.isConnected &&
          node.data === entry.values[index]
        ) {
          node.data = "";
          entry.masked.add(node);
        }
      for (const element of entry.originals)
        if (element.isConnected && !entry.hiddenElements.has(element)) {
          const style = inlineStyle(element);
          const original = {
            hidden: element.getAttribute("hidden"),
            style: element.getAttribute("style"),
            display: style.getPropertyValue("display"),
            priority: style.getPropertyPriority("display"),
            appliedStyle: "",
          };
          element.setAttribute("hidden", "");
          style.setProperty("display", "none", "important");
          element.setAttribute("style", style.cssText);
          original.appliedStyle = element.getAttribute("style")!;
          entry.hiddenElements.set(element, original);
        }
    });
  }

  function sourceUnchanged(entry: RecordEntry): boolean {
    return (
      entry.block.isConnected &&
      entry.nodes.every(
        (node, i) =>
          node.isConnected &&
          entry.block.contains(node) &&
          node.data === (entry.masked.has(node) ? "" : entry.values[i]),
      ) &&
      (entry.codecCurrent?.() ?? true)
    );
  }

  async function render(entry: RecordEntry): Promise<void> {
    if (!active || disposed || entry.pending || entry.target) return;
    entry.pending = true;
    const token = generation;
    const version = entry.version;
    const settings = getSettings();
    try {
      if (
        settings.sourceLanguage !== "auto" &&
        resolveSourceLanguagePolicy(settings, {
          language: settings.sourceLanguage,
          reliable: true,
        }) === "never"
      ) {
        entry.skipped = true;
        return;
      }
      if (detectLanguage && settings.sourceLanguage === "auto") {
        const detection = await detectLanguage(entry.values.join(""));
        if (
          !active ||
          token !== generation ||
          version !== entry.version ||
          !sourceUnchanged(entry)
        )
          return;
        if (
          resolveSourceLanguagePolicy(
            settings,
            reliableLanguageObservation(detection),
          ) === "never" ||
          alreadyTargetLanguage(
            settings.sourceLanguage,
            settings.targetLanguage,
            detection,
          )
        ) {
          entry.skipped = true;
          return;
        }
      }
      const codec = createInlineCodec(document, entry.block, entry.nodes, {
        preserveProtected: true,
      });
      entry.codecCurrent = codec.isCurrent;
      entry.originals = codec.originals;
      const id = crypto.randomUUID();
      requests.add(id);
      const result = await translate({
        id,
        text: codec.text,
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
        glossary: settings.glossary,
        context: codec.instruction,
      }).finally(() => requests.delete(id));
      if (
        !active ||
        token !== generation ||
        version !== entry.version ||
        !sourceUnchanged(entry)
      )
        return;
      const target = document.createElement("span");
      target.dataset.yakuOwned = "translation";
      target.lang = settings.targetLanguage;
      target.dir = "auto";
      target.append(codec.decode(result.text));
      mutate(() => {
        entry.block.append(target);
        entry.target = target;
        refreshStyle(entry);
      });
    } catch (error) {
      if (active && token === generation && version === entry.version)
        onError?.(error);
    } finally {
      entry.pending = false;
    }
  }

  function collect(): RecordEntry[] {
    if (!scope) return [];
    const grouped = new Map<TranslationRoot, Text[]>();
    observationRoots.clear();
    observationRoots.add(document.body);
    for (const root of collectOpenRoots(scope)) {
      observationRoots.add(root);
      const walker = document.createTreeWalker(root, 4);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node as Text;
        if (!eligible(text)) continue;
        const block = blockFor(text);
        const rule = getSettings().siteRules.find(
          (item) =>
            document.location.hostname === item.hostname ||
            document.location.hostname.endsWith(`.${item.hostname}`),
        );
        if (
          rule?.excludeSelector &&
          matchesComposed(text, rule.excludeSelector)
        )
          continue;
        const list = grouped.get(block) ?? [];
        list.push(text);
        grouped.set(block, list);
      }
    }
    observeRoots();
    const added: RecordEntry[] = [];
    for (const [block, nodes] of grouped) {
      const existing = entries.get(block);
      if (existing?.target || existing?.pending || existing?.skipped) continue;
      const entry: RecordEntry = existing ?? {
        block,
        nodes,
        values: [],
        target: null,
        masked: new Set(),
        hiddenElements: new Map(),
        originals: [],
        pending: false,
        version: 0,
        skipped: false,
      };
      entry.nodes = nodes;
      entry.values = nodes.map((node) => node.data);
      entries.set(block, entry);
      added.push(entry);
    }
    return added;
  }

  async function scan(immediate: boolean) {
    if (scope && !scope.isConnected) {
      await controller.translatePage({ wholePage: wholePageScope });
      return;
    }
    for (const entry of collect()) {
      if (!active) break;
      if (!immediate && visibility)
        visibility.observe(visibilityTarget(entry.block));
      else await render(entry);
    }
  }

  function mutations(records: MutationRecord[]) {
    if (!active) return;
    if (routeKey() !== observedRoute) {
      routeChanged();
      return;
    }
    let changed = false;
    for (const mutation of records) {
      const element =
        mutation.target.nodeType === 1
          ? (mutation.target as Element)
          : composedParent(mutation.target);
      // Target-only changes are ours; source text mutations must still invalidate translations.
      if (element?.closest('[data-yaku-owned="translation"]')) continue;
      if (
        mutation.type === "childList" &&
        [...mutation.addedNodes, ...mutation.removedNodes].every(
          (node) =>
            node.nodeType === 1 &&
            (node as Element).hasAttribute("data-yaku-owned"),
        )
      )
        continue;
      for (const entry of entries.values()) {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "hidden" &&
          mutation.target instanceof view.Element
        ) {
          const ownership = entry.hiddenElements.get(mutation.target);
          if (ownership)
            ownership.hidden = mutation.target.getAttribute("hidden");
        }
        const editedText =
          mutation.type === "characterData" &&
          entry.nodes.includes(mutation.target as Text);
        if (editedText) entry.masked.delete(mutation.target as Text);
        const attributeChanged =
          mutation.type === "attributes" &&
          (entry.block.contains(mutation.target) ||
            mutation.target.contains(entry.block));
        const contentAdded =
          mutation.type === "childList" &&
          entry.block.contains(mutation.target) &&
          [...mutation.addedNodes].some(
            (node) =>
              !(
                node.nodeType === 1 &&
                (node as Element).hasAttribute("data-yaku-owned")
              ),
          );
        if (
          editedText ||
          attributeChanged ||
          !entry.block.isConnected ||
          !sourceUnchanged(entry) ||
          contentAdded
        ) {
          entry.version++;
          original(entry);
          entries.delete(entry.block);
          changed = true;
        }
      }
      if (
        mutation.type === "childList" &&
        [...mutation.addedNodes].some(
          (node) =>
            !(
              node.nodeType === 1 &&
              (node as Element).hasAttribute("data-yaku-owned")
            ) && !element?.closest('[data-yaku-owned="source"]'),
        )
      )
        changed = true;
    }
    if (changed && !scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (active) void scan(false).catch(onError);
      });
    }
  }

  function restore() {
    active = false;
    generation++;
    for (const id of requests) void cancel?.(id).catch(onError);
    requests.clear();
    observer?.disconnect();
    visibility?.disconnect();
    for (const entry of entries.values()) original(entry);
    entries.clear();
    observationRoots.clear();
  }

  const controller = {
    isActive: () => active,
    async translatePage({
      wholePage = false,
    }: { wholePage?: boolean } = {}): Promise<void> {
      if (disposed) return;
      restore();
      active = true;
      wholePageScope = wholePage;
      translationSettings = settingsKey();
      observedRoute = routeKey();
      const rule = getSettings().siteRules.find(
        (item) =>
          document.location.hostname === item.hostname ||
          document.location.hostname.endsWith(`.${item.hostname}`),
      );
      scope = rule?.selector
        ? document.querySelector(rule.selector)
        : wholePage
          ? document.body
          : (document.querySelector('main,article,[role="main"]') ??
            document.body);
      if (!scope || rule?.action === "never") {
        active = false;
        return;
      }
      observer = new view.MutationObserver(mutations);
      observationRoots.add(scope);
      observationRoots.add(document.body);
      observeRoots();
      if (view.IntersectionObserver) {
        visibility = new view.IntersectionObserver(
          (items) => {
            for (const item of items)
              if (item.isIntersecting) {
                visibility?.unobserve(item.target);
                for (const entry of entries.values())
                  if (visibilityTarget(entry.block) === item.target)
                    void render(entry);
              }
          },
          { rootMargin: "300px" },
        );
      }
      await scan(wholePage || !visibility);
    },
    restore,
    setMode(next?: TranslationMode) {
      mode = next;
      if (active && translationSettings !== settingsKey()) {
        void controller
          .translatePage({ wholePage: wholePageScope })
          .catch(onError);
        return;
      }
      for (const entry of entries.values()) refreshStyle(entry);
    },
    dispose() {
      restore();
      disposed = true;
      lifecycle.abort();
    },
  };
  return controller;
}
