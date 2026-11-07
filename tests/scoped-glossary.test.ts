import { describe, expect, it } from "vitest";
import {
  createDefaultSettings,
  resolveGlossary,
  validGlossaryUrlPattern,
  type GlossaryCollection,
} from "../frontend/src/entities/settings";
import { validateSettings } from "../frontend/src/features/preferences";
const library = (
  id: string,
  term: string,
  extra: Partial<GlossaryCollection> = {},
): GlossaryCollection => ({
  id,
  name: id,
  targetLanguage: "",
  urlPatterns: [],
  terms: { term },
  ...extra,
});
describe("scoped glossary entity", () => {
  it("uses actual URLPattern syntax without treating an absent URL as a matching page", () => {
    expect(typeof URLPattern).toBe("function");
    for (const pattern of [
      "https://example.com/*",
      "https://*.example.com/docs/*",
      "https://example.com/:article",
      "file:///tmp/*",
    ])
      expect(validGlossaryUrlPattern(pattern)).toBe(true);
    for (const pattern of [
      "example.com/*",
      "javascript:alert(1)",
      "https://[broken",
    ])
      expect(validGlossaryUrlPattern(pattern)).toBe(false);
    const settings = {
      ...createDefaultSettings(),
      glossary: { term: "global" },
      glossaries: [
        library("url", "scoped", {
          urlPatterns: ["https://*.example.com/docs/*"],
        }),
      ],
    };
    expect(resolveGlossary(settings, { targetLanguage: "zh" })).toEqual({
      term: "global",
    });
    expect(
      resolveGlossary(settings, {
        targetLanguage: "zh",
        url: "https://sub.example.com/docs/read?q=1#part",
      }),
    ).toEqual({ term: "scoped" });
    expect(
      resolveGlossary(settings, {
        targetLanguage: "zh",
        url: "https://example.com/docs/read",
      }),
    ).toEqual({ term: "global" });
  });
  it("prioritizes URL and language specificity, then later matching collections", () => {
    const settings = {
      ...createDefaultSettings(),
      glossary: { term: "legacy", retained: "base" },
      glossaries: [
        library("global", "named"),
        library("language", "language", { targetLanguage: "zh" }),
        library("url", "url", { urlPatterns: ["https://example.com/*"] }),
        library("both", "both", {
          targetLanguage: "zh",
          urlPatterns: ["https://example.com/*"],
        }),
        library("later", "later", {
          targetLanguage: "zh",
          urlPatterns: ["https://example.com/*"],
        }),
      ],
    };
    expect(
      resolveGlossary(settings, {
        targetLanguage: "zh",
        url: "https://example.com/read",
      }),
    ).toEqual({ term: "later", retained: "base" });
    expect(
      resolveGlossary(settings, {
        targetLanguage: "en",
        url: "https://example.com/read",
      }).term,
    ).toBe("url");
    expect(
      resolveGlossary(settings, { targetLanguage: "zh", url: "" }).term,
    ).toBe("language");
    expect(resolveGlossary(settings, { targetLanguage: "en" }).term).toBe(
      "named",
    );
  });
  it("rejects invalid scopes and duplicate collection identities at settings boundaries", () => {
    const settings = createDefaultSettings();
    for (const glossaries of [
      [library("one", "term", { urlPatterns: ["bad pattern"] })],
      [library("one", "term", { targetLanguage: "unknown" })],
      [library("one", "term"), library("one", "other")],
    ])
      expect(() => validateSettings({ ...settings, glossaries })).toThrow();
  });
});
