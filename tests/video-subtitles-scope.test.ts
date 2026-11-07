// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  installVideoSubtitles,
  captionAdapters,
} from "../frontend/src/features/video-subtitles";
import { defaultSettings } from "../frontend/src/entities/settings";
import type { Translate } from "../frontend/src/entities/translation";

const active: ReturnType<typeof installVideoSubtitles>[] = [];
const windows: JSDOM[] = [];
afterEach(() => {
  active.splice(0).forEach((value) => value.dispose());
  windows.splice(0).forEach((value) => value.window.close());
});
function fixture(
  url = "https://fixture.test/watch",
  html = '<video src="one.mp4"></video>',
  translate?: Translate,
) {
  const dom = new JSDOM(html, { url });
  windows.push(dom);
  const document = dom.window.document;
  const run = vi.fn<Translate>(
    translate ??
      (async (request) => ({
        id: request.id,
        text: `translated:${request.text}`,
        elapsedMs: 0,
      })),
  );
  const media = [...document.querySelectorAll("video")];
  const tracks = media.map((video, index) => {
    const cue = {
      startTime: 0,
      endTime: 5,
      text: `Source ${index}`,
      getCueAsHTML() {
        const fragment = document.createDocumentFragment();
        fragment.append(document.createTextNode(this.text));
        return fragment;
      },
    };
    const track = Object.assign(new dom.window.EventTarget(), {
      kind: "captions",
      mode: "showing",
      cues: [cue],
    });
    Object.defineProperty(video, "textTracks", {
      value: Object.assign([track], { addEventListener: vi.fn() }),
    });
    return { track, cue };
  });
  const controller = installVideoSubtitles({
    document,
    translate: run,
    getSettings: () => defaultSettings,
    onError: (error) => {
      throw error;
    },
    adapters: captionAdapters,
    debounceMs: 0,
  });
  active.push(controller);
  return { dom, document, media, tracks, controller, run };
}
const read = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

