// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installPageImages } from "../frontend/src/features/page-images";
import { defaultSettings } from "../frontend/src/entities/settings";

afterEach(() => {
  document.body.innerHTML = "";
  document
    .querySelectorAll("[data-yaku-owned]")
    .forEach((node) => node.remove());
});
const original =
  '<picture><source srcset="large.png 2x" sizes="50vw"><img src="https://example.org/image.png" srcset="small.png 1x" sizes="100vw" alt="Words"></picture>';
describe("page image translation", () => {
  it("preserves original image nodes, event listeners, and responsive attributes on restore", async () => {
    document.body.innerHTML = original;
    const image = document.querySelector("img")!;
    const clicked = vi.fn();
    image.addEventListener("click", clicked);
    const images = installPageImages({
      document,
      getSettings: () => defaultSettings,
      translate: async () => "data:image/png;base64,dGVzdA==",
      cancel: async () => {},
    });
    await images.start("one", image.src);
    expect(image.src).toContain("data:image/png");
    expect(document.querySelector("source")!.getAttribute("srcset")).toBe("");
    image.click();
    expect(clicked).toHaveBeenCalledOnce();
    images.restore();
    expect(document.body.innerHTML).toBe(original);
    expect(document.querySelector("img")).toBe(image);
    images.dispose();
  });
  it("cancels pending translation and ignores its late response", async () => {
    document.body.innerHTML = original;
    const image = document.querySelector("img")!;
    let finish!: (value: string) => void;
    const cancel = vi.fn(async () => {});
    const images = installPageImages({
      document,
      getSettings: () => defaultSettings,
      cancel,
      translate: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const running = images.start("two", image.src);
    images.restore();
    finish("data:image/png;base64,dGVzdA==");
    await running;
    expect(cancel).toHaveBeenCalledWith("two");
    expect(document.body.innerHTML).toBe(original);
    images.dispose();
  });
  it("does not overwrite an image changed by the page during translation", async () => {
    document.body.innerHTML = original;
    const image = document.querySelector("img")!;
    let finish!: (value: string) => void;
    const images = installPageImages({
      document,
      getSettings: () => defaultSettings,
      cancel: async () => {},
      translate: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const running = images.start("three", image.src);
    image.src = "https://example.org/new.png";
    finish("data:image/png;base64,dGVzdA==");
    await running;
    expect(image.src).toBe("https://example.org/new.png");
    expect(document.querySelector("[data-yaku-image]")).toBeNull();
    images.dispose();
  });
});

it("rejects a late result when responsive source nodes were replaced without changing the image node", async () => {
  document.body.innerHTML = original;
  const image = document.querySelector("img")!;
  let finish!: (value: string) => void;
  const images = installPageImages({
    document,
    getSettings: () => defaultSettings,
    cancel: async () => {},
    translate: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const pending = images.start("responsive-recycle", image.src);
  const replacement = document.createElement("source");
  replacement.srcset = "new-reader-page.png 2x";
  document.querySelector("source")!.replaceWith(replacement);
  finish("data:image/png;base64,c3RhbGU=");
  await pending;
  expect(image.src).toBe("https://example.org/image.png");
  expect(document.querySelector("source")).toBe(replacement);
  expect(replacement.srcset).toBe("new-reader-page.png 2x");
  expect(document.querySelector("[data-yaku-image]")).toBeNull();
  images.dispose();
});
