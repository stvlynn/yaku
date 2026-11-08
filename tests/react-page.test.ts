// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPageTranslator } from "../frontend/src/features/page-translation";
import { defaultSettings } from "../frontend/src/entities/settings";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("React-owned source text", () => {
  it.each([
    { mode: "bilingual" as const, position: "before" as const },
    { mode: "bilingual" as const, position: "after" as const },
    { mode: "translation" as const, position: "before" as const },
    { mode: "translation" as const, position: "after" as const },
  ])(
    "keeps conditional Text parentage intact in $mode/$position mode",
    async ({ mode, position }) => {
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      const host = document.createElement("div");
      document.body.append(host);
      const errors: unknown[] = [];
      const root = createRoot(host, {
        onUncaughtError: (error) => errors.push(error),
      });
      const view = (show: boolean) =>
        createElement(
          "main",
          null,
          createElement(
            "p",
            null,
            show ? "Hello " : null,
            createElement("strong", null, "world"),
          ),
        );
      await act(async () => root.render(view(true)));
      const paragraph = host.querySelector("p")!;
      const text = paragraph.firstChild!;
      const strong = paragraph.querySelector("strong")!;
      const controller = createPageTranslator({
        document,
        getSettings: () => ({
          ...defaultSettings,
          mode,
          translationPosition: position,
        }),
        translate: async (request) => ({
          id: request.id,
          text: `Translated ${request.text}`,
          elapsedMs: 0,
        }),
      });
      try {
        controller.setEditing(true);
        await act(async () => controller.translatePage({ wholePage: true }));
        expect(text.parentNode).toBe(paragraph);
        await act(async () => root.render(view(false)));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(errors).toEqual([]);
        expect(strong.textContent).toBe(mode === "translation" ? "" : "world");
        await act(async () => root.render(view(true)));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(errors).toEqual([]);
        controller.restore();
        expect(host.querySelector("p")?.textContent).toBe("Hello world");
      } finally {
        controller.restore();
        await act(async () => root.unmount());
        controller.dispose();
      }
    },
  );
});
