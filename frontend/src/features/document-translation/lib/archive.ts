import { strFromU8, strToU8, unzip, zip, type AsyncZippable } from "fflate";
import { copy } from "../../../shared/i18n";
import type { PreparedDocument, Segment } from "../model/types";

const wordNamespace =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const dcNamespace = "http://purl.org/dc/elements/1.1/";
const xmlNamespace = "http://www.w3.org/XML/1998/namespace";
const parser = () => new DOMParser();
export function parseXml(source: string): Document {
  const document = parser().parseFromString(source, "application/xml");
  if (document.getElementsByTagName("parsererror").length)
    throw new Error(copy.documentInvalidXml);
  return document;
}

export function xmlTextSegments(document: Document): Segment[] {
  const segments: Segment[] = [];
  const walker = document.createTreeWalker(
    document.documentElement,
    NodeFilter.SHOW_TEXT,
  );
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (
      !node.data.trim() ||
      node.parentElement?.closest(
        'head,script,style,code,pre,noscript,svg,math,[translate="no"]',
      )
    )
      continue;
    const source = node.data;
    segments.push({
      source,
      write: (value, bilingual) => {
        const translated = `${source.match(/^\s*/)?.[0] ?? ""}${value.trim()}${source.match(/\s*$/)?.[0] ?? ""}`;
        node.data = bilingual ? `${source}\n${translated}` : translated;
      },
    });
  }
  return segments;
}

function wordSegments(document: Document): Segment[] {
  const segments: Segment[] = [];
  for (const paragraph of document.getElementsByTagNameNS(wordNamespace, "p")) {
    const texts = [
      ...paragraph.getElementsByTagNameNS(wordNamespace, "t"),
    ].filter((text) => {
      let parent = text.parentElement;
      while (
        parent &&
        !(parent.namespaceURI === wordNamespace && parent.localName === "p")
      )
        parent = parent.parentElement;
      return parent === paragraph;
    });
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
              [
                "bookmarkStart",
                "bookmarkEnd",
                "drawing",
                "pict",
                "object",
                "commentRangeStart",
                "commentRangeEnd",
                "commentReference",
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
          ? [...destination.getElementsByTagNameNS(wordNamespace, "t")]
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

export async function archiveDocument(
  name: string,
  bytes: Uint8Array,
  extension: "epub" | "docx",
): Promise<PreparedDocument> {
  const files = await new Promise<Record<string, Uint8Array>>(
    (resolve, reject) =>
      unzip(bytes, (error, value) =>
        error
          ? reject(new Error(copy.documentInvalidArchive, { cause: error }))
          : resolve(value),
      ),
  );
  const documents = new Map<string, Document>();
  const segments: Segment[] = [];
  let packageDocument: Document | undefined;
  const contentPaths = new Set<string>();
  if (extension === "epub") {
    if (files["META-INF/encryption.xml"])
      throw new Error(copy.documentEncryptedEpub);
    if (
      !files.mimetype ||
      strFromU8(files.mimetype) !== "application/epub+zip" ||
      !files["META-INF/container.xml"]
    )
      throw new Error(copy.documentInvalidEpub);
    const container = parseXml(strFromU8(files["META-INF/container.xml"]));
    const packagePath = container
      .getElementsByTagNameNS("*", "rootfile")[0]
      ?.getAttribute("full-path");
    if (!packagePath || !files[packagePath])
      throw new Error(copy.documentInvalidEpub);
    packageDocument = parseXml(strFromU8(files[packagePath]));
    documents.set(packagePath, packageDocument);
    for (const item of packageDocument.getElementsByTagNameNS("*", "item")) {
      if (item.getAttribute("media-type") !== "application/xhtml+xml") continue;
      const href = item.getAttribute("href");
      if (!href) continue;
      const url = new URL(href, `https://epub.invalid/${packagePath}`);
      if (url.origin !== "https://epub.invalid")
        throw new Error(copy.documentInvalidEpub);
      const path = decodeURIComponent(url.pathname.slice(1));
      if (!files[path]) throw new Error(copy.documentInvalidEpub);
      contentPaths.add(path);
    }
    if (!contentPaths.size) throw new Error(copy.documentInvalidEpub);
  }
  for (const [path, data] of Object.entries(files)) {
    const selected =
      extension === "epub"
        ? contentPaths.has(path)
        : /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(
            path,
          );
    if (!selected) continue;
    const document = parseXml(strFromU8(data));
    documents.set(path, document);
    segments.push(
      ...(extension === "docx"
        ? wordSegments(document)
        : xmlTextSegments(document)),
    );
  }
  if (extension === "docx" && !documents.has("word/document.xml"))
    throw new Error(copy.documentInvalidArchive);
  return {
    name,
    segments,
    preview: () =>
      [...documents.values()]
        .map((document) => document.documentElement.textContent ?? "")
        .join("\n"),
    setLanguage(language, bilingual) {
      if (packageDocument) {
        const metadata = packageDocument.getElementsByTagNameNS(
          "*",
          "metadata",
        )[0];
        if (!metadata) throw new Error(copy.documentInvalidEpub);
        const languages = [
          ...metadata.getElementsByTagNameNS(dcNamespace, "language"),
        ];
        if (!bilingual) languages.forEach((item) => item.remove());
        if (
          !bilingual ||
          !languages.some((item) => item.textContent === language)
        ) {
          const item = packageDocument.createElementNS(
            dcNamespace,
            "dc:language",
          );
          item.textContent = language;
          metadata.append(item);
        }
        const modified = [...metadata.getElementsByTagNameNS("*", "meta")].find(
          (item) => item.getAttribute("property") === "dcterms:modified",
        );
        if (modified)
          modified.textContent = new Date()
            .toISOString()
            .replace(/\.\d{3}Z$/, "Z");
        for (const path of contentPaths) {
          const root = documents.get(path)!.documentElement;
          if (!bilingual) {
            root.setAttribute("lang", language);
            root.setAttributeNS(xmlNamespace, "xml:lang", language);
          }
        }
      }
    },
    export: async () => {
      const output: AsyncZippable = Object.create(null) as AsyncZippable;
      // OCF requires this first ZIP local entry, uncompressed and without extra fields.
      if (extension === "epub")
        output.mimetype = [strToU8("application/epub+zip"), { level: 0 }];
      for (const [path, data] of Object.entries(files)) {
        if (extension === "epub" && path === "mimetype") continue;
        const document = documents.get(path);
        output[path] = document
          ? strToU8(new XMLSerializer().serializeToString(document))
          : data;
      }
      const zipped = await new Promise<Uint8Array>((resolve, reject) =>
        zip(output, (error, value) => (error ? reject(error) : resolve(value))),
      );
      return new Blob([new Uint8Array(zipped)], {
        type:
          extension === "epub"
            ? "application/epub+zip"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    },
  };
}
