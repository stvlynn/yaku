import { createInlineCodec } from "../../../shared/translation-markup";
import type { Segment } from "../model/types";

const htmlNamespace = "http://www.w3.org/1999/xhtml";
const xmlNamespace = "http://www.w3.org/XML/1998/namespace";
const blockTags = new Set(
  "body main article section aside nav header footer div p h1 h2 h3 h4 h5 h6 li dt dd td th caption blockquote figcaption summary address".split(
    " ",
  ),
);
const protectedTags = new Set(
  "head script style pre code kbd samp noscript template textarea input select iframe object embed math svg audio video picture".split(
    " ",
  ),
);
interface Paragraph {
  block: Element;
  codec: ReturnType<typeof createInlineCodec>;
  languageElements: Element[];
}
function inheritedAttribute(
  element: Element,
  attribute: "lang" | "dir",
): string | undefined {
  for (
    let ancestor: Element | null = element;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    const value =
      attribute === "lang"
        ? (ancestor.getAttributeNS(xmlNamespace, "lang") ??
          ancestor.getAttribute("xml:lang") ??
          ancestor.getAttribute("lang"))
        : ancestor.getAttribute("dir");
    if (
      value !== null &&
      (attribute === "lang" ||
        ["ltr", "rtl", "auto"].includes(value.toLowerCase()))
    )
      return value;
  }
}
function markTargetLanguage(
  element: Element,
  language: string,
  force: boolean,
) {
  if (force || element.hasAttribute("lang"))
    element.setAttribute("lang", language);
  if (
    (force && element.ownerDocument.contentType !== "text/html") ||
    element.hasAttributeNS(xmlNamespace, "lang")
  )
    element.setAttributeNS(xmlNamespace, "xml:lang", language);
  else if (element.hasAttribute("xml:lang"))
    element.setAttribute("xml:lang", language);
  if (force || element.hasAttribute("dir")) element.setAttribute("dir", "auto");
}

function excluded(element: Element): boolean {
  const style = (element as HTMLElement).style;
  return (
    (element.namespaceURI !== htmlNamespace && element.namespaceURI !== null) ||
    protectedTags.has(element.localName.toLowerCase()) ||
    element.hasAttribute("hidden") ||
    element.getAttribute("aria-hidden") === "true" ||
    style?.display === "none" ||
    style?.visibility === "hidden" ||
    style?.contentVisibility === "hidden" ||
    element.getAttribute("translate")?.toLowerCase() === "no" ||
    element.classList.contains("notranslate")
  );
}
function collectParagraphs(document: Document, baseUrl: string): Paragraph[] {
  const owners = new Map<Element, Text[]>();
  const walker = document.createTreeWalker(
    document.documentElement,
    NodeFilter.SHOW_TEXT,
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (!text.data.trim()) continue;
    let owner: Element | undefined;
    let skip = false;
    for (
      let element = text.parentElement;
      element;
      element = element.parentElement
    ) {
      if (excluded(element)) {
        skip = true;
        break;
      }
      if (!owner && blockTags.has(element.localName.toLowerCase()))
        owner = element;
    }
    if (skip || !owner) continue;
    const values = owners.get(owner);
    if (values) values.push(text);
    else owners.set(owner, [text]);
  }
  return [...owners].map(([block, nodes]) => {
    const languageElements = new Set<Element>([block]);
    for (const text of nodes)
      for (
        let element = text.parentElement;
        element && element !== block;
        element = element.parentElement
      )
        languageElements.add(element);
    return {
      block,
      languageElements: [...languageElements],
      codec: createInlineCodec(document, block, nodes, {
        preserveProtected: true,
        documentPreservation: { baseUrl },
      }),
    };
  });
}

export function normalizeUtf8Metadata(document: Document) {
  let declaresEncoding = false;
  for (const meta of document.getElementsByTagNameNS("*", "meta")) {
    if (meta.hasAttribute("charset")) {
      meta.setAttribute("charset", "utf-8");
      declaresEncoding = true;
    }
    if (meta.getAttribute("http-equiv")?.toLowerCase() === "content-type") {
      meta.setAttribute("content", "text/html; charset=utf-8");
      declaresEncoding = true;
    }
  }
  if (
    document.contentType === "text/html" &&
    !declaresEncoding &&
    document.head
  ) {
    const meta = document.createElement("meta");
    meta.setAttribute("charset", "utf-8");
    document.head.prepend(meta);
  }
}

