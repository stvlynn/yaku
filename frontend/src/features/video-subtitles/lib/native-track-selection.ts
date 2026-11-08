import { copy } from "../../../shared/i18n";
import type { SubtitleRuntime } from "../model/types";
import type {
  NativeTrackCommandOptions,
  NativeTrackSelector,
} from "../model/track-types";
import { nativeTrackLanguage } from "./native-track-language";
import {
  abortedTrack,
  loadNativeTrack,
  raceTrackAbort,
  type NativeTrackEntry,
} from "./track-loading";

export function createNativeTrackSelection(
  runtime: SubtitleRuntime,
  choose?: NativeTrackSelector,
) {
  const identities = new WeakMap<TextTrack, { id: string; source: string }>();
  let next = 0;
  function entries(media: HTMLMediaElement): NativeTrackEntry[] {
    const elements = [...media.querySelectorAll<HTMLTrackElement>("track")];
    return Array.from(media.textTracks)
      .filter((track) => ["subtitles", "captions"].includes(track.kind))
      .map((track) => {
        const element = elements.find((element) => element.track === track);
        const source = JSON.stringify([
          runtime.scope(media),
          element?.src,
          track.language,
          track.kind,
        ]);
        let identity = identities.get(track);
        if (!identity || identity.source !== source) {
          identity = { id: `native-${++next}`, source };
          identities.set(track, identity);
        }
        const loadState = element
          ? (["unloaded", "loading", "loaded", "error"] as const)[
              element.readyState
            ]!
          : track.cues?.length
            ? "loaded"
            : "unknown";
        return {
          media,
          track,
          element,
          choice: {
            id: identity.id,
            label: track.label,
            language: track.language,
            kind: track.kind as "subtitles" | "captions",
            mode: track.mode,
            default: element?.default ?? false,
            loadState,
            selected: false,
          },
        };
      });
  }
  function current(media: HTMLMediaElement) {
    const candidates = entries(media);
    const showing = candidates.filter(
      (entry) => entry.track.mode === "showing",
    );
    if (showing.length) return showing.length === 1 ? showing[0] : undefined;
    const hidden = candidates.filter((entry) => entry.track.mode === "hidden");
    return hidden.length === 1 ? hidden[0] : undefined;
  }
  function choices(media: HTMLMediaElement) {
    const selected = current(media)?.choice.id;
    return entries(media).map((entry) => ({
      ...entry.choice,
      selected: entry.choice.id === selected,
    }));
  }
  function validId(id: string) {
    for (const media of runtime.document.querySelectorAll<HTMLMediaElement>(
      "video,audio",
    ))
      if (entries(media).some((entry) => entry.choice.id === id)) return true;
    return false;
  }
  function isSelected(id: string) {
    for (const media of runtime.document.querySelectorAll<HTMLMediaElement>(
      "video,audio",
    ))
      if (current(media)?.choice.id === id) return true;
    return false;
  }
  async function acquire(
    media: HTMLMediaElement,
    options: NativeTrackCommandOptions & {
      purpose: "pretranslate" | "export";
      signal: AbortSignal;
    },
  ) {
    let candidates = entries(media);
    if (!candidates.length) return;
    if (options.signal.aborted) throw abortedTrack();
    let selected = options.trackId
      ? candidates.find((entry) => entry.choice.id === options.trackId)
      : current(media);
    if (options.trackId && !selected)
      throw new Error(copy.subtitleTrackMissing);
    const active = candidates.filter(
      (entry) => entry.track.mode !== "disabled",
    );
    if (!selected && !active.length && options.acquire !== false) {
      const language = nativeTrackLanguage(
        runtime.getSettings().sourceLanguage,
      );
      const matches = language
        ? candidates.filter((entry) =>
            language === "zh"
              ? nativeTrackLanguage(entry.track.language)?.startsWith("zh")
              : nativeTrackLanguage(entry.track.language) === language,
          )
        : [];
      const defaults = candidates.filter((entry) => entry.choice.default);
      selected =
        matches.length === 1
          ? matches[0]
          : defaults.length === 1
            ? defaults[0]
            : candidates.length === 1
              ? candidates[0]
              : undefined;
    }
    if (!selected) {
      if (options.acquire === false && !active.length) return;
      if (!choose) throw new Error(copy.subtitleSelectTrack);
      const view = runtime.document.defaultView!;
      const controller = new view.AbortController();
      const abort = () => controller.abort();
      options.signal.addEventListener("abort", abort, { once: true });
      const snapshot = JSON.stringify(
        candidates.map((entry) => [entry.choice.id, entry.track.mode]),
      );
      const poll = view.setInterval(() => {
        if (
          JSON.stringify(
            entries(media).map((entry) => [entry.choice.id, entry.track.mode]),
          ) !== snapshot
        )
          abort();
      }, 100);
      try {
        const id = await raceTrackAbort(
          choose({
            media,
            tracks: choices(media),
            purpose: options.purpose,
            signal: controller.signal,
          }),
          controller.signal,
        );
        if (!id) throw abortedTrack();
        candidates = entries(media);
        selected = candidates.find((entry) => entry.choice.id === id);
        if (!selected) throw new Error(copy.subtitleTrackMissing);
      } finally {
        view.clearInterval(poll);
        options.signal.removeEventListener("abort", abort);
        controller.abort();
      }
    }
    if (selected.track.mode === "disabled" && options.acquire === false)
      throw new Error(copy.subtitleNoCues);
    const id = selected.choice.id;
    const otherModes = new Map(
      candidates
        .filter((entry) => entry.track !== selected!.track)
        .map((entry) => [entry.track, entry.track.mode]),
    );
    const ids = new Set(candidates.map((entry) => entry.choice.id));
    return loadNativeTrack(
      selected,
      options.signal,
      () =>
        entries(media).length === ids.size &&
        entries(media).every((entry) => ids.has(entry.choice.id)) &&
        entries(media).some((entry) => entry.choice.id === id) &&
        [...otherModes].every(([track, mode]) => track.mode === mode),
    );
  }
  return { entries, current, choices, validId, isSelected, acquire };
}
export type NativeTrackSelection = ReturnType<
  typeof createNativeTrackSelection
>;
