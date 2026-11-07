import type {
  DomCaptionAdapter,
  SubtitleCue,
  SubtitleRuntime,
} from "../model/types";

interface CaptionState {
  element: Element;
  adapter: DomCaptionAdapter;
  source: string;
  version: number;
  cue: SubtitleCue;
  sources: HTMLElement[];
  target?: HTMLElement;
  timer?: ReturnType<typeof setTimeout>;
}
const ownTarget = '[data-yaku-owned="subtitle-translation"]';
export function installDomCaptions(
  runtime: SubtitleRuntime,
  adapters: readonly DomCaptionAdapter[],
  delay = 250,
) {
  const { document } = runtime;
  const states = new Map<Element, CaptionState>();
  const latest = new WeakMap<
    Element,
    { id: string; source: string; speaker?: string }
  >();
  let disposed = false;
  let nextId = 0;
  let scheduled = false;
  const observer = new document.defaultView!.MutationObserver(() => {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!disposed) scan();
    });
  });
  function observe() {
    if (!disposed)
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "aria-hidden"],
      });
  }
  function mutate(action: () => void) {
    observer.disconnect();
    action();
    observe();
  }
  function restore(state: CaptionState) {
    if (state.timer) clearTimeout(state.timer);
    mutate(() => {
      state.target?.remove();
      state.target = undefined;
      for (const source of state.sources)
        source.replaceWith(...source.childNodes);
      state.sources = [];
    });
  }
  function sourceNodes(element: Element, speakerSelector?: string): Text[] {
    const walker = document.createTreeWalker(element, 4);
    const nodes: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (
        !node.data.trim() ||
        node.parentElement?.closest(ownTarget) ||
        (speakerSelector && node.parentElement?.closest(speakerSelector))
      )
        continue;
      nodes.push(node);
    }
    return nodes;
  }
  function read(element: Element, speakerSelector?: string) {
    const clone = element.cloneNode(true) as Element;
    clone.querySelectorAll(ownTarget).forEach((node) => node.remove());
    if (speakerSelector)
      clone.querySelectorAll(speakerSelector).forEach((node) => node.remove());
    clone
      .querySelectorAll("br,.caption-visual-line")
      .forEach((node) => node.append(document.createTextNode(" ")));
    return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
  }
  function visible(element: Element) {
    for (
      let ancestor: Element | null = element;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      if (
        ancestor.hasAttribute("hidden") ||
        ancestor.getAttribute("aria-hidden") === "true"
      )
        return false;
      const style = document.defaultView!.getComputedStyle(ancestor);
      if (style.display === "none" || style.visibility === "hidden")
        return false;
    }
    return true;
  }
  function time(state: Pick<CaptionState, "adapter" | "element">) {
    return state.adapter.meeting
      ? runtime.now()
      : ((
          state.element
            .closest(
              '.html5-video-player,.watch-video,[data-purpose="video-player"]',
            )
            ?.querySelector("video") ?? document.querySelector("video")
        )?.currentTime ?? runtime.now());
  }
  function speaker(
    element: Element,
    adapter: DomCaptionAdapter,
  ): string | undefined {
    if (!adapter.speakerSelector) return;
    const root = adapter.speakerContainer
      ? element.closest(adapter.speakerContainer)
      : element;
    return (
      root?.querySelector(adapter.speakerSelector)?.textContent?.trim() ||
      undefined
    );
  }
  function finish(state: CaptionState) {
    state.cue.end = Math.max(state.cue.start + 0.001, time(state));
    runtime.record(state.cue);
  }
  async function render(state: CaptionState) {
    if (!runtime.getSettings().subtitlesEnabled || disposed) return;
    const version = state.version;
    const revision = runtime.revision();
    const source = state.source;
    const translated = await runtime.request(source);
    if (
      disposed ||
      revision !== runtime.revision() ||
      version !== state.version ||
      !state.element.isConnected ||
      read(state.element, state.adapter.speakerSelector) !== source ||
      !runtime.getSettings().subtitlesEnabled
    )
      return;
    state.cue.translation = translated;
    finish(state);
    let exemplar =
      sourceNodes(state.element, state.adapter.speakerSelector)[0]
        ?.parentElement ?? state.element;
    while (exemplar.hasAttribute("data-yaku-owned") && exemplar.parentElement)
      exemplar = exemplar.parentElement;
    const appearance = document.defaultView!.getComputedStyle(exemplar);
    mutate(() => {
      state.target?.remove();
      for (const wrapper of state.sources)
        wrapper.replaceWith(...wrapper.childNodes);
      state.sources = [];
      for (const text of sourceNodes(
        state.element,
        state.adapter.speakerSelector,
      )) {
        const wrapper = document.createElement("span");
        wrapper.dataset.yakuOwned = "subtitle-source";
        text.replaceWith(wrapper);
        wrapper.append(text);
        wrapper.hidden = runtime.getSettings().mode === "translation";
        state.sources.push(wrapper);
      }
      const target = document.createElement("span");
      target.dataset.yakuOwned = "subtitle-translation";
      target.setAttribute("translate", "no");
      target.style.cssText =
        "display:block;white-space:pre-wrap;font:inherit;color:inherit;line-height:1.35";
      if (appearance.font) target.style.font = appearance.font;
      if (appearance.color) target.style.color = appearance.color;
      if (appearance.textShadow)
        target.style.textShadow = appearance.textShadow;
      target.lang = runtime.getSettings().targetLanguage;
      target.dir = "auto";
      target.textContent = translated;
      state.element.append(target);
      state.target = target;
    });
  }
  function scan() {
    if (!runtime.getSettings().subtitlesEnabled) return;
    const found = new Set<Element>();
    for (const adapter of adapters)
      for (const element of document.querySelectorAll(adapter.selector)) {
        if (element.closest(ownTarget) || !visible(element)) continue;
        const media =
          element
            .closest(
              ".html5-video-player,.watch-video,[data-purpose=video-player]",
            )
            ?.querySelector("video") ?? document.querySelector("video");
        if (
          !adapter.meeting &&
          media &&
          Array.from(media.textTracks).some(
            (track) =>
              ["captions", "subtitles"].includes(track.kind) &&
              track.mode !== "disabled" &&
              (track.cues?.length ?? 0) > 0,
          )
        )
          continue;
        found.add(element);
        const source = read(element, adapter.speakerSelector);
        let state = states.get(element);
        const name = speaker(element, adapter);
        if (!source) {
          if (state) {
            finish(state);
            restore(state);
            states.delete(element);
          }
          continue;
        }
        if (state && state.source === source && state.cue.speaker === name)
          continue;
        if (state) {
          const continuing =
            state.cue.speaker === name &&
            (source.startsWith(state.source) ||
              state.source.startsWith(source));
          finish(state);
          restore(state);
          state.version++;
          if (!continuing)
            state.cue = {
              id: `dom-${++nextId}`,
              source,
              speaker: name,
              start: time(state),
              end: time(state) + 0.001,
              timing: "observed",
              adapter: adapter.id,
            };
          state.source = source;
          state.cue.source = source;
          state.cue.translation = undefined;
        } else {
          const clock = time({ element, adapter });
          const previous = latest.get(element);
          const id =
            previous?.source === source && previous.speaker === name
              ? previous.id
              : `dom-${++nextId}`;
          state = {
            element,
            adapter,
            source,
            version: 0,
            sources: [],
            cue: {
              id,
              source,
              speaker: name,
              start: clock,
              end: clock + 0.001,
              timing: "observed",
              adapter: adapter.id,
            },
          };
          states.set(element, state);
        }
        runtime.record(state.cue);
        latest.set(element, { id: state.cue.id, source, speaker: name });
        const current = state;
        const revision = runtime.revision();
        const version = state.version;
        state.timer = setTimeout(() => {
          void render(current).catch((error) => {
            if (
              !disposed &&
              revision === runtime.revision() &&
              version === current.version &&
              runtime.getSettings().subtitlesEnabled
            )
              runtime.onError(error);
          });
        }, delay);
      }
    for (const [element, state] of states)
      if (!found.has(element) || !element.isConnected) {
        state.version++;
        finish(state);
        restore(state);
        states.delete(element);
      }
  }
  observe();
  scan();
  return {
    async pretranslate() {
      scan();
      await Promise.all(
        [...states.values()].map((state) => {
          if (state.timer) clearTimeout(state.timer);
          return render(state);
        }),
      );
    },
    refresh() {
      for (const state of states.values()) {
        state.version++;
        finish(state);
        restore(state);
      }
      states.clear();
      scan();
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      for (const state of states.values()) {
        state.version++;
        finish(state);
        restore(state);
      }
      states.clear();
    },
  };
}