it("exports and pretranslates only the requested player; refuses an ambiguous global command", async () => {
  const { controller, media, tracks, run } = fixture(
    undefined,
    '<video src="one.mp4"></video><video src="two.mp4"></video>',
  );
  const future = {
    ...tracks[1]!.cue,
    startTime: 80,
    endTime: 85,
    text: "Other future",
  };
  tracks[1]!.track.cues.push(future);
  await vi.waitFor(() => expect(controller.getTranscript()).toHaveLength(2));
  await expect(controller.exportSubtitles()).rejects.toThrow("Choose a video");
  const exported = await read(
    (await controller.exportSubtitles({ media: media[0] })).blob,
  );
  expect(exported).toContain("Source 0");
  expect(exported).not.toContain("Source 1");
  expect(exported).not.toContain("Other future");
  expect(run.mock.calls.map(([request]) => request.text)).not.toContain(
    "Other future",
  );
  await controller.pretranslate({ all: true, media: media[1] });
  expect(controller.getTranscript(media[1]).map((cue) => cue.source)).toEqual([
    "Source 1",
    "Other future",
  ]);
});
it("preserves native history across seeks and unrelated page URL changes", async () => {
  const { dom, media, controller } = fixture();
  await vi.waitFor(() =>
    expect(controller.getTranscript()[0]?.translation).toBeDefined(),
  );
  const original = controller.getTranscript();
  dom.window.history.pushState({}, "", "?tab=comments#section");
  media[0]!.currentTime = 90;
  media[0]!.dispatchEvent(new dom.window.Event("seeked"));
  controller.refresh();
  await vi.waitFor(() =>
    expect(controller.getTranscript()[0]?.translation).toBeDefined(),
  );
  expect(controller.getTranscript()).toEqual(original);
});
it("does not insert pending native output after the source changes on the same video node", async () => {
  const pending: ((text: string) => void)[] = [];
  const { dom, media, tracks, controller } = fixture(
    undefined,
    undefined,
    (request) =>
      new Promise((resolve) =>
        pending.push((text) => resolve({ id: request.id, text, elapsedMs: 0 })),
      ),
  );
  expect(pending).toHaveLength(1);
  media[0]!.src = "two.mp4";
  tracks[0]!.cue.text = "Second source";
  media[0]!.dispatchEvent(new dom.window.Event("loadedmetadata"));
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  pending[0]!("stale");
  await Promise.resolve();
  await Promise.resolve();
  expect(tracks[0]!.cue.text).toBe("Second source");
  pending[1]!("current");
  await vi.waitFor(() =>
    expect(tracks[0]!.cue.text).toBe("Second source\ncurrent"),
  );
  expect(controller.getTranscript().map((cue) => cue.source)).toEqual([
    "Second source",
  ]);
});
it("separates YouTube SPA video IDs while retaining same-video seek parameters and ignoring blob transport churn", async () => {
  const { dom, document, media, tracks, controller } = fixture(
    "https://www.youtube.com/watch?v=first",
    '<div class="html5-video-player"><video></video><div class="caption-window">First video</div></div>',
  );
  tracks[0]!.track.mode = "disabled";
  // The native fixture starts synchronously; clear it through the disabled setting lifecycle.
  controller.refresh();
  await vi.waitFor(() =>
    expect(
      document.querySelector('[data-yaku-owned="subtitle-translation"]')
        ?.textContent,
    ).toBe("translated:First video"),
  );
  const first = controller
    .getTranscript()
    .filter((cue) => cue.timing === "observed")[0]!;
  dom.window.history.pushState({}, "", "?v=first&t=45&list=playlist");
  media[0]!.src = "blob:https://www.youtube.com/new-transport";
  controller.refresh();
  await vi.waitFor(() =>
    expect(
      controller.getTranscript().find((cue) => cue.id === first.id)
        ?.translation,
    ).toBeDefined(),
  );
  dom.window.history.pushState({}, "", "?v=second");
  document.querySelector(".caption-window")!.textContent = "Second video";
  await vi.waitFor(() =>
    expect(
      document.querySelector('[data-yaku-owned="subtitle-translation"]')
        ?.textContent,
    ).toBe("translated:Second video"),
  );
  expect(controller.getTranscript().map((cue) => cue.source)).toEqual([
    "Second video",
  ]);
  const exported = await read(
    (await controller.exportSubtitles({ media: media[0] })).blob,
  );
  expect(exported).toContain("Second video");
  expect(exported).not.toContain("First video");
});
it("separates observed meeting history when the room path changes, retaining it for query-only changes", async () => {
  const { dom, document, controller } = fixture(
    "https://meet.google.com/room-one",
    '<div jsname="dsyhDe"><span class="ygicle">First room</span></div>',
  );
  await vi.waitFor(() =>
    expect(controller.getTranscript()[0]?.translation).toBe(
      "translated:First room",
    ),
  );
  const first = controller.getTranscript();
  dom.window.history.pushState({}, "", "?authuser=1");
  controller.refresh();
  expect(controller.getTranscript()[0]).toMatchObject({
    id: first[0]!.id,
    scope: first[0]!.scope,
    source: first[0]!.source,
    start: first[0]!.start,
  });
  dom.window.history.pushState({}, "", "/room-two");
  document.querySelector(".ygicle")!.textContent = "Second room";
  await vi.waitFor(() =>
    expect(controller.getTranscript()[0]?.translation).toBe(
      "translated:Second room",
    ),
  );
  expect(controller.getTranscript().map((cue) => cue.source)).toEqual([
    "Second room",
  ]);
});
it("exports room captions rather than participant video tracks on a meeting page", async () => {
  const { controller } = fixture(
    "https://meet.google.com/room-one",
    '<video src="participant-one.mp4"></video><video src="participant-two.mp4"></video><div jsname="dsyhDe"><span class="ygicle">Room words</span></div>',
  );
  await vi.waitFor(() =>
    expect(
      controller.getTranscript().find((cue) => cue.source === "Room words")
        ?.translation,
    ).toBeDefined(),
  );
  const text = await read((await controller.exportSubtitles()).blob);
  expect(text).toContain("Room words");
  expect(text).not.toContain("Source 0");
  expect(text).not.toContain("Source 1");
});
