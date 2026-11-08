import { strFromU8, strToU8, unzip, zip, type AsyncZippable } from "fflate";
import { readWordParts, wordSegments } from "./docx";
import { prepareMarkup } from "./markup";
import { decodeXmlBytes } from "./encoding";
import { parseXml } from "./xml";
import { copy } from "../../../shared/i18n";
import type { PreparedDocument, Segment } from "../model/types";

const dcNamespace = "http://purl.org/dc/elements/1.1/";
const xmlNamespace = "http://www.w3.org/XML/1998/namespace";
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
  const markupDocuments = new Map<string, ReturnType<typeof prepareMarkup>>();
  const currentDocument = (path: string) =>
    markupDocuments.get(path)?.current() ?? documents.get(path)!;
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
    const container = parseXml(decodeXmlBytes(files["META-INF/container.xml"]));
    const packagePath = container
      .getElementsByTagNameNS("*", "rootfile")[0]
      ?.getAttribute("full-path");
    if (!packagePath || !files[packagePath])
      throw new Error(copy.documentInvalidEpub);
    packageDocument = parseXml(decodeXmlBytes(files[packagePath]));
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
  if (extension === "docx") {
    for (const [path, document] of readWordParts(files)) {
      documents.set(path, document);
      segments.push(...wordSegments(document));
    }
  } else {
    for (const path of contentPaths) {
      const document = parseXml(decodeXmlBytes(files[path]!));
      documents.set(path, document);
      const markup = prepareMarkup(document, `https://epub.invalid/${path}`);
      markupDocuments.set(path, markup);
      segments.push(...markup.segments);
    }
  }
  return {
    name,
    segments,
    preview: () =>
      [...documents.keys()]
        .map(currentDocument)
        .map((document) => document.documentElement.textContent ?? "")
        .join("\n"),
    translationPreview:
      extension === "epub"
        ? () =>
            [...markupDocuments.values()]
              .map((markup) => markup.translationPreview())
              .filter(Boolean)
              .join("\n\n")
        : undefined,
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
          const markup = markupDocuments.get(path)!;
          markup.setLanguage(language);
          const root = markup.current().documentElement;
          if (!bilingual) {
            root.setAttribute("lang", language);
            root.setAttributeNS(xmlNamespace, "xml:lang", language);
            root.setAttribute("dir", "auto");
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
        const document = documents.has(path)
          ? currentDocument(path)
          : undefined;
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
