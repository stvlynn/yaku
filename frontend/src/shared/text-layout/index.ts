export interface WrapTextOptions {
  width: number;
  measure: (text: string) => number;
  language?: string;
}

/** Preserve unfit graphemes on their own line so renderers can reject or resize explicitly. */
export function wrapText(
  text: string,
  { width, measure, language }: WrapTextOptions,
): string[] {
  if (!Number.isFinite(width) || width <= 0)
    throw new RangeError("INVALID_TEXT_WIDTH");
  const words = new Intl.Segmenter(language, { granularity: "word" });
  const graphemes = new Intl.Segmenter(language, { granularity: "grapheme" });
  const lines: string[] = [];
  for (const sourceLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const { segment } of words.segment(sourceLine)) {
      if (line && measure(line + segment) > width) {
        lines.push(line.trimEnd());
        line = "";
      }
      if (!line && !segment.trim()) continue;
      if (measure(segment) <= width) {
        line += segment;
        continue;
      }
      for (const { segment: character } of graphemes.segment(segment)) {
        if (line && measure(line + character) > width) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
