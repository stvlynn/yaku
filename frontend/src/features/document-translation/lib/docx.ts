import { strFromU8 } from "fflate";
import { copy } from "../../../shared/i18n";
import type { Segment } from "../model/types";
import { parseXml } from "./xml";

const wordNamespaces = new Set([
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  "http://purl.oclc.org/ooxml/wordprocessingml/main",
]);
const relationshipNamespace =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const contentTypeNamespace =
  "http://schemas.openxmlformats.org/package/2006/content-types";
const relationshipPrefixes = [
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/",
  "http://purl.oclc.org/ooxml/officeDocument/relationships/",
];
const contentTypePrefix =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.";
const storyTypes = {
  officeDocument: {
    root: "document",
    content: `${contentTypePrefix}document.main+xml`,
  },
  header: { root: "hdr", content: `${contentTypePrefix}header+xml` },
  footer: { root: "ftr", content: `${contentTypePrefix}footer+xml` },
  footnotes: {
    root: "footnotes",
    content: `${contentTypePrefix}footnotes+xml`,
  },
  endnotes: { root: "endnotes", content: `${contentTypePrefix}endnotes+xml` },
  comments: { root: "comments", content: `${contentTypePrefix}comments+xml` },
} as const;
type Story = keyof typeof storyTypes;
function invalid(): never {
  throw new Error(copy.documentInvalidArchive);
}

/** Resolve an internal OPC part URI without allowing traversal above the package root. */
function partTarget(source: string, target: string): string {
  if (
    !target ||
    /[\\?#\u0000-\u001f]/.test(target) ||
    /%2f|%5c/i.test(target) ||
    /^[a-z][a-z\d+.-]*:/i.test(target) ||
    target.startsWith("//")
  )
    invalid();
  let decoded: string;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    return invalid();
  }
  const parts = target.startsWith("/") ? [] : source.split("/").slice(0, -1);
  for (const segment of decoded.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!parts.length) invalid();
      parts.pop();
    } else {
      if (/[\\\u0000-\u001f]/.test(segment)) invalid();
      parts.push(segment);
    }
  }
  if (!parts.length || decoded.endsWith("/")) invalid();
  return parts.join("/");
}
function xmlFile(files: Record<string, Uint8Array>, path: string): Document {
  const bytes = files[path];
  if (!bytes) return invalid();
  return parseXml(strFromU8(bytes));
}
interface PartRelationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}
function relationships(
  files: Record<string, Uint8Array>,
  source: string,
  required: boolean,
): PartRelationship[] {
  const slash = source.lastIndexOf("/");
  const path = source
    ? `${source.slice(0, slash + 1)}_rels/${source.slice(slash + 1)}.rels`
    : "_rels/.rels";
  if (!files[path] && !required) return [];
  const root = xmlFile(files, path).documentElement;
  if (
    root.localName !== "Relationships" ||
    root.namespaceURI !== relationshipNamespace
  )
    invalid();
  const ids = new Set<string>();
  return [...root.children].map((element) => {
    const id = element.getAttribute("Id");
    const type = element.getAttribute("Type");
    const target = element.getAttribute("Target");
    const mode = element.getAttribute("TargetMode");
    if (
      element.localName !== "Relationship" ||
      element.namespaceURI !== relationshipNamespace ||
      !id ||
      !type ||
      !target ||
      ids.has(id) ||
      (mode !== null && mode !== "Internal" && mode !== "External")
    )
      return invalid();
    ids.add(id);
    return { id, type, target, external: mode === "External" };
  });
}
function storyType(type: string): Story | undefined {
  for (const prefix of relationshipPrefixes)
    if (type.startsWith(prefix)) {
      const name = type.slice(prefix.length);
      if (Object.hasOwn(storyTypes, name)) return name as Story;
    }
  return undefined;
}