/** Own a pristine detached tree so repeated writes and mode changes never treat translated markup as source. */
export function prepareMarkup(document: Document, baseUrl: string) {
  normalizeUtf8Metadata(document);
  const pristine = document.cloneNode(true) as Document;
  const makeWorking = (document: Document) => ({
    document,
    paragraphs: collectParagraphs(document, baseUrl),
    wrappers: [] as Element[],
    projections: new Map<number, string>(),
    replaced: new Set<number>(),
    protectedLanguages: [...document.getElementsByTagName("*")]
      .filter(
        (element) =>
          excluded(element) &&
          !element.parentElement?.closest(
            "head,script,style,pre,code,kbd,samp,math,svg,[translate='no'],.notranslate,[hidden],[aria-hidden='true']",
          ),
      )
      .map((element) => ({
        element,
        language: inheritedAttribute(element, "lang"),
        direction: inheritedAttribute(element, "dir"),
      })),
  });
  let working = makeWorking(document);
  const applied = new Map<number, { value: string; bilingual: boolean }>();
  let language: string | undefined;
  function apply(
    state: typeof working,
    index: number,
    value: string,
    bilingual: boolean,
  ) {
    const { block, codec } = state.paragraphs[index]!;
    const projection = codec.decode(value, { mode: "bilingual" });
    const text = projection.textContent ?? "";
    const fragment = bilingual
      ? projection
      : codec.decode(value, { mode: "replace" });
    if (!bilingual) {
      block.replaceChildren(fragment);
      state.projections.set(index, text);
      state.replaced.add(index);
      return;
    }
    const translation = state.document.createElementNS(
      block.namespaceURI,
      "span",
    );
    translation.setAttribute("data-yaku-document-translation", "");
    translation.append(fragment);
    if (language) {
      translation.setAttribute("lang", language);
      if (state.document.contentType !== "text/html")
        translation.setAttributeNS(xmlNamespace, "xml:lang", language);
    }
    block.append(
      state.document.createElementNS(block.namespaceURI, "br"),
      translation,
    );
    state.wrappers.push(translation);
    state.projections.set(index, text);
  }
  function rebuild(next: typeof applied) {
    const candidate = makeWorking(pristine.cloneNode(true) as Document);
    for (const [index, { value, bilingual }] of [...next].sort(
      ([a], [b]) => a - b,
    ))
      apply(candidate, index, value, bilingual);
    working = candidate;
  }
  const segments: Segment[] = working.paragraphs.map(({ codec }, index) => ({
    source: codec.text,
    context: codec.instruction,
    write(value, bilingual) {
      if (applied.has(index))
        rebuild(new Map(applied).set(index, { value, bilingual }));
      else apply(working, index, value, bilingual);
      applied.set(index, { value, bilingual });
    },
  }));
  return {
    segments,
    current: () => working.document,
    translationPreview: () =>
      [...working.projections]
        .sort(([a], [b]) => a - b)
        .map(([, text]) => text)
        .join("\n\n"),
    setLanguage(value: string) {
      language = value;
      if (working.replaced.size) {
        for (const source of working.protectedLanguages) {
          if (source.language !== undefined) {
            source.element.setAttribute("lang", source.language);
            if (working.document.contentType !== "text/html")
              source.element.setAttributeNS(
                xmlNamespace,
                "xml:lang",
                source.language,
              );
          }
          if (source.direction !== undefined)
            source.element.setAttribute("dir", source.direction);
        }
        for (const index of working.replaced) {
          const paragraph = working.paragraphs[index]!;
          for (const element of paragraph.languageElements)
            markTargetLanguage(element, value, element === paragraph.block);
        }
      }
      for (const wrapper of working.wrappers) {
        wrapper.setAttribute("lang", value);
        if (working.document.contentType !== "text/html")
          wrapper.setAttributeNS(xmlNamespace, "xml:lang", value);
        wrapper.setAttribute("dir", "auto");
      }
    },
  };
}
