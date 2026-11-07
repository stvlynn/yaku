import { fromMarkdown } from "mdast-util-from-markdown";
import { rangeDocument, type PreparedDocument } from "../model/types";

/** Replace only source-position text leaves; parser syntax, code, URLs and reference definitions stay byte-for-byte intact. */
export function markdownDocument(
  name: string,
  source: string,
): PreparedDocument {
  const tree = fromMarkdown(source);
  const ranges: {
    start: number;
    end: number;
    encode: (text: string) => string;
    separator: string;
  }[] = [];
  function visit(
    node: {
      type: string;
      value?: string;
      position?: { start: { offset?: number }; end: { offset?: number } };
      children?: unknown[];
    },
    protectedNode = false,
  ) {
    const skip =
      protectedNode ||
      [
        "code",
        "inlineCode",
        "html",
        "definition",
        "image",
        "imageReference",
        "link",
        "linkReference",
      ].includes(node.type);
    if (node.type === "text" && !skip) {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) {
        const raw = source.slice(start, end);
        // Bare URLs are text in CommonMark; do not send them to the translation model.
        let cursor = 0;
        for (const match of raw.matchAll(
          /(?:https?:\/\/|mailto:|www\.)[^\s<>]+/g,
        )) {
          if (match.index > cursor)
            ranges.push({
              start: start + cursor,
              end: start + match.index,
              encode,
              separator: " / ",
            });
          cursor = match.index + match[0].length;
        }
        if (cursor < raw.length)
          ranges.push({ start: start + cursor, end, encode, separator: " / " });
      }
    }
    for (const child of node.children ?? [])
      visit(child as Parameters<typeof visit>[0], skip);
  }
  function encode(text: string) {
    return text
      .replace(/\r?\n/g, " ")
      .replace(/[\\`*_{}\[\]<>#+.!|~-]/g, "\\$&");
  }
  visit(tree);
  return rangeDocument(name, source, ranges, "text/markdown;charset=utf-8");
}
