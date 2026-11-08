// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installPageImages,
  type BatchImageRequest,
} from "../frontend/src/features/page-images";
import { defaultSettings } from "../frontend/src/entities/settings";

class Visibility {
  static current: Visibility;
  targets = new Set<Element>();
  constructor(private callback: IntersectionObserverCallback) {
    Visibility.current = this;
  }
  observe(element: Element) {
    this.targets.add(element);
  }
  unobserve(element: Element) {
    this.targets.delete(element);
  }
  disconnect() {
    this.targets.clear();
  }
  show(element: Element, visible = true) {
    this.callback(
      [
        {
          target: element,
          isIntersecting: visible,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
}
const active: ReturnType<typeof installPageImages>[] = [];
beforeEach(() => vi.stubGlobal("IntersectionObserver", Visibility));
afterEach(() => {
  active.splice(0).forEach((controller) => controller.dispose());
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  document
    .querySelectorAll("[data-yaku-owned]")
    .forEach((node) => node.remove());
});
function dimensions(
  image: HTMLImageElement,
  width = 200,
  height = 100,
  complete = true,
) {
  Object.defineProperties(image, {
    naturalWidth: { value: width, configurable: true },
    naturalHeight: { value: height, configurable: true },
    complete: { value: complete, configurable: true },
  });
}
function setup(
  html: string,
  translate?: (request: BatchImageRequest) => Promise<string>,
) {
  document.body.innerHTML = html;
  document.querySelectorAll("img").forEach((image) => dimensions(image));
  const settings = { ...defaultSettings };
  const run = vi.fn(
    translate ??
      (async (request: BatchImageRequest) =>
        "data:image/png;base64," + btoa(request.url)),
  );
  const cancel = vi.fn(async () => {});
  const cancelBatch = vi.fn(async () => {});
  const controller = installPageImages({
    document,
    getSettings: () => settings,
    translate: vi.fn(),
    cancel,
    translateBatchImage: run,
    cancelBatch,
  });
  active.push(controller);
  return { controller, run, cancel, cancelBatch, settings };
}
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("explicit reader image batches", () => {
  it("does nothing until explicitly started and translates only near-viewport scoped loaded images, including small text images", async () => {
    const { controller, run } = setup(
      '<main><picture><source srcset="a-large.png 2x"><img id="first" src="https://images.example/one.png" alt="Words"></picture><img id="lazy" src="https://images.example/two.png" loading="lazy"><img id="tiny" src="https://images.example/icon.png"></main><aside><img id="outside" src="https://images.example/outside.png"></aside>',
    );
    const original = document.body.innerHTML;
    const first = document.querySelector<HTMLImageElement>("#first")!;
    const lazy = document.querySelector<HTMLImageElement>("#lazy")!;
    const tiny = document.querySelector<HTMLImageElement>("#tiny")!;
    dimensions(lazy, 0, 0, false);
    dimensions(tiny, 16, 16);
    expect(run).not.toHaveBeenCalled();
    expect(document.querySelector("[data-yaku-image-batch]")).toBeNull();
    controller.startBatch("reader-one");
    expect(
      Visibility.current.targets.has(document.querySelector("#outside")!),
    ).toBe(false);
    Visibility.current.show(first);
    Visibility.current.show(lazy);
    Visibility.current.show(tiny);
    await vi.waitFor(() =>
      expect(controller.getBatchState().completed).toBe(1),
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        sessionId: "reader-one",
        url: "https://images.example/one.png",
      }),
    );
    dimensions(lazy, 200, 100, true);
    lazy.dispatchEvent(new Event("load"));
    await vi.waitFor(() =>
      expect(controller.getBatchState().completed).toBe(2),
    );
    expect(run).toHaveBeenCalledTimes(2);
    controller.restore();
    expect(document.body.innerHTML).toBe(original);
    expect(document.querySelector("[data-yaku-image-batch]")).toBeNull();
  });

  it("serializes OCR requests and reuses an already authorized same-session URL result", async () => {
    let finish!: (value: string) => void;
    const { controller, run } = setup(
      '<main><img id="one" src="https://images.example/same.png"><img id="two" src="https://images.example/same.png"></main>',
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    controller.startBatch("serial");
    const one = document.querySelector<HTMLImageElement>("#one")!;
    const two = document.querySelector<HTMLImageElement>("#two")!;
    Visibility.current.show(one);
    Visibility.current.show(two);
    expect(run).toHaveBeenCalledTimes(1);
    finish("data:image/png;base64,c2FtZQ==");
    await vi.waitFor(() =>
      expect(controller.getBatchState().completed).toBe(2),
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(one.src).toBe(two.src);
  });

  it("observes inserted reader images and rejects old responses after a virtualized image source changes", async () => {
    const pending: {
      request: BatchImageRequest;
      finish: (value: string) => void;
    }[] = [];
    const { controller, cancel } = setup(
      '<main><img id="page" src="https://images.example/old.png"></main>',
      (request) =>
        new Promise((resolve) => pending.push({ request, finish: resolve })),
    );
    controller.startBatch("virtual");
    const image = document.querySelector<HTMLImageElement>("#page")!;
    Visibility.current.show(image);
    expect(pending).toHaveLength(1);
    image.src = "https://images.example/new.png";
    await settle();
    expect(cancel).toHaveBeenCalledWith(pending[0]!.request.id);
    pending[0]!.finish("data:image/png;base64,b2xk");
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(image.src).toBe("https://images.example/new.png");
    pending[1]!.finish("data:image/png;base64,bmV3");
    await vi.waitFor(() =>
      expect(controller.getBatchState().completed).toBe(1),
    );
    const inserted = document.createElement("img");
    inserted.src = "https://images.example/later.png";
    dimensions(inserted);
    document.querySelector("main")!.append(inserted);
    await settle();
    expect(Visibility.current.targets.has(inserted)).toBe(true);
    Visibility.current.show(inserted);
    await vi.waitFor(() => expect(pending).toHaveLength(3));
    pending[2]!.finish("data:image/png;base64,bGF0ZXI=");
    await vi.waitFor(() =>
      expect(controller.getBatchState().completed).toBe(2),
    );
    controller.restore();
    expect(image.src).toBe("https://images.example/new.png");
    expect(inserted.src).toBe("https://images.example/later.png");
  });

  it("does not poison a revisited URL with an earlier canceled source version", async () => {
    let rejectFirst!: (error: unknown) => void;
    let call = 0;
    const { controller, run } = setup(
      '<main><img src="https://images.example/old.png"></main>',
      async (request) => {
        if (++call === 1)
          return new Promise<string>((_, reject) => {
            rejectFirst = reject;
          });
        return "data:image/png;base64," + btoa(request.url);
      },
    );
    controller.startBatch("revisit");
    const image = document.querySelector("img")!;
    Visibility.current.show(image);
    expect(run).toHaveBeenCalledTimes(1);
    image.src = "https://images.example/new.png";
    await settle();
    rejectFirst(new DOMException("", "AbortError"));
    await vi.waitFor(() =>
      expect(controller.getBatchState().completed).toBe(1),
    );
    image.src = "https://images.example/old.png";
    await vi.waitFor(() =>
      expect(controller.getBatchState().completed).toBe(2),
    );
    expect(run).toHaveBeenCalledTimes(3);
    expect(controller.getBatchState().failed).toBe(0);
  });

  it("counts empty OCR as skipped while exposing other errors and continuing independent images", async () => {
    const { controller, run } = setup(
      '<main><img id="empty" src="https://images.example/empty.png"><img id="error" src="https://images.example/error.png"><img id="ok" src="https://images.example/ok.png"></main>',
      async (request) => {
        if (request.url.includes("empty"))
          throw Object.assign(new Error("No text"), {
            name: "ImageNoTextError",
          });
        if (request.url.includes("error"))
          throw new Error("Image request denied");
        return "data:image/png;base64,b2s=";
      },
    );
    controller.startBatch("errors");
    document
      .querySelectorAll("img")
      .forEach((image) => Visibility.current.show(image));
    await vi.waitFor(() =>
      expect(controller.getBatchState()).toEqual({
        active: true,
        queued: 0,
        completed: 1,
        skipped: 1,
        failed: 1,
      }),
    );
    const host = document.querySelector("[data-yaku-image-batch]")!;
    expect(
      host.shadowRoot!.querySelector('[role="alert"]')?.textContent,
    ).toContain("Image request denied");
    document.querySelector("#empty")!.dispatchEvent(new Event("load"));
    await settle();
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("retains completed images on Stop and preserves original sources when pending work returns late", async () => {
    let finish!: (value: string) => void;
    const { controller, cancelBatch } = setup(
      '<main><img id="done" src="https://images.example/done.png"><img id="pending" src="https://images.example/pending.png"></main>',
      async (request) =>
        request.url.includes("pending")
          ? new Promise<string>((resolve) => {
              finish = resolve;
            })
          : "data:image/png;base64,ZG9uZQ==",
    );
    controller.startBatch("stop");
    const done = document.querySelector<HTMLImageElement>("#done")!;
    const pending = document.querySelector<HTMLImageElement>("#pending")!;
    Visibility.current.show(done);
    Visibility.current.show(pending);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    controller.stopBatch();
    expect(cancelBatch).toHaveBeenCalledWith("stop");
    finish("data:image/png;base64,bGF0ZQ==");
    await settle();
    expect(controller.getBatchState().active).toBe(false);
    expect(done.src).toContain("data:image/png");
    expect(pending.src).toBe("https://images.example/pending.png");
    controller.restore();
    expect(done.src).toBe("https://images.example/done.png");
  });

  it("updates appearance without stopping but stops new work when translation preferences change", async () => {
    const { controller, settings, cancelBatch } = setup(
      '<main><img src="https://images.example/one.png"></main>',
    );
    controller.startBatch("preferences");
    Visibility.current.show(document.querySelector("img")!);
    await vi.waitFor(() =>
      expect(controller.getBatchState().completed).toBe(1),
    );
    settings.theme = "dark";
    settings.fontSize = 125;
    controller.refresh();
    expect(controller.getBatchState().active).toBe(true);
    expect(cancelBatch).not.toHaveBeenCalled();
    settings.targetLanguage = "ja";
    controller.refresh();
    expect(controller.getBatchState().active).toBe(false);
    expect(cancelBatch).toHaveBeenCalledWith("preferences");
    expect(
      document.querySelector("[data-yaku-image-batch]")?.shadowRoot
        ?.textContent,
    ).toContain("Translation preferences changed");
  });

  it("stops the authorized reader session when its scope leaves the document", async () => {
    const { controller, cancelBatch } = setup(
      '<main><img src="https://images.example/one.png"></main>',
    );
    controller.startBatch("scope");
    document.querySelector("main")!.remove();
    await settle();
    expect(controller.getBatchState().active).toBe(false);
    expect(cancelBatch).toHaveBeenCalledWith("scope");
  });
});
