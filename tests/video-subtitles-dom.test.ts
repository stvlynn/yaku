// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installVideoSubtitles,
  captionAdapters,
} from "../frontend/src/features/video-subtitles";
import { defaultSettings } from "../frontend/src/entities/settings";
import type {
  Translate,
  TranslationRequest,
} from "../frontend/src/entities/translation";

const active: ReturnType<typeof installVideoSubtitles>[] = [];
afterEach(() => {
  active.splice(0).forEach((controller) => controller.dispose());
  document.body.innerHTML = "";
});
const fixtures = [
  {
    id: "youtube",
    html: '<div class="html5-video-player"><video></video><div class="caption-window"><span class="caption-visual-line">Hello</span><span class="caption-visual-line">world</span></div></div>',
    source: "Hello world",
  },
  {
    id: "netflix",
    html: '<div class="watch-video"><video></video><div class="player-timedtext-text-container"><span style="color:white;font-size:24px">Hello world</span></div></div>',
    source: "Hello world",
  },
  {
    id: "udemy",
    html: '<video></video><span class="captions-display-module--captions-cue-text--fixture">Hello world</span>',
    source: "Hello world",
  },
  {
    id: "google-meet",
    html: '<div role="region" aria-label="Captions"><div class="nMcdL"><span class="NWpY1d">Alex</span><div class="ygicle">Hello world</div></div></div>',
    source: "Hello world",
  },
  {
    id: "zoom",
    html: '<div class="live-transcription-subtitle__box"><div class="live-transcription-subtitle__item"><span class="live-transcription-subtitle__speaker">Alex</span><span>Hello world</span></div></div>',
    source: "Hello world",
  },
  {
    id: "teams",
    html: '<div data-tid="closed-caption-chat-message"><span class="ui-chat__message__author">Alex</span><span data-tid="closed-caption-text">Hello world</span></div>',
    source: "Hello world",
  },
];
function setup(id: string, html: string, translate?: Translate) {
  document.body.innerHTML = html;
  for (const media of document.querySelectorAll("video"))
    Object.defineProperty(media, "textTracks", {
      value: Object.assign([], { addEventListener: vi.fn() }),
    });
  const settings = { ...defaultSettings };
  const run = vi.fn<Translate>(
    translate ??
      (async (request: TranslationRequest) => ({
        id: request.id,
        text: "<你好> " + request.text,
        elapsedMs: 0,
      })),
  );
  let clock = 1;
  const errors = vi.fn();
  const controller = installVideoSubtitles({
    document,
    translate: run,
    getSettings: () => settings,
    onError: errors,
    adapters: captionAdapters.filter((adapter) => adapter.id === id),
    debounceMs: 0,
    now: () => clock,
  });
  active.push(controller);
  return {
    controller,
    run,
    settings,
    errors,
    setClock: (value: number) => {
      clock = value;
    },
  };
}

