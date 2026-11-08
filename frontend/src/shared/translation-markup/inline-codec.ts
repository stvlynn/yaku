import { copyProtectedContent } from "./protected-content";
import { composedParent } from "./shadow-dom";

const inlineTags = new Set(
  "A ABBR B BDI BDO CITE DEL EM I INS MARK Q S SMALL SPAN STRONG SUB SUP TIME U".split(
    " ",
  ),
);
const blockTags = new Set(
  "P DIV UL OL LI BLOCKQUOTE H1 H2 H3 H4 H5 H6 BR".split(" "),
);
const protectedTags = new Set("CODE PRE KBD SAMP MATH SVG".split(" "));
const attributes = ["href", "target", "rel", "title", "lang", "dir"] as const;
const xmlNamespace = "http://www.w3.org/XML/1998/namespace";
const invalidMarkers =
  "The translation changed inline markers. Retry this paragraph.";
const escape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const unescape = (text: string) =>
  text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
const elementOf = (node: Node): Element | undefined =>
  node.nodeType === 1 ? (node as Element) : undefined;
const tagOf = (node: Node) => elementOf(node)?.localName.toUpperCase();
const contentOf = (node: Node) =>
  elementOf(node)?.innerHTML ?? node.textContent;

export interface InlineCodecOptions {
  preserveBlocks?: boolean;
  preserveProtected?: boolean;
  /** Reconcile detached file DOM only. Original attributes never enter model output. */
  documentPreservation?: { baseUrl: string };
}
export interface InlineDecodeOptions {
  mode: "replace" | "bilingual";
}
interface Marker {
  id: number;
  parent: number | null;
  node: Node;
  open: string;
  close: string;
  opaque: boolean;
  safeCopy?: Node;
  semanticCopy?: boolean;
  sourceContent?: string | null;
  sourceMetadata?: { language?: string; direction?: string };
}
type Part = { text: string } | { marker: Marker; children: Part[] };

