import { copy } from "../../../shared/i18n";
import { rangeDocument, type PreparedDocument } from "../model/types";

type Range = {
  start: number;
  end: number;
  encode?: (text: string) => string;
  separator?: string;
};
const cueEscape = (text: string) =>
  text
    .replace(/\r?\n/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const assEscape = (text: string) =>
  text
    .replace(/\r?\n/g, " ")
    .replace(/\\/g, "＼")
    .replace(/{/g, "｛")
    .replace(/}/g, "｝");

export function subtitleDocument(
  name: string,
  source: string,
  extension: string,
): PreparedDocument {
  const ranges: Range[] = [];
  const lines = [...source.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)].filter(
    (match) => match[0],
  );
  let payload = false;
  let metadata = false;
  let assEvents = false;
  let fields: string[] = [];
  function add(start: number, value: string, ass = false, lrc = false) {
    // Tokenize protected markup, inline timestamps, override tags and ASS control sequences.
    const protectedTokens = ass
      ? /\{[^}]*\}|\\[Nnh]/g
      : /<[^>]*>|&(?:#\d+|#x[\da-f]+|[a-z]+);/gi;
    let cursor = 0;
    const encode = ass
      ? assEscape
      : lrc
        ? (text: string) =>
            text
              .replace(/[\r\n]/g, " ")
              .replace(/\[/g, "［")
              .replace(/\]/g, "］")
        : cueEscape;
    const separator = ass ? "\\N" : lrc ? " / " : "\n";
    let drawing = false;
    for (const token of value.matchAll(protectedTokens)) {
      if (token.index > cursor && !drawing)
        ranges.push({
          start: start + cursor,
          end: start + token.index,
          encode,
          separator,
        });
      if (ass) {
        for (const mode of token[0].matchAll(/\\p(\d+)/g))
          drawing = Number(mode[1]) > 0;
      }
      cursor = token.index + token[0].length;
    }
    if (cursor < value.length && !drawing)
      ranges.push({
        start: start + cursor,
        end: start + value.length,
        encode,
        separator,
      });
  }
  for (const lineMatch of lines) {
    const line = lineMatch[0].replace(/[\r\n]+$/, "");
    const start = lineMatch.index;
    if (extension === "ass") {
      if (/^\s*\[/.test(line)) {
        assEvents = /^\s*\[events\]\s*$/i.test(line);
        continue;
      }
      if (!assEvents) continue;
      if (/^Format:/i.test(line)) {
        fields = line
          .slice(7)
          .split(",")
          .map((field) => field.trim().toLowerCase());
        continue;
      }
      if (!/^Dialogue:/i.test(line)) continue;
      const textIndex = fields.indexOf("text");
      if (textIndex < 0 || textIndex !== fields.length - 1)
        throw new Error(copy.documentInvalidAss);
      let offset = line.indexOf(":") + 1;
      for (let field = 0; field < textIndex; field++) {
        const comma = line.indexOf(",", offset);
        if (comma < 0) throw new Error(copy.documentInvalidAss);
        offset = comma + 1;
      }
      add(start + offset, line.slice(offset), true);
      continue;
    }
    if (extension === "lrc") {
      const match = line.match(/^((?:\[\d+:\d+(?:\.\d+)?\])+)(.*)$/);
      if (match) add(start + match[1]!.length, match[2]!, false, true);
      continue;
    }
    if (!line.trim()) {
      payload = false;
      metadata = false;
      continue;
    }
    if (
      extension === "vtt" &&
      !payload &&
      /^(WEBVTT(?:\s|$)|NOTE(?:\s|$)|STYLE\s*$|REGION\s*$)/.test(line)
    ) {
      metadata = true;
      continue;
    }
    if (metadata) continue;
    if (/^\s*(?:\d+:)?\d{2}:\d{2}[.,]\d{3}\s+-->/.test(line)) {
      payload = true;
      continue;
    }
    if (payload) add(start, line);
  }
  return rangeDocument(
    name,
    source,
    ranges,
    extension === "vtt" ? "text/vtt;charset=utf-8" : "text/plain;charset=utf-8",
  );
}
