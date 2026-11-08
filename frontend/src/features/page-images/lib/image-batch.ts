import { copy } from "../../../shared/i18n";
import {
  imagePreferencesKey,
  type BatchImageState,
  type BatchStartOptions,
} from "../model/types";
import type { Settings } from "../../../entities/settings";
interface Candidate {
  image: HTMLImageElement;
  url: string;
  visible: boolean;
  phase: "waiting" | "queued" | "processing" | "done" | "failed";
  version: number;
  id?: string;
}
interface Options extends BatchStartOptions {
  document: Document;
  sessionId: string;
  getSettings: () => Settings;
  isReplacement: (image: HTMLImageElement) => boolean;
  restoreImage: (image: HTMLImageElement) => void;
  translate: (
    image: HTMLImageElement,
    id: string,
    url: string,
    valid: () => boolean,
  ) => Promise<boolean>;
  cancel: (id: string) => Promise<void>;
  cancelBatch: () => Promise<void>;
  onState: (state: BatchImageState) => void;
  onError: (error: unknown) => void;
  onPreferencesChanged: () => void;
}
export function installImageBatch(options: Options) {
  const { document } = options;
  const view = document.defaultView!;
  const scope = options.scopeSelector
    ? document.querySelector(options.scopeSelector)
    : (document.querySelector('main,article,[role="main"]') ?? document.body);
  if (!scope) throw new Error(copy.imageTargetMissing);
  const minimum = options.minimumPixels ?? 4096;
  const preferences = imagePreferencesKey(options.getSettings());
  const candidates = new Map<HTMLImageElement, Candidate>();
  const queue: Candidate[] = [];
  let active = true;
  let pumping = false;
  let scheduled = false;
  let counter = 0;
  let completed = 0,
    skipped = 0,
    failed = 0;
  const state = (): BatchImageState => ({
    active,
    completed,
    skipped,
    failed,
    queued: [...candidates.values()].filter(
      (item) => item.phase === "queued" || item.phase === "processing",
    ).length,
  });
  const notify = () => options.onState(state());
  const observer = new view.MutationObserver(schedule);
  const visibility = new view.IntersectionObserver(
    (items) => {
      for (const item of items) {
        const candidate = candidates.get(item.target as HTMLImageElement);
        if (!candidate) continue;
        candidate.visible = item.isIntersecting;
        consider(candidate);
      }
      void pump();
    },
    { rootMargin: "600px" },
  );
  function observe() {
    if (active)
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src", "srcset", "sizes"],
      });
  }
  function mutate(action: () => void) {
    observer.disconnect();
    action();
    observe();
  }
  function stop() {
    if (!active) return;
    active = false;
    observer.disconnect();
    visibility.disconnect();
    document.removeEventListener("load", loaded, true);
    for (const candidate of candidates.values()) {
      candidate.version++;
      if (candidate.phase === "processing" && candidate.id)
        void options.cancel(candidate.id);
      if (candidate.phase === "queued" || candidate.phase === "processing")
        candidate.phase = "waiting";
    }
    queue.length = 0;
    void options.cancelBatch();
    notify();
  }
  function refresh() {
    if (active && imagePreferencesKey(options.getSettings()) !== preferences) {
      stop();
      options.onPreferencesChanged();
    }
  }
  function consider(candidate: Candidate) {
    if (!active) return;
    refresh();
    if (!active || options.isReplacement(candidate.image)) return;
    const image = candidate.image;
    if (!image.complete || !image.naturalWidth || !image.naturalHeight) {
      if (candidate.phase === "processing" && candidate.id)
        void options.cancel(candidate.id);
      candidate.version++;
      candidate.phase = "waiting";
      return;
    }
    const url = image.currentSrc || image.src;
    if (
      !/^(https?:|data:image\/|blob:)/i.test(url) ||
      /\.svg(?:[?#]|$)/i.test(url) ||
      image.naturalWidth * image.naturalHeight < minimum
    )
      return;
    if (url !== candidate.url) {
      if (candidate.phase === "processing" && candidate.id)
        void options.cancel(candidate.id);
      candidate.version++;
      candidate.phase = "waiting";
      candidate.url = url;
      options.restoreImage(image);
    }
    if (candidate.visible && candidate.phase === "waiting") {
      candidate.phase = "queued";
      queue.push(candidate);
      notify();
    }
  }
  async function pump() {
    if (pumping || !active) return;
    pumping = true;
    try {
      while (active && queue.length) {
        refresh();
        if (!active) break;
        const candidate = queue.shift()!;
        if (
          candidate.phase !== "queued" ||
          !candidate.image.isConnected ||
          !scope!.contains(candidate.image)
        )
          continue;
        if (!candidate.visible) {
          candidate.phase = "waiting";
          continue;
        }
        const version = candidate.version;
        const id = `${options.sessionId}:${++counter}`;
        candidate.id = id;
        candidate.phase = "processing";
        notify();
        try {
          const applied = await options.translate(
            candidate.image,
            id,
            candidate.url,
            () =>
              active &&
              version === candidate.version &&
              candidate.image.isConnected &&
              imagePreferencesKey(options.getSettings()) === preferences,
          );
          if (active && version === candidate.version) {
            candidate.phase = applied ? "done" : "waiting";
            if (applied) completed++;
          }
        } catch (error) {
          if (active && version === candidate.version) {
            candidate.phase = "failed";
            if (
              typeof error === "object" &&
              error !== null &&
              "name" in error &&
              error.name === "ImageNoTextError"
            )
              skipped++;
            else {
              failed++;
              options.onError(error);
            }
          }
        }
        notify();
      }
    } finally {
      pumping = false;
    }
  }
  function scan() {
    if (!active) return;
    refresh();
    if (!active) return;
    if (!scope!.isConnected) {
      stop();
      return;
    }
    for (const image of scope!.querySelectorAll<HTMLImageElement>("img")) {
      if (image.closest("[data-yaku-owned]")) continue;
      let candidate = candidates.get(image);
      if (!candidate) {
        candidate = {
          image,
          url: "",
          visible: false,
          phase: "waiting",
          version: 0,
        };
        candidates.set(image, candidate);
        visibility.observe(image);
      }
      consider(candidate);
    }
    for (const [image, candidate] of candidates)
      if (!image.isConnected || !scope!.contains(image)) {
        candidate.version++;
        if (candidate.phase === "processing" && candidate.id)
          void options.cancel(candidate.id);
        visibility.unobserve(image);
        candidates.delete(image);
        options.restoreImage(image);
      }
    notify();
    void pump();
  }
  function schedule() {
    if (scheduled || !active) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      scan();
    });
  }
  function loaded(event: Event) {
    if (event.target instanceof view.HTMLImageElement) schedule();
  }
  document.addEventListener("load", loaded, true);
  observe();
  scan();
  return { stop, refresh, mutate, getState: state };
}
