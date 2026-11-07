import { copy } from "../../shared/i18n";

export class GlossaryCsvError extends Error {}

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  function finishField() {
    row.push(field);
    field = "";
    closed = false;
  }
  function finishRow() {
    finishField();
    if (row.length > 1 || row.some((value) => value.trim())) rows.push(row);
    row = [];
  }
  for (let index = 0; index < source.length; index++) {
    const character = source[index]!;
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += character;
      continue;
    }
    if (character === ",") {
      finishField();
      continue;
    }
    if (character === "\n") {
      finishRow();
      continue;
    }
    if (closed) throw new GlossaryCsvError(copy.glossaryCsvQuote);
    if (character === '"') {
      if (field) throw new GlossaryCsvError(copy.glossaryCsvQuote);
      quoted = true;
    } else field += character;
  }
  if (quoted) throw new GlossaryCsvError(copy.glossaryCsvQuote);
  if (field || row.length || closed) finishRow();
  return rows;
}

export function importGlossaryCsv(
  text: string,
  current: Record<string, string>,
): Record<string, string> {
  const rows = csvRows(text);
  const header = rows.shift()?.map((value) => value.trim().toLowerCase());
  if (
    header?.length !== 2 ||
    header[0] !== "source" ||
    header[1] !== "translation"
  )
    throw new GlossaryCsvError(copy.glossaryCsvHeader);
  if (!rows.length) throw new GlossaryCsvError(copy.glossaryCsvEmpty);
  const entries = new Map<string, string>();
  for (const row of rows) {
    if (row.length !== 2 || !row[0]?.trim() || !row[1]?.trim())
      throw new GlossaryCsvError(copy.glossaryCsvColumns);
    const source = row[0].trim();
    const target = row[1].trim();
    if (entries.has(source) && entries.get(source) !== target)
      throw new GlossaryCsvError(`${copy.glossaryCsvDuplicate}: ${source}`);
    entries.set(source, target);
  }
  if (
    [...entries].every(
      ([source, target]) =>
        Object.hasOwn(current, source) && current[source] === target,
    )
  )
    return current;
  return Object.fromEntries([...Object.entries(current), ...entries]);
}

export function exportGlossaryCsv(glossary: Record<string, string>): string {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return (
    "\uFEFFsource,translation\r\n" +
    Object.entries(glossary)
      .map(([source, target]) => `${quote(source)},${quote(target)}`)
      .join("\r\n") +
    (Object.keys(glossary).length ? "\r\n" : "")
  );
}
