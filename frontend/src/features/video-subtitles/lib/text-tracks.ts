import { nativeTrackLanguage } from "./native-track-language";
import type { NativeTrackSelection } from "./native-track-selection";
import { raceTrackAbort, type NativeTrackEntry } from "./track-loading";
import type { NativeTrackCommandOptions } from "../model/track-types";
import type { SubtitleCue, SubtitleRuntime } from "../model/types";

interface CueState {
  cue: VTTCue;
  source: string;
  applied?: string;
  record: SubtitleCue;
  media: HTMLMediaElement;
  track: TextTrack;
}
export function installTextTracks(
  runtime: SubtitleRuntime,
  selection: NativeTrackSelection,
) {
  const bindings = new Map<
    HTMLMediaElement,
    {
      abort: AbortController;
      tracks: Set<TextTrack>;
      bound: WeakSet<TextTrack>;
    }
  >();
  const cues = new Map<VTTCue, CueState>();
  const previousStates = new WeakMap<VTTCue, CueState>();
  const cueIds = new WeakMap<VTTCue, string>();
  let nextId = 0;
  let disposed = false;
  const escaped = (text: string) =>
    text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  function state(
    candidate: TextTrackCue,
    media: HTMLMediaElement,
    entry: NativeTrackEntry,
  ): CueState | undefined {
    if (
      !("text" in candidate) ||
      typeof (candidate as VTTCue).getCueAsHTML !== "function"
    )
      return;
    const cue = candidate as VTTCue;
    const scope = runtime.scope(media);
    if (!scope) return;
    let current = cues.get(cue) ?? previousStates.get(cue);
    if (
      current &&
      (current.record.scope !== scope ||
        current.record.trackId !== entry.choice.id) &&
      cue.startTime === current.record.start &&
      cue.endTime === current.record.end &&
      (cue.text === current.source || cue.text === current.applied)
    ) {
      if (cue.text === current.applied) cue.text = current.source;
      return;
    }
    if (
      current &&
      current.record.scope === scope &&
      current.record.trackId === entry.choice.id &&
      cue.startTime === current.record.start &&
      cue.endTime === current.record.end &&
      (cue.text === current.applied || cue.text === current.source)
    ) {
      cues.set(cue, current);
      return current;
    }
    if (current && cue.text === current.applied) cue.text = current.source;
    const source = cue.text;
    const plain = cue.getCueAsHTML().textContent ?? source;
    const record: SubtitleCue = {
      id:
        current?.record.scope === scope &&
        current.record.trackId === entry.choice.id
          ? current.record.id
          : cueIds.get(cue)?.startsWith(`${scope}:${entry.choice.id}:`)
            ? cueIds.get(cue)!
            : `${scope}:${entry.choice.id}:track-${++nextId}`,
      scope,
      trackId: entry.choice.id,
      sourceLanguage: nativeTrackLanguage(entry.track.language),
      source: plain,
      start: cue.startTime,
      end: cue.endTime,
      timing: "track",
      adapter: "text-track",
    };
    cueIds.set(cue, record.id);
    current = { cue, source, record, media, track: entry.track };
    cues.set(cue, current);
    previousStates.set(cue, current);
    runtime.record(record);
    return current;
  }
  async function update(
    media: HTMLMediaElement,
    track: TextTrack,
    all = false,
    ahead = 30,
    explicit?: {
      entry: NativeTrackEntry;
      valid: () => boolean;
      signal?: AbortSignal;
    },
  ) {
    const entry = explicit?.entry ?? selection.current(media);
    if (!entry || entry.track !== track) return;
    const valid =
      explicit?.valid ??
      (() => selection.current(media)?.choice.id === entry.choice.id);
    if (
      !runtime.getSettings().subtitlesEnabled ||
      track.mode === "disabled" ||
      !valid()
    )
      return;
    const revision = runtime.revision();
    const list = [...Array.from(track.cues ?? [])].filter(
      (cue) =>
        all ||
        (cue.endTime >= media.currentTime &&
          cue.startTime < media.currentTime + ahead),
    );
    list.sort(
      (a, b) =>
        Number(b.startTime <= media.currentTime) -
          Number(a.startTime <= media.currentTime) || a.startTime - b.startTime,
    );
    for (const candidate of list) {
      if (
        disposed ||
        revision !== runtime.revision() ||
        !runtime.getSettings().subtitlesEnabled ||
        !valid()
      )
        return;
      const current = state(candidate, media, entry);
      if (!current) continue;
      if (
        current.applied === current.cue.text &&
        current.record.translation !== undefined
      )
        continue;
      const source = current.source;
      const pending = runtime.request(
        current.record.source,
        current.record.sourceLanguage,
      );
      const value = await (explicit?.signal
        ? raceTrackAbort(pending, explicit.signal)
        : pending);
      if (
        disposed ||
        revision !== runtime.revision() ||
        !runtime.getSettings().subtitlesEnabled ||
        current.source !== source ||
        !media.isConnected ||
        runtime.scope(media) !== current.record.scope ||
        !valid()
      )
        return;
      if (current.cue.text !== source && current.cue.text !== current.applied)
        continue;
      current.record.translation = value;
      runtime.record(current.record);
      const target = escaped(value);
      current.applied =
        runtime.getSettings().mode === "bilingual"
          ? `${source}\n${target}`
          : target;
      current.cue.text = current.applied;
    }
  }
  function automatic(media: HTMLMediaElement, track: TextTrack) {
    const revision = runtime.revision();
    void update(media, track).catch((error) => {
      if (
        !disposed &&
        revision === runtime.revision() &&
        runtime.getSettings().subtitlesEnabled
      )
        runtime.onError(error);
    });
  }
  function scan() {
    for (const media of runtime.document.querySelectorAll<HTMLMediaElement>(
      "video,audio",
    )) {
      let binding = bindings.get(media);
      if (!binding) {
        const abort = new runtime.document.defaultView!.AbortController();
        binding = { abort, tracks: new Set(), bound: new WeakSet() };
        bindings.set(media, binding);
        media.textTracks.addEventListener("addtrack", scan, {
          signal: abort.signal,
        });
        media.textTracks.addEventListener("change", scan, {
          signal: abort.signal,
        });
        media.addEventListener("loadedmetadata", scan, {
          signal: abort.signal,
        });
        for (const event of [
          "play",
          "seeked",
          "timeupdate",
          "loadedmetadata",
          "emptied",
        ])
          media.addEventListener(
            event,
            () => {
              for (const track of bindings.get(media)?.tracks ?? [])
                automatic(media, track);
            },
            { signal: abort.signal },
          );
      }
      const available = new Set(Array.from(media.textTracks));
      for (const track of binding.tracks)
        if (!available.has(track)) binding.tracks.delete(track);
      const selected = selection.current(media);
      for (const current of cues.values())
        if (
          current.media === media &&
          current.track !== selected?.track &&
          current.cue.text === current.applied
        )
          current.cue.text = current.source;
      for (const track of available) {
        if (
          binding.tracks.has(track) ||
          !["subtitles", "captions"].includes(track.kind)
        )
          continue;
        binding.tracks.add(track);
        if (binding.bound.has(track)) {
          automatic(media, track);
          continue;
        }
        binding.bound.add(track);
        const element = selection
          .entries(media)
          .find((entry) => entry.track === track)?.element;
        element?.addEventListener("load", () => automatic(media, track), {
          signal: binding.abort.signal,
        });
        track.addEventListener("cuechange", () => automatic(media, track), {
          signal: binding.abort.signal,
        });
        media.textTracks.addEventListener(
          "change",
          () => automatic(media, track),
          { signal: binding.abort.signal },
        );
        automatic(media, track);
      }
    }
    for (const [media, binding] of bindings)
      if (!media.isConnected) {
        binding.abort.abort();
        bindings.delete(media);
        for (const [cue, current] of cues)
          if (current.media === media) {
            if (cue.text === current.applied) cue.text = current.source;
            cues.delete(cue);
          }
      }
  }
  function restore() {
    for (const current of cues.values()) {
      if (current.cue.text === current.applied)
        current.cue.text = current.source;
    }
    cues.clear();
  }
  const observer = new runtime.document.defaultView!.MutationObserver(scan);
  observer.observe(runtime.document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "srcset"],
  });
  scan();
  return {
    async pretranslate({
      all = false,
      aheadSeconds = 30,
      media,
      ...options
    }: NativeTrackCommandOptions & {
      all?: boolean;
      aheadSeconds?: number;
      media: HTMLMediaElement;
      purpose: "pretranslate" | "export";
      signal: AbortSignal;
    }) {
      scan();
      const lease = await selection.acquire(media, options);
      if (!lease) return;
      try {
        await update(media, lease.entry.track, all, aheadSeconds, lease);
        if (!lease.valid()) throw new DOMException("", "AbortError");
        return {
          trackId: lease.entry.choice.id,
          signal: lease.signal,
          release: lease.release,
          valid: lease.valid,
        };
      } catch (error) {
        lease.release();
        throw error;
      }
    },
    refresh() {
      restore();
      for (const binding of bindings.values()) binding.abort.abort();
      bindings.clear();
      scan();
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      restore();
      for (const binding of bindings.values()) binding.abort.abort();
      bindings.clear();
    },
  };
}