export function createInlineCodec(
  document: Document,
  block: Element | ShadowRoot,
  nodes: Text[],
  options: InlineCodecOptions = {},
) {
  const selected = new Set<Node>(nodes);
  const markers = new Map<number, Marker>();
  const preservation = options.documentPreservation;
  const projectionBaseUrl = preservation
    ? new URL(preservation.baseUrl)
    : undefined;
  const sourceMetadata = (node: Node) => {
    let language: string | undefined;
    let direction: string | undefined;
    for (
      let element = elementOf(node) ?? node.parentElement ?? undefined;
      element;
      element = element.parentElement ?? undefined
    ) {
      if (language === undefined)
        language =
          element.getAttributeNS(xmlNamespace, "lang") ??
          element.getAttribute("lang") ??
          undefined;
      const value = element.getAttribute("dir")?.toLowerCase();
      if (
        direction === undefined &&
        value &&
        ["ltr", "rtl", "auto"].includes(value)
      )
        direction = value;
      if (language !== undefined && direction !== undefined) break;
    }
    return { language, direction };
  };
  const hiddenSource = (node: Node) => {
    for (
      let element = elementOf(node) ?? node.parentElement ?? undefined;
      element;
      element = element.parentElement ?? undefined
    ) {
      const style = (element as HTMLElement).style;
      if (
        element.hasAttribute("hidden") ||
        element.getAttribute("aria-hidden") === "true" ||
        style?.display === "none" ||
        ["hidden", "collapse"].includes(style?.visibility ?? "") ||
        style?.getPropertyValue("content-visibility") === "hidden"
      )
        return true;
    }
    return false;
  };
  function mark(
    node: Node,
    parent: number | null,
    opaque: boolean,
    semanticCopy = false,
  ): string {
    const tag = tagOf(node);
    const name = opaque
      ? "yaku-keep"
      : tag === "A"
        ? "yaku-link"
        : ["EM", "STRONG", "B", "I"].includes(tag ?? "")
          ? "yaku-em"
          : "yaku-inline";
    const id = markers.size;
    const marker: Marker = {
      id,
      parent,
      node,
      open: `<${name} id="${id}">`,
      close: `</${name}>`,
      opaque,
      ...(opaque
        ? {
            safeCopy: preservation
              ? undefined
              : copyProtectedContent(document, node),
            semanticCopy,
            sourceMetadata:
              preservation && semanticCopy ? sourceMetadata(node) : undefined,
            sourceContent: contentOf(node),
          }
        : {}),
    };
    markers.set(id, marker);
    return (
      marker.open +
      (opaque
        ? ""
        : [...node.childNodes].map((child) => encode(child, id)).join("")) +
      marker.close
    );
  }
  function encode(node: Node, parent: number | null): string {
    if (preservation && hiddenSource(node)) return mark(node, parent, true);
    if (node.nodeType === 3) {
      if (selected.has(node) || !node.textContent?.trim())
        return escape(node.textContent ?? "");
      return preservation ? mark(node, parent, true, true) : "";
    }
    const element = elementOf(node);
    if (!element) return preservation ? mark(node, parent, true) : "";
    const tag = tagOf(element)!;
    const protectedContent =
      (options.preserveProtected || preservation) &&
      (protectedTags.has(tag) ||
        element.matches('[translate="no"],.notranslate'));
    if (protectedContent && !preservation)
      for (
        let ancestor: Element | null = element;
        ancestor;
        ancestor = composedParent(ancestor)
      ) {
        const style = document.defaultView?.getComputedStyle(ancestor);
        if (
          ancestor.hasAttribute("hidden") ||
          ancestor.getAttribute("aria-hidden") === "true" ||
          style?.display === "none" ||
          style?.visibility === "hidden"
        )
          return "";
      }
    const lineBreak =
      (options.preserveBlocks || preservation) &&
      (tag === "BR" || (preservation && tag === "WBR"));
    const containsSelected =
      lineBreak || nodes.some((text) => element.contains(text));
    if (
      preservation &&
      (protectedContent || (!containsSelected && !inlineTags.has(tag)))
    ) {
      const semanticCopy =
        ["CODE", "KBD", "SAMP"].includes(tag) ||
        (tag === "MATH" && element.getAttribute("display") !== "block") ||
        (inlineTags.has(tag) && !!protectedContent);
      return mark(element, parent, true, semanticCopy);
    }
    if (!preservation && !protectedContent && !containsSelected) return "";
    const allowedBlock = options.preserveBlocks && blockTags.has(tag);
    if (
      !preservation &&
      !protectedContent &&
      !inlineTags.has(tag) &&
      !allowedBlock
    )
      return [...element.childNodes]
        .map((child) => encode(child, parent))
        .join("");
    return mark(element, parent, !!protectedContent);
  }
  const text = [...block.childNodes]
    .map((node) => encode(node, null))
    .join("")
    .trim();
  const instruction = markers.size
    ? `Formatting requirements: Keep every inline marker exactly unchanged: ${[...markers.values()].map((marker) => marker.open + marker.close).join(" ")}. Translate the complete paragraph naturally into the target language. Preserve each tag around the corresponding translated phrase. The yaku-keep markers represent protected source content: keep them empty and retain their position in the translated sentence; their contents are restored separately. Do not add, remove, duplicate, or rename tags. Output only the translated paragraph with its tags.`
    : undefined;

  function parse(translated: string): Part[] {
    const parts: Part[] = [];
    const stack: { marker: Marker; children: Part[] }[] = [];
    const seen = new Set<number>();
    const append = (part: Part) => (stack.at(-1)?.children ?? parts).push(part);
    for (const token of translated.split(/(<[^>]*>)/g)) {
      if (!token) continue;
      if (!token.startsWith("<") || !token.endsWith(">")) {
        if (/<\/?yaku-/i.test(token)) throw new Error(invalidMarkers);
        const parent = stack.at(-1)?.marker;
        if (
          parent?.opaque ||
          tagOf(parent?.node ?? block) === "BR" ||
          tagOf(parent?.node ?? block) === "WBR"
        ) {
          if (token.trim()) throw new Error(invalidMarkers);
          continue;
        }
        append({ text: unescape(token) });
        continue;
      }
      const opening =
        /^<(yaku-link|yaku-em|yaku-inline|yaku-keep) id="(\d+)">$/.exec(token);
      if (opening) {
        const marker = markers.get(Number(opening[2]));
        if (
          !marker ||
          marker.open !== token ||
          seen.has(marker.id) ||
          marker.parent !== (stack.at(-1)?.marker.id ?? null)
        )
          throw new Error(invalidMarkers);
        const children: Part[] = [];
        seen.add(marker.id);
        append({ marker, children });
        stack.push({ marker, children });
      } else if (stack.at(-1)?.marker.close === token) stack.pop();
      else throw new Error(invalidMarkers);
    }
    if (stack.length || seen.size !== markers.size)
      throw new Error(invalidMarkers);
    return parts;
  }
  function safeElement(element: Element): Element {
    const copy = document.createElementNS(
      element.namespaceURI,
      element.prefix
        ? `${element.prefix}:${element.localName}`
        : element.localName,
    );
    for (const attribute of attributes) {
      if (preservation && (attribute === "lang" || attribute === "dir"))
        continue;
      const value = element.getAttribute(attribute);
      if (value === null) continue;
      if (attribute === "href") {
        let protocol: string;
        try {
          protocol = new URL(value, projectionBaseUrl ?? document.baseURI)
            .protocol;
        } catch {
          continue;
        }
        if (!["http:", "https:", "mailto:", "tel:"].includes(protocol))
          continue;
      }
      copy.setAttribute(attribute, value);
    }
    if (copy.getAttribute("target") === "_blank")
      copy.setAttribute(
        "rel",
        [
          ...new Set(
            (copy.getAttribute("rel") ?? "")
              .split(/\s+/)
              .concat("noopener", "noreferrer")
              .filter(Boolean),
          ),
        ].join(" "),
      );
    return copy;
  }
  function materialize(
    parts: Part[],
    mode?: InlineDecodeOptions["mode"],
  ): Node[] {
    return parts.flatMap((part) => {
      if ("text" in part) return [document.createTextNode(part.text)];
      const { marker, children } = part;
      if (marker.opaque) {
        if (preservation) {
          if (mode === "replace") return [marker.node];
          let copy =
            marker.semanticCopy && !hiddenSource(marker.node)
              ? copyProtectedContent(document, marker.node)
              : undefined;
          const metadata = marker.sourceMetadata;
          if (
            copy &&
            metadata &&
            (metadata.language !== undefined ||
              metadata.direction !== undefined)
          ) {
            if (copy.nodeType !== 1) {
              const wrapper = document.createElementNS(
                marker.node.parentElement?.namespaceURI ??
                  "http://www.w3.org/1999/xhtml",
                "span",
              );
              wrapper.append(copy);
              copy = wrapper;
            }
            const element = copy as Element;
            if (metadata.language !== undefined) {
              element.setAttribute("lang", metadata.language);
              element.setAttributeNS(
                xmlNamespace,
                "xml:lang",
                metadata.language,
              );
            }
            if (metadata.direction !== undefined)
              element.setAttribute("dir", metadata.direction);
          }
          return copy ? [copy] : [];
        }
        return marker.safeCopy ? [marker.safeCopy.cloneNode(true)] : [];
      }
      const element = elementOf(marker.node)!;
      const content = materialize(children, mode);
      if (preservation && mode === "replace") {
        element.replaceChildren(...content);
        return [element];
      }
      if (
        preservation &&
        !inlineTags.has(tagOf(element)!) &&
        !["BR", "WBR", "RUBY", "RT", "RP"].includes(tagOf(element)!)
      )
        return content;
      const copy = safeElement(element);
      copy.append(...content);
      return [copy];
    });
  }
  function decode(
    translated: string,
    decodeOptions?: InlineDecodeOptions,
  ): DocumentFragment {
    if (preservation && !decodeOptions)
      throw new Error("Document decoding requires an explicit output mode.");
    const parts = parse(translated);
    const fragment = document.createDocumentFragment();
    fragment.append(...materialize(parts, decodeOptions?.mode));
    return fragment;
  }
  const originals = [...markers.values()]
    .map((marker) => elementOf(marker.node))
    .filter((element): element is Element => !!element);
  const isCurrent = () =>
    [...markers.values()].every(
      (marker) =>
        marker.node.isConnected &&
        block.contains(marker.node) &&
        (marker.sourceContent === undefined ||
          contentOf(marker.node) === marker.sourceContent),
    );
  return { text, instruction, decode, originals, isCurrent };
}
