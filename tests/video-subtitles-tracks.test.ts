// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { installVideoSubtitles } from "../frontend/src/features/video-subtitles";
import { defaultSettings } from "../frontend/src/entities/settings";
import type { Translate } from "../frontend/src/entities/translation";
import type { NativeTrackSelector } from "../frontend/src/features/video-subtitles";
const active: ReturnType<typeof installVideoSubtitles>[] = [];
afterEach(() => {
  active.splice(0).forEach((controller) => controller.dispose());
  document.body.innerHTML = "";
  vi.useRealTimers();
});
interface Spec {
  language: string;
  mode: TextTrackMode;
  source: string;
  external?: boolean;
  default?: boolean;
  outcome?: "load" | "error" | "pending";
}
function fixture(
  specs: Spec[],
  sourceLanguage = "en",
  choose?: NativeTrackSelector,
) {
  document.body.innerHTML = '<video src="fixture.mp4"></video>';
  const media = document.querySelector("video")!;
  const events = new window.EventTarget();
  const list = Object.assign([] as TextTrack[], {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
  const native = specs.map((spec) => {
    const element = spec.external ? document.createElement("track") : undefined;
    if (element) {
      element.src = `${spec.language}.vtt`;
      element.srclang = spec.language;
      element.default = !!spec.default;
      media.append(element);
    }
    let mode = spec.mode;
    let readiness = 0;
    const target = new window.EventTarget();
    const cue = {
      startTime: 0,
      endTime: 5,
      text: spec.source,
      getCueAsHTML() {
        const fragment = document.createDocumentFragment();
        fragment.append(document.createTextNode(this.text));
        return fragment;
      },
    };
    const track = Object.assign(target, {
      kind: "subtitles",
      label: "Same untrusted label (auto-generated)",
      language: spec.language,
    }) as unknown as TextTrack;
    Object.defineProperties(track, {
      mode: {
        get: () => mode,
        set: (value: TextTrackMode) => {
          mode = value;
          queueMicrotask(() => events.dispatchEvent(new Event("change")));
          if (value !== "disabled" && element && readiness === 0) {
            readiness = 1;
            if (spec.outcome !== "pending")
              setTimeout(() => {
                readiness = spec.outcome === "error" ? 3 : 2;
                element.dispatchEvent(
                  new Event(readiness === 3 ? "error" : "load"),
                );
              }, 0);
          }
        },
      },
      cues: {
        get: () =>
          mode === "disabled" ? null : element && readiness !== 2 ? [] : [cue],
      },
    });
    if (element)
      Object.defineProperties(element, {
        track: { value: track },
        readyState: { get: () => readiness },
      });
    list.push(track);
    return {
      track,
      cue,
      element,
      setReadiness: (value: number) => {
        readiness = value;
      },
    };
  });
  Object.defineProperty(media, "textTracks", { value: list });
  const settings = { ...defaultSettings, sourceLanguage };
  const run = vi.fn<Translate>(async (request) => ({
    id: request.id,
    text: `translated:${request.text}`,
    elapsedMs: 0,
  }));
  const errors = vi.fn();
  const controller = installVideoSubtitles({
    document,
    translate: run,
    getSettings: () => settings,
    onError: errors,
    onTrackSelectionRequired: choose,
  });
  active.push(controller);
  return {
    media,
    native,
    controller,
    run,
    errors,
    settings,
    changed: () => events.dispatchEvent(new Event("change")),
  };
}
const read = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
it("respects the showing French track over hidden English and a global English hint", async () => {
  const { controller, run, native, changed } = fixture([
    { language: "en-US", mode: "hidden", source: "Hello" },
    { language: "fr-FR", mode: "showing", source: "Bonjour" },
  ]);
  await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  expect(run.mock.calls[0]![0]).toMatchObject({
    text: "Bonjour",
    sourceLanguage: "fr",
  });
  const text = await read((await controller.exportSubtitles()).blob);
  expect(text).toContain("Bonjour");
  expect(text).not.toContain("Hello");
  native[1]!.track.mode = "disabled";
  native[0]!.track.mode = "showing";
  changed();
  await vi.waitFor(() =>
    expect(native[0]!.cue.text).toContain("translated:Hello"),
  );
  expect(native[1]!.cue.text).toBe("Bonjour");
  expect(controller.getTranscript().map((cue) => cue.source)).toEqual([
    "Hello",
  ]);
});
it("does not translate ambiguous showing tracks and uses an explicit accessible choice for one export", async () => {
  const choose = vi.fn<NativeTrackSelector>(
    async (request) => request.tracks[1]!.id,
  );
  const { controller, run, native } = fixture(
    [
      { language: "en", mode: "showing", source: "English" },
      { language: "fr", mode: "showing", source: "French" },
    ],
    "en",
    choose,
  );
  await Promise.resolve();
  expect(run).not.toHaveBeenCalled();
  const output = await read((await controller.exportSubtitles()).blob);
  expect(output).toContain("French");
  expect(output).not.toContain("English");
  expect(choose.mock.calls[0]![0].purpose).toBe("export");
  expect(native.map((item) => item.track.mode)).toEqual(["showing", "showing"]);
  expect(controller.getTracks().map((track) => track.label)).toEqual([
    "Same untrusted label (auto-generated)",
    "Same untrusted label (auto-generated)",
  ]);
});
it("does not enable disabled tracks automatically, then loads only an explicit source match and restores mode", async () => {
  const { controller, run, native } = fixture(
    [
      { language: "en-US", mode: "disabled", source: "Hello", external: true },
      {
        language: "fr-FR",
        mode: "disabled",
        source: "Bonjour",
        external: true,
      },
    ],
    "fr",
  );
  expect(run).not.toHaveBeenCalled();
  expect(controller.getTracks().map((track) => track.loadState)).toEqual([
    "unloaded",
    "unloaded",
  ]);
  const output = await read((await controller.exportSubtitles()).blob);
  expect(output).toContain("Bonjour");
  expect(output).not.toContain("Hello");
  expect(run.mock.calls[0]![0].sourceLanguage).toBe("fr");
  expect(native.map((item) => item.track.mode)).toEqual([
    "disabled",
    "disabled",
  ]);
  expect(controller.getTracks().map((track) => track.loadState)).toEqual([
    "unloaded",
    "loaded",
  ]);
});
it("uses a unique default when no active/source-language choice exists without enabling other tracks", async () => {
  const { controller, native } = fixture(
    [
      {
        language: "en",
        mode: "disabled",
        source: "Default words",
        external: true,
        default: true,
      },
      {
        language: "fr",
        mode: "disabled",
        source: "Other words",
        external: true,
      },
    ],
    "auto",
  );
  const text = await read((await controller.exportSubtitles()).blob);
  expect(text).toContain("Default words");
  expect(text).not.toContain("Other words");
  expect(native.map((item) => item.track.mode)).toEqual([
    "disabled",
    "disabled",
  ]);
});
it("rejects a failed chosen resource without falling through to another language", async () => {
  const { controller, run, native } = fixture([
    {
      language: "en",
      mode: "disabled",
      source: "Unavailable",
      external: true,
      outcome: "error",
    },
    { language: "fr", mode: "disabled", source: "Other", external: true },
  ]);
  await expect(controller.exportSubtitles()).rejects.toThrow(
    "could not be loaded",
  );
  expect(run).not.toHaveBeenCalled();
  expect(native.map((item) => item.track.mode)).toEqual([
    "disabled",
    "disabled",
  ]);
});
it("aborts pending loading on dispose and releases owned hidden mode", async () => {
  const { controller, native } = fixture([
    {
      language: "en",
      mode: "disabled",
      source: "Never arrives",
      external: true,
      outcome: "pending",
    },
  ]);
  const result = controller.exportSubtitles();
  const assertion = expect(result).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.waitFor(() => expect(native[0]!.track.mode).toBe("hidden"));
  controller.dispose();
  await assertion;
  expect(native[0]!.track.mode).toBe("disabled");
});
it("preserves a player mode change made during acquisition rather than overwriting it", async () => {
  const { controller, native } = fixture([
    {
      language: "en",
      mode: "disabled",
      source: "Pending",
      external: true,
      outcome: "pending",
    },
  ]);
  const result = controller.exportSubtitles();
  const assertion = expect(result).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.waitFor(() => expect(native[0]!.track.mode).toBe("hidden"));
  native[0]!.track.mode = "showing";
  await assertion;
  expect(native[0]!.track.mode).toBe("showing");
});
it("aborts chooser lifetime on navigation and settings refresh even if callback never resolves", async () => {
  let signal: AbortSignal | undefined;
  const { controller } = fixture(
    [
      { language: "en", mode: "hidden", source: "A" },
      { language: "fr", mode: "hidden", source: "B" },
    ],
    "auto",
    (request) => {
      signal = request.signal;
      return new Promise(() => {});
    },
  );
  const result = controller.exportSubtitles();
  const assertion = expect(result).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.waitFor(() => expect(signal).toBeDefined());
  controller.refresh();
  await assertion;
  expect(signal!.aborted).toBe(true);
});
it("invalidates track IDs and aborts loading when the declared VTT source is replaced", async () => {
  const { controller, native } = fixture([
    {
      language: "en",
      mode: "disabled",
      source: "Old source",
      external: true,
      outcome: "pending",
    },
  ]);
  const old = controller.getTracks()[0]!.id;
  const result = controller.exportSubtitles();
  const assertion = expect(result).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.waitFor(() => expect(native[0]!.track.mode).toBe("hidden"));
  native[0]!.element!.src = "replacement.vtt";
  await assertion;
  expect(controller.getTracks()[0]!.id).not.toBe(old);
  expect(native[0]!.track.mode).toBe("disabled");
  await expect(controller.exportSubtitles({ trackId: old })).rejects.toThrow(
    "no longer available",
  );
});
it("reports a bounded resource-loading timeout distinct from user cancellation", async () => {
  vi.useFakeTimers();
  const { controller, native } = fixture([
    {
      language: "en",
      mode: "disabled",
      source: "Pending",
      external: true,
      outcome: "pending",
    },
  ]);
  const result = controller.exportSubtitles();
  const assertion = expect(result).rejects.toThrow("did not finish loading");
  await vi.advanceTimersByTimeAsync(15001);
  await assertion;
  expect(native[0]!.track.mode).toBe("disabled");
});
it.each([
  ["zh-Hant-TW", "zh-Hant"],
  ["zh-TW", "zh-Hant"],
  ["en-US", "en"],
  ["not a BCP47 tag", "de"],
  ["xx-ZZ", "de"],
])(
  "normalizes declared %s to a supported source hint %s",
  async (language, expected) => {
    const { controller, run } = fixture(
      [{ language, mode: "showing", source: "Words" }],
      "de",
    );
    await vi.waitFor(() => expect(run).toHaveBeenCalled());
    expect(run.mock.calls[0]![0].sourceLanguage).toBe(expected);
    controller.dispose();
  },
);
it("does not acquire disabled tracks when explicitly disabled by the command", async () => {
  const { controller, native, run } = fixture([
    {
      language: "en",
      mode: "disabled",
      source: "Not acquired",
      external: true,
    },
  ]);
  await expect(controller.exportSubtitles({ acquire: false })).rejects.toThrow(
    "No captions",
  );
  expect(native[0]!.track.mode).toBe("disabled");
  expect(run).not.toHaveBeenCalled();
});
it("cancels a hidden lease when the player selects another native track", async () => {
  const { controller, native } = fixture([
    {
      language: "en",
      mode: "disabled",
      source: "Pending",
      external: true,
      outcome: "pending",
    },
    { language: "fr", mode: "disabled", source: "French choice" },
  ]);
  const pending = controller.exportSubtitles();
  const assertion = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.waitFor(() => expect(native[0]!.track.mode).toBe("hidden"));
  native[1]!.track.mode = "showing";
  await assertion;
  expect(native.map((item) => item.track.mode)).toEqual([
    "disabled",
    "showing",
  ]);
});
it("preserves an explicit Hans script over a region convention and acquires a unique Chinese variant for generic Chinese", async () => {
  const first = fixture(
    [{ language: "zh-Hans-TW", mode: "showing", source: "Words" }],
    "de",
  );
  await vi.waitFor(() => expect(first.run).toHaveBeenCalled());
  expect(first.run.mock.calls[0]![0].sourceLanguage).toBe("zh");
  first.controller.dispose();
  const second = fixture(
    [
      {
        language: "zh-Hant",
        mode: "disabled",
        source: "Chinese words",
        external: true,
      },
      {
        language: "fr",
        mode: "disabled",
        source: "French words",
        external: true,
      },
    ],
    "zh",
  );
  const output = await read((await second.controller.exportSubtitles()).blob);
  expect(output).toContain("Chinese words");
  expect(output).not.toContain("French words");
  expect(second.run.mock.calls[0]![0].sourceLanguage).toBe("zh-Hant");
});
it("does not overwrite a host-edited native cue while its media is detached", async () => {
  const { controller, native, media } = fixture([
    { language: "en", mode: "showing", source: "Original words" },
  ]);
  await vi.waitFor(() =>
    expect(native[0]!.cue.text).toContain("translated:Original words"),
  );
  native[0]!.cue.text = "Host replacement during player removal";
  media.remove();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(native[0]!.cue.text).toBe("Host replacement during player removal");
  controller.dispose();
  expect(native[0]!.cue.text).toBe("Host replacement during player removal");
});
