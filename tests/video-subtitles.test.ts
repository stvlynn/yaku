// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installVideoSubtitles } from "../frontend/src/features/video-subtitles";
import { defaultSettings } from "../frontend/src/entities/settings";
import type { TranslationRequest } from "../frontend/src/entities/translation";

class Cue {
  constructor(
    public startTime: number,
    public endTime: number,
    public text: string,
  ) {}
  getCueAsHTML() {
    const template = document.createElement("template");
    template.innerHTML = this.text;
    return template.content;
  }
}
function fixture() {
  vi.stubGlobal("VTTCue", Cue);
  document.body.innerHTML = "<video></video>";
  const media = document.querySelector("video")!;
  const cue = new Cue(0, 5, "<b>Hello</b> world");
  const track = Object.assign(new EventTarget(), {
    kind: "subtitles",
    mode: "showing",
    cues: [cue],
  });
  const tracks = Object.assign([track], { addEventListener: vi.fn() });
  Object.defineProperty(media, "textTracks", { value: tracks });
  return { cue, media, track };
}
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("standard video text tracks", () => {
  it("escapes generated markup, retains cue timing and restores exact original text", async () => {
    const { cue } = fixture();
    const settings = { ...defaultSettings };
    const run = vi.fn(async (request: TranslationRequest) => ({
      id: request.id,
      text: "<script>你好</script>",
      elapsedMs: 1,
    }));
    const subtitles = installVideoSubtitles({
      document,
      translate: run,
      getSettings: () => settings,
      onError: (error) => {
        throw error;
      },
    });
    await vi.waitFor(() => expect(cue.text).toContain("&lt;script&gt;"));
    expect(run.mock.calls[0]![0].text).toBe("Hello world");
    expect(cue.startTime).toBe(0);
    expect(cue.endTime).toBe(5);
    expect(cue.text.startsWith("<b>Hello</b> world\n")).toBe(true);
    settings.subtitlesEnabled = false;
    subtitles.refresh();
    expect(cue.text).toBe("<b>Hello</b> world");
    subtitles.dispose();
  });
  it("does not write a translation after subtitles are disabled", async () => {
    const { cue } = fixture();
    const settings = { ...defaultSettings };
    let complete!: (value: {
      id: string;
      text: string;
      elapsedMs: number;
    }) => void;
    const subtitles = installVideoSubtitles({
      document,
      translate: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
      getSettings: () => settings,
      onError: (error) => {
        throw error;
      },
    });
    settings.subtitlesEnabled = false;
    subtitles.refresh();
    complete({ id: "late", text: "late output", elapsedMs: 1 });
    await Promise.resolve();
    await Promise.resolve();
    expect(cue.text).toBe("<b>Hello</b> world");
    subtitles.dispose();
  });
});

it("pretranslates all loaded cues on explicit export and keeps native track timestamps", async () => {
  const { cue, media, track } = fixture();
  const future = new Cue(65, 70, "A later sentence");
  track.cues.push(future);
  const settings = { ...defaultSettings };
  const run = vi.fn(async (request: TranslationRequest) => ({
    id: request.id,
    text: "译文:" + request.text,
    elapsedMs: 0,
  }));
  const subtitles = installVideoSubtitles({
    document,
    translate: run,
    getSettings: () => settings,
    onError: (error) => {
      throw error;
    },
  });
  await vi.waitFor(() => expect(cue.text).toContain("译文:"));
  expect(future.text).toBe("A later sentence");
  const output = await subtitles.exportSubtitles({ format: "vtt" });
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(output.blob);
  });
  expect(output.name).toBe("captions.vtt");
  expect(text).toContain("00:01:05.000 --> 00:01:10.000");
  expect(text).toContain("A later sentence\n译文:A later sentence");
  media.dispatchEvent(new Event("timeupdate"));
  await Promise.resolve();
  expect(run).toHaveBeenCalledTimes(2);
  subtitles.dispose();
  expect(future.text).toBe("A later sentence");
});

it("does not overwrite externally changed native cues with an earlier pending translation", async () => {
  const { cue, track } = fixture();
  const pending: ((text: string) => void)[] = [];
  const subtitles = installVideoSubtitles({
    document,
    translate: (request) =>
      new Promise((resolve) =>
        pending.push((text) => resolve({ id: request.id, text, elapsedMs: 0 })),
      ),
    getSettings: () => defaultSettings,
    onError: (error) => {
      throw error;
    },
  });
  cue.text = "Updated source";
  track.dispatchEvent(new Event("cuechange"));
  expect(pending).toHaveLength(2);
  pending[0]!("stale");
  await Promise.resolve();
  await Promise.resolve();
  expect(cue.text).toBe("Updated source");
  pending[1]!("新译文");
  await vi.waitFor(() => expect(cue.text).toBe("Updated source\n新译文"));
  subtitles.dispose();
  expect(cue.text).toBe("Updated source");
});

it("keeps native cue identity stable across appearance refreshes and language changes", async () => {
  const { cue } = fixture();
  const settings = { ...defaultSettings };
  const run = vi.fn(async (request: TranslationRequest) => ({
    id: request.id,
    text: `${request.targetLanguage}:${request.text}`,
    elapsedMs: 0,
  }));
  const subtitles = installVideoSubtitles({
    document,
    translate: run,
    getSettings: () => settings,
    onError: (error) => {
      throw error;
    },
  });
  await subtitles.pretranslate();
  const id = subtitles.getTranscript()[0]!.id;
  settings.fontSize = 120;
  settings.theme = "dark";
  subtitles.refresh();
  await subtitles.pretranslate();
  expect(subtitles.getTranscript()).toEqual([
    expect.objectContaining({
      id,
      source: "Hello world",
      translation: "zh:Hello world",
    }),
  ]);
  expect(run).toHaveBeenCalledTimes(1);
  settings.targetLanguage = "ja";
  subtitles.refresh();
  await vi.waitFor(() => expect(cue.text).toContain("ja:Hello world"));
  expect(subtitles.getTranscript()).toHaveLength(1);
  expect(subtitles.getTranscript()[0]?.id).toBe(id);
  expect(run).toHaveBeenCalledTimes(2);
  subtitles.dispose();
});
