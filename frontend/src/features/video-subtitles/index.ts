import type { Settings } from "../../entities/settings";
import type { Translate } from "../../entities/translation";
import { copy } from "../../shared/i18n";
import { captionAdapters } from "./lib/adapters";
import { installDomCaptions } from "./lib/dom-captions";
import { installTextTracks } from "./lib/text-tracks";
import { createMediaScopes } from "./lib/media-scopes";
import type {
  DomCaptionAdapter,
  SubtitleCue,
  SubtitleRuntime,
} from "./model/types";
export { captionAdapters } from "./lib/adapters";
export type { DomCaptionAdapter, SubtitleCue } from "./model/types";

export interface VideoSubtitleOptions {
  document: Document;
  translate: Translate;
  getSettings: () => Settings;
  onError: (error: unknown) => void;
  adapters?: readonly DomCaptionAdapter[];
  debounceMs?: number;
  now?: () => number;
}
export interface SubtitleExportOptions {
  format?: "srt" | "vtt";
  mode?: Settings["mode"];
  includeLoaded?: boolean;
  media?: HTMLMediaElement;
}
const textEscape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("-->", "→");

export function installVideoSubtitles(options: VideoSubtitleOptions) {
  let generation = 0;
  let disposed = false;
  const history = new Map<string, SubtitleCue>();
  const scopes = createMediaScopes(options.document);
  let contextTarget:
    { media: HTMLMediaElement; scope: string; url: string } | undefined;
  const captureContext = (event: Event) => {
    contextTarget = undefined;
    if (!event.isTrusted) return;
    const media = event
      .composedPath()
      .find(
        (node) =>
          node instanceof options.document.defaultView!.HTMLMediaElement,
      ) as HTMLMediaElement | undefined;
    if (media)
      contextTarget = {
        media,
        scope: scopes.mediaScope(media),
        url: options.document.location.href,
      };
  };
  options.document.addEventListener("contextmenu", captureContext, true);
  function selectMedia(
    explicit?: HTMLMediaElement,
  ): HTMLMediaElement | undefined {
    const captured = contextTarget;
    contextTarget = undefined;
    if (explicit) {
      if (!explicit.isConnected || explicit.ownerDocument !== options.document)
        throw new Error(copy.subtitleNoCues);
      return explicit;
    }
    if (
      captured &&
      captured.media.isConnected &&
      captured.url === options.document.location.href &&
      scopes.mediaScope(captured.media) === captured.scope
    )
      return captured.media;
    const media =
      options.document.querySelectorAll<HTMLMediaElement>("video,audio");
    if (
      adapters.some((adapter) => adapter.meeting) &&
      records().some((cue) => cue.scope.startsWith("meeting-"))
    )
      return undefined;
    if (media.length > 1) throw new Error(copy.subtitleSelectVideo);
    return media[0];
  }
  function records(scope?: string) {
    for (const [id, cue] of history)
      if (!scopes.active(cue.scope)) history.delete(id);
    return [...history.values()].filter((cue) => !scope || cue.scope === scope);
  }
  function selectedScope(media?: HTMLMediaElement) {
    if (media) return scopes.mediaScope(media);
    const meetings = [
      ...new Set(
        records()
          .filter((cue) => cue.scope.startsWith("meeting-"))
          .map((cue) => cue.scope),
      ),
    ];
    if (meetings.length > 1) throw new Error(copy.subtitleSelectVideo);
    return meetings[0];
  }
  const requests = new Map<string, Promise<string>>();
  const origin = performance.now();
  const languageKey = () => {
    const settings = options.getSettings();
    return JSON.stringify([
      settings.sourceLanguage,
      settings.targetLanguage,
      settings.glossary,
    ]);
  };
  let previousLanguage = languageKey();
  function request(source: string) {
    const settings = options.getSettings();
    const key = JSON.stringify([
      settings.sourceLanguage,
      settings.targetLanguage,
      settings.glossary,
      source,
    ]);
    let pending = requests.get(key);
    if (!pending) {
      pending = options
        .translate({
          id: crypto.randomUUID(),
          text: source,
          sourceLanguage: settings.sourceLanguage,
          targetLanguage: settings.targetLanguage,
          glossary: settings.glossary,
        })
        .then((result) => result.text);
      requests.set(key, pending);
      void pending.catch(() => requests.delete(key));
    }
    return pending;
  }
  const runtime: SubtitleRuntime = {
    document: options.document,
    getSettings: options.getSettings,
    revision: () => generation,
    request,
    scope: scopes.scope,
    active: scopes.active,
    record: (cue) => {
      if (!scopes.active(cue.scope)) return;
      if (cue.timing === "observed" && !history.has(cue.id)) {
        const previous = [...history.values()]
          .reverse()
          .find(
            (item) =>
              item.scope === cue.scope &&
              item.timing === "observed" &&
              item.adapter === cue.adapter &&
              item.source === cue.source &&
              item.speaker === cue.speaker &&
              Math.abs(cue.start - item.end) < 0.3,
          );
        if (previous) {
          cue.id = previous.id;
          cue.start = previous.start;
          cue.end = Math.max(cue.end, previous.end);
        }
      }
      const existing = history.get(cue.id);
      if (existing && existing.source === cue.source) {
        cue.start = Math.min(existing.start, cue.start);
        cue.end = Math.max(existing.end, cue.end);
        if (cue.translation === undefined)
          cue.translation = existing.translation;
      }
      history.set(cue.id, cue);
    },
    onError: options.onError,
    now: options.now ?? (() => (performance.now() - origin) / 1000),
  };
  const hostname = options.document.location.hostname;
  const adapters =
    options.adapters ??
    captionAdapters.filter((adapter) =>
      adapter.hosts.some(
        (host) => hostname === host || hostname.endsWith(`.${host}`),
      ),
    );
  const tracks = installTextTracks(runtime);
  const dom = installDomCaptions(runtime, adapters, options.debounceMs);
  async function pretranslate(
    options: {
      all?: boolean;
      aheadSeconds?: number;
      media?: HTMLMediaElement;
    } = {},
  ) {
    if (disposed || !runtime.getSettings().subtitlesEnabled) return;
    const revision = generation;
    const media = selectMedia(options.media);
    const scope = selectedScope(media);
    if (!scope?.startsWith("meeting-"))
      await tracks.pretranslate({ ...options, media });
    await dom.pretranslate(scope);
    if (options.all)
      for (const cue of records(scope)) {
        if (disposed || revision !== generation) return;
        const value = await request(cue.source);
        if (disposed || revision !== generation) return;
        cue.translation = value;
      }
  }
  return {
    pretranslate,
    getTranscript: (media?: HTMLMediaElement) =>
      records(media ? scopes.mediaScope(media) : undefined)
        .map((cue) => ({ ...cue }))
        .sort((a, b) => a.start - b.start),
    async exportSubtitles({
      format = "vtt",
      mode,
      includeLoaded = true,
      media: requestedMedia,
    }: SubtitleExportOptions = {}): Promise<{ blob: Blob; name: string }> {
      const revision = generation;
      const media = selectMedia(requestedMedia);
      const scope = selectedScope(media);
      await pretranslate({ all: includeLoaded, media });
      if (disposed || revision !== generation)
        throw new DOMException("", "AbortError");
      const selected = records(scope).sort((a, b) => a.start - b.start);
      if (!selected.length) throw new Error(copy.subtitleNoCues);
      const timestamp = (time: number) => {
        const milliseconds = Math.max(0, Math.round(time * 1000));
        const hours = Math.floor(milliseconds / 3600000)
          .toString()
          .padStart(2, "0");
        const minutes = Math.floor((milliseconds / 60000) % 60)
          .toString()
          .padStart(2, "0");
        const seconds = Math.floor((milliseconds / 1000) % 60)
          .toString()
          .padStart(2, "0");
        return `${hours}:${minutes}:${seconds}${format === "srt" ? "," : "."}${(milliseconds % 1000).toString().padStart(3, "0")}`;
      };
      const bilingual = (mode ?? options.getSettings().mode) === "bilingual";
      const cues = selected
        .map(
          (cue, index) =>
            `${index + 1}\n${timestamp(cue.start)} --> ${timestamp(Math.max(cue.start + 0.001, cue.end))}\n${textEscape((cue.speaker ? `${cue.speaker}: ` : "") + (bilingual || !cue.translation ? cue.source : "") + (bilingual && cue.translation ? "\n" : "") + (cue.translation ?? ""))}`,
        )
        .join("\n\n");
      const observed = selected.some((cue) => cue.timing === "observed");
      return {
        blob: new Blob(
          [
            format === "vtt"
              ? `WEBVTT\n\n${observed ? `NOTE ${copy.subtitleObservedTimingNote}\n\n` : ""}${cues}\n`
              : `${cues}\n`,
          ],
          {
            type:
              format === "vtt"
                ? "text/vtt;charset=utf-8"
                : "application/x-subrip;charset=utf-8",
          },
        ),
        name: `${observed ? copy.subtitleObservedExportName : copy.subtitleExportName}.${format}`,
      };
    },
    refresh() {
      if (disposed) return;
      generation++;
      const revision = generation;
      const nextLanguage = languageKey();
      const changed = nextLanguage !== previousLanguage;
      previousLanguage = nextLanguage;
      if (changed) for (const cue of records()) cue.translation = undefined;
      tracks.refresh();
      dom.refresh();
      if (changed && options.getSettings().subtitlesEnabled)
        void (async () => {
          for (const cue of records()) {
            if (disposed || revision !== generation) return;
            const translated = await request(cue.source);
            if (disposed || revision !== generation) return;
            cue.translation = translated;
          }
        })().catch((error) => {
          if (!disposed && revision === generation) options.onError(error);
        });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      contextTarget = undefined;
      options.document.removeEventListener("contextmenu", captureContext, true);
      generation++;
      tracks.dispose();
      dom.dispose();
      requests.clear();
      history.clear();
    },
  };
}
