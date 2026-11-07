import { describe, expect, it } from "vitest";
import {
  paginateParagraphs,
  wrapParagraph,
} from "../frontend/src/features/pdf-translation/layout";

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
const measure = (text: string) =>
  Array.from(graphemes.segment(text)).length * 6;
describe("PDF reading pagination", () => {
  it("retains Unicode characters while wrapping words, CJK, RTL and long unbroken tokens", () => {
    for (const text of [
      "A sentence with several words and https://example.com/long-long-long-path",
      "你好，世界。这是一段用于检查换行的中文。",
      "مرحبا بالعالم هذه فقرة عربية طويلة",
      "क्षेत्र में आपका स्वागत है",
      "👩🏽‍💻👩🏽‍💻👩🏽‍💻 ééé",
    ]) {
      const lines = wrapParagraph(text, 60, "en", measure);
      expect(lines.every((line) => measure(line) <= 60)).toBe(true);
      expect(lines.join("").replace(/\s/gu, "")).toBe(text.replace(/\s/gu, ""));
      for (const line of lines) expect(line).not.toMatch(/^[\p{Mark}\u200d]/u);
    }
  });
  it("paginates all long-paragraph lines with bounded geometry and correct RTL direction", () => {
    const paragraphs = ["世界".repeat(2500), "مرحبا بالعالم ".repeat(300)];
    const pages = paginateParagraphs(paragraphs, {
      width: 120,
      height: 100,
      lineHeight: 20,
      paragraphGap: 10,
      language: "zh",
      measure,
    });
    expect(pages.length).toBeGreaterThan(10);
    const lines = pages.flatMap((page) => page.lines);
    expect(
      lines
        .map((line) => line.text)
        .join("")
        .replace(/\s/gu, ""),
    ).toBe(paragraphs.join("").replace(/\s/gu, ""));
    expect(
      lines.every(
        (line) =>
          line.y >= 0 && line.y + 20 <= 100 && measure(line.text) <= 120,
      ),
    ).toBe(true);
    expect(lines.some((line) => line.direction === "rtl")).toBe(true);
    expect(pages.every((page) => page.lines.length > 0)).toBe(true);
  });
  it("fits exact page boundaries and preserves explicit blank lines", () => {
    const pages = paginateParagraphs(["one\n\nthree"], {
      width: 60,
      height: 40,
      lineHeight: 20,
      paragraphGap: 0,
      language: "en",
      measure,
    });
    expect(pages.map((page) => page.lines.map((line) => line.text))).toEqual([
      ["one", ""],
      ["three"],
    ]);
  });
  it("rejects impossible geometry rather than clipping or shrinking below a legible size", () => {
    expect(() => wrapParagraph("W", 2, "en", measure)).toThrow();
    expect(() =>
      paginateParagraphs(["text"], {
        width: 60,
        height: 10,
        lineHeight: 20,
        paragraphGap: 0,
        language: "en",
        measure,
      }),
    ).toThrow();
  });
});
