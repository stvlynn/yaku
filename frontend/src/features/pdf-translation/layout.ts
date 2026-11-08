import { copy } from "../../shared/i18n";
import { wrapText } from "../../shared/text-layout";

export interface TextLine {
  text: string;
  y: number;
  direction: "ltr" | "rtl";
}
export interface TextPage {
  lines: TextLine[];
}
export interface TextLayoutOptions {
  width: number;
  height: number;
  lineHeight: number;
  paragraphGap: number;
  language: string;
  measure: (text: string) => number;
}

export function wrapParagraph(
  text: string,
  width: number,
  language: string,
  measure: (text: string) => number,
): string[] {
  if (!Number.isFinite(width) || width <= 0)
    throw new Error(copy.pdfLayoutInvalid);
  const lines = wrapText(text, { width, language, measure });
  if (lines.some((line) => measure(line) > width))
    throw new Error(copy.pdfTextTooWide);
  return lines;
}

export function paginateParagraphs(
  paragraphs: readonly string[],
  options: TextLayoutOptions,
): TextPage[] {
  if (
    !(options.height >= options.lineHeight) ||
    !(options.lineHeight > 0) ||
    !(options.paragraphGap >= 0)
  )
    throw new Error(copy.pdfLayoutInvalid);
  const pages: TextPage[] = [{ lines: [] }];
  let y = 0;
  for (const paragraph of paragraphs) {
    for (const text of wrapParagraph(
      paragraph,
      options.width,
      options.language,
      options.measure,
    )) {
      const firstLetter = text.match(/\p{Letter}/u)?.[0] ?? "";
      const direction = /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(
        firstLetter,
      )
        ? "rtl"
        : "ltr";
      if (y + options.lineHeight > options.height) {
        pages.push({ lines: [] });
        y = 0;
      }
      pages.at(-1)!.lines.push({ text, y, direction });
      y += options.lineHeight;
    }
    y += options.paragraphGap;
  }
  return pages;
}