describe("representative DOM caption adapters, fixture verified only", () => {
  it.each(fixtures)(
    "$id translates visible caption text and restores exact native DOM",
    async ({ id, html, source }) => {
      const { controller, run, errors } = setup(id, html);
      const original = document.body.innerHTML;
      await vi.waitFor(() =>
        expect(
          document.querySelector('[data-yaku-owned="subtitle-translation"]')
            ?.textContent,
        ).toBe("<你好> " + source),
      );
      expect(run).toHaveBeenCalledTimes(1);
      expect(run.mock.calls[0]![0].text).toBe(source);
      expect(document.querySelector("你好")).toBeNull();
      expect(controller.getTranscript()).toEqual([
        expect.objectContaining({
          source,
          translation: "<你好> " + source,
          adapter: id,
          timing: "observed",
        }),
      ]);
      if (["google-meet", "zoom", "teams"].includes(id))
        expect(controller.getTranscript()[0]?.speaker).toBe("Alex");
      expect(errors).not.toHaveBeenCalled();
      controller.dispose();
      expect(document.body.innerHTML).toBe(original);
    },
  );

  it("coalesces incremental speech, rejects stale output and deduplicates remounted captions", async () => {
    const pending: { source: string; complete: (text: string) => void }[] = [];
    const { controller, run } = setup(
      "youtube",
      '<video></video><div class="caption-window">Hello</div>',
      (request) =>
        new Promise((resolve) =>
          pending.push({
            source: request.text,
            complete: (text) => resolve({ id: request.id, text, elapsedMs: 0 }),
          }),
        ),
    );
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    const caption = document.querySelector(".caption-window")!;
    caption.textContent = "Hello world";
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[0]!.complete("old output");
    await Promise.resolve();
    await Promise.resolve();
    expect(
      caption.querySelector('[data-yaku-owned="subtitle-translation"]'),
    ).toBeNull();
    pending[1]!.complete("你好世界");
    await vi.waitFor(() =>
      expect(
        caption.querySelector('[data-yaku-owned="subtitle-translation"]')
          ?.textContent,
      ).toBe("你好世界"),
    );
    expect(controller.getTranscript()).toHaveLength(1);
    const replacement = document.createElement("div");
    replacement.className = "caption-window";
    replacement.textContent = "Hello world";
    caption.replaceWith(replacement);
    await vi.waitFor(() =>
      expect(
        replacement.querySelector('[data-yaku-owned="subtitle-translation"]')
          ?.textContent,
      ).toBe("你好世界"),
    );
    expect(run).toHaveBeenCalledTimes(2);
    expect(controller.getTranscript()).toHaveLength(1);
  });

  it("supports translation-only mode, preserves speaker text and exports observed timing honestly", async () => {
    const fixture = fixtures.find((item) => item.id === "google-meet")!;
    const { controller, settings, setClock } = setup(fixture.id, fixture.html);
    await controller.pretranslate();
    settings.mode = "translation";
    controller.refresh();
    await controller.pretranslate();
    expect(
      [
        ...document.querySelectorAll<HTMLElement>(
          '[data-yaku-owned="subtitle-source"]',
        ),
      ].every((node) => node.hidden),
    ).toBe(true);
    expect(document.querySelector(".NWpY1d")?.textContent).toBe("Alex");
    setClock(4);
    const output = await controller.exportSubtitles({
      format: "srt",
      mode: "bilingual",
    });
    expect(output.name).toBe("observed-captions.srt");
    const source = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(output.blob);
    });
    expect(source).toContain("00:00:01,000 --> 00:00:04,000");
    expect(source).toContain("Hello world\n&lt;你好&gt; Hello world");
    settings.subtitlesEnabled = false;
    controller.refresh();
    expect(
      document.querySelector('[data-yaku-owned="subtitle-translation"]'),
    ).toBeNull();
    expect(document.querySelector(".ygicle")?.textContent).toBe("Hello world");
  });

  it("prefers an available native track to avoid double translation overlays", async () => {
    document.body.innerHTML =
      '<div class="html5-video-player"><video></video><div class="caption-window">Hello world</div></div>';
    const media = document.querySelector("video")!;
    const cue = {
      text: "Hello world",
      startTime: 0,
      endTime: 5,
      getCueAsHTML() {
        const fragment = document.createDocumentFragment();
        fragment.append(document.createTextNode(this.text));
        return fragment;
      },
    };
    const track = Object.assign(new EventTarget(), {
      kind: "captions",
      mode: "showing",
      cues: [cue],
    });
    Object.defineProperty(media, "textTracks", {
      value: Object.assign([track], { addEventListener: vi.fn() }),
    });
    const run = vi.fn<Translate>(async (request) => ({
      id: request.id,
      text: "你好世界",
      elapsedMs: 0,
    }));
    const controller = installVideoSubtitles({
      document,
      translate: run,
      getSettings: () => defaultSettings,
      onError: vi.fn(),
      adapters: captionAdapters.filter((adapter) => adapter.id === "youtube"),
      debounceMs: 0,
    });
    active.push(controller);
    await controller.pretranslate();
    expect(run).toHaveBeenCalledTimes(1);
    expect(
      document.querySelector('[data-yaku-owned="subtitle-translation"]'),
    ).toBeNull();
    expect(
      controller.getTranscript().every((item) => item.timing === "track"),
    ).toBe(true);
  });

  it("keeps departed meeting captions across appearance changes and retranslates their history for a new language", async () => {
    const fixture = fixtures.find((item) => item.id === "google-meet")!;
    const { controller, settings, run, setClock } = setup(
      fixture.id,
      fixture.html,
      async (request) => ({
        id: request.id,
        text: `${request.targetLanguage}:${request.text}`,
        elapsedMs: 0,
      }),
    );
    await controller.pretranslate();
    const id = controller.getTranscript()[0]!.id;
    setClock(3);
    document.querySelector('[role="region"]')!.remove();
    await vi.waitFor(() => expect(controller.getTranscript()[0]?.end).toBe(3));
    settings.theme = "dark";
    settings.fontSize = 120;
    controller.refresh();
    expect(controller.getTranscript()).toEqual([
      expect.objectContaining({
        id,
        source: "Hello world",
        translation: "zh:Hello world",
        start: 1,
        end: 3,
      }),
    ]);
    expect(run).toHaveBeenCalledTimes(1);
    settings.targetLanguage = "ja";
    controller.refresh();
    await vi.waitFor(() =>
      expect(controller.getTranscript()[0]?.translation).toBe("ja:Hello world"),
    );
    expect(controller.getTranscript()).toHaveLength(1);
    expect(controller.getTranscript()[0]?.id).toBe(id);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not attach domain adapters to unrelated sites without explicit configuration", async () => {
    document.body.innerHTML =
      '<div class="caption-window">Unrelated content</div>';
    const run = vi.fn<Translate>();
    const controller = installVideoSubtitles({
      document,
      translate: run,
      getSettings: () => defaultSettings,
      onError: vi.fn(),
      debounceMs: 0,
    });
    active.push(controller);
    await controller.pretranslate();
    expect(run).not.toHaveBeenCalled();
    expect(controller.getTranscript()).toEqual([]);
  });
});