export function readWordParts(
  files: Record<string, Uint8Array>,
): Map<string, Document> {
  const types = xmlFile(files, "[Content_Types].xml").documentElement;
  if (
    types.localName !== "Types" ||
    types.namespaceURI !== contentTypeNamespace
  )
    invalid();
  const overrides = new Map<string, string>();
  const defaults = new Map<string, string>();
  for (const element of types.children) {
    if (element.namespaceURI !== contentTypeNamespace) invalid();
    const content = element.getAttribute("ContentType");
    if (!content) invalid();
    if (element.localName === "Override") {
      const part = element.getAttribute("PartName");
      if (!part?.startsWith("/")) invalid();
      const path = partTarget("", part);
      if (overrides.has(path)) invalid();
      overrides.set(path, content);
    } else if (element.localName === "Default") {
      const extension = element.getAttribute("Extension")?.toLowerCase();
      if (!extension || defaults.has(extension)) invalid();
      defaults.set(extension, content);
    } else invalid();
  }
  const main = relationships(files, "", true).filter(
    (item) => storyType(item.type) === "officeDocument",
  );
  if (main.length !== 1 || main[0]!.external) invalid();
  const mainPath = partTarget("", main[0]!.target);
  const result = new Map<string, Document>();
  function read(path: string, type: Story) {
    const spec = storyTypes[type];
    const content =
      overrides.get(path) ??
      defaults.get(path.split(".").at(-1)!.toLowerCase());
    if (content !== spec.content) invalid();
    const document = result.get(path) ?? xmlFile(files, path);
    if (
      !wordNamespaces.has(document.documentElement.namespaceURI ?? "") ||
      document.documentElement.localName !== spec.root
    )
      invalid();
    result.set(path, document);
  }
  read(mainPath, "officeDocument");
  for (const item of relationships(files, mainPath, false)) {
    const type = storyType(item.type);
    if (type && type !== "officeDocument" && !item.external)
      read(partTarget(mainPath, item.target), type);
  }
  return result;
}

function paragraphTexts(paragraph: Element, wordNamespace: string): Element[] {
  return [...paragraph.getElementsByTagNameNS(wordNamespace, "t")].filter(
    (text) => {
      let parent = text.parentElement;
      while (
        parent &&
        !(parent.namespaceURI === wordNamespace && parent.localName === "p")
      )
        parent = parent.parentElement;
      return parent === paragraph;
    },
  );
}
export function wordSegments(document: Document): Segment[] {
  const segments: Segment[] = [];
  const wordNamespace = document.documentElement.namespaceURI!;
  const xmlNamespace = "http://www.w3.org/XML/1998/namespace";
  for (const paragraph of document.getElementsByTagNameNS(wordNamespace, "p")) {
    const texts = paragraphTexts(paragraph, wordNamespace);
    const values = texts.map((text) => text.textContent ?? "");
    const source = values.join("");
    if (!source.trim()) continue;
    let added: Element | undefined;
    segments.push({
      source,
      write: (value, bilingual) => {
        added?.remove();
        texts.forEach((text, index) => {
          text.textContent = values[index]!;
        });
        const destination = bilingual
          ? (paragraph.cloneNode(true) as Element)
          : paragraph;
        if (bilingual) {
          // Duplicating identifiers or drawings would corrupt references and repeat non-text content.
          for (const node of [
            destination,
            ...destination.querySelectorAll("*"),
          ]) {
            if (
              node.namespaceURI === wordNamespace &&
              [
                "bookmarkStart",
                "bookmarkEnd",
                "drawing",
                "pict",
                "object",
                "commentRangeStart",
                "commentRangeEnd",
                "commentReference",
                "footnoteReference",
                "endnoteReference",
                "footnoteRef",
                "endnoteRef",
              ].includes(node.localName)
            )
              node.remove();
            for (const attribute of [...node.attributes])
              if (
                attribute.localName === "paraId" ||
                attribute.localName === "textId"
              )
                node.removeAttributeNode(attribute);
          }
          paragraph.after(destination);
          added = destination;
        }
        const targetTexts = bilingual
          ? paragraphTexts(destination, wordNamespace)
          : texts;
        const characters = Array.from(value);
        let consumed = 0;
        let weight = 0;
        targetTexts.forEach((text, index) => {
          weight += Array.from(values[index] ?? "").length;
          let end =
            index === targetTexts.length - 1
              ? characters.length
              : Math.round(
                  (characters.length * weight) /
                    Math.max(1, Array.from(source).length),
                );
          // Preserve target words where spaces exist. Run styles survive, but semantic alignment is approximate.
          if (
            end > consumed &&
            end < characters.length &&
            /\S/.test(characters[end - 1]!) &&
            /\S/.test(characters[end]!)
          ) {
            const nextSpace = characters.findIndex(
              (character, i) => i >= end && /\s/.test(character),
            );
            if (nextSpace >= 0) end = nextSpace + 1;
          }
          end = Math.max(consumed, end);
          text.textContent = characters.slice(consumed, end).join("");
          text.setAttributeNS(xmlNamespace, "xml:space", "preserve");
          consumed = end;
        });
      },
    });
  }
  return segments;
}
