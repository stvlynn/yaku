import { copyProtectedContent } from "./protected-content";
import { composedParent } from "./shadow-dom";

const inlineTags = new Set([
  "A",
  "ABBR",
  "B",
  "BDI",
  "BDO",
  "CITE",
  "DEL",
  "EM",
  "I",
  "INS",
  "MARK",
  "Q",
  "S",
  "SMALL",
  "SPAN",
  "STRONG",
  "SUB",
  "SUP",
  "TIME",
  "U",
]);
const attributes = ["href", "target", "rel", "title", "lang", "dir"] as const;
const invalidMarkers =
  "The translation changed inline markers. Retry this paragraph.";
const escape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const unescape = (text: string) =>
  text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

type Marker = {
  id: number;
  parent: number | null;
  name: string;
  element: Element;
  open: string;
  close: string;
  opaque?: Node;
  sourceContent?: string;
};

export function createInlineCodec(
  document: Document,
  block: Element | ShadowRoot,
  nodes: Text[],
  options: { preserveBlocks?: boolean; preserveProtected?: boolean } = {},
) {
  const selected = new Set<Node>(nodes);
  const markers = new Map<number, Marker>();
  function encode(node: Node, parent: number | null): string {
    if (node.nodeType === 3)
      return selected.has(node) || !node.textContent?.trim()
        ? escape(node.textContent ?? "")
        : "";
    if (node.nodeType !== 1) return "";
    const element = node as Element;
    const protectedContent =
      options.preserveProtected &&
      element.matches(
        'code,pre,kbd,samp,math,svg,[translate="no"],.notranslate',
      );
    if (protectedContent)
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
    const lineBreak = options.preserveBlocks && element.tagName === "BR";
    const containsSelected =
      protectedContent ||
      lineBreak ||
      nodes.some((text) => element.contains(text));
    if (!containsSelected) return "";
    const allowedBlock =
      options.preserveBlocks &&
      [
        "P",
        "DIV",
        "UL",
        "OL",
        "LI",
        "BLOCKQUOTE",
        "H1",
        "H2",
        "H3",
        "H4",
        "H5",
        "H6",
        "BR",
      ].includes(element.tagName);
    if (!protectedContent && !inlineTags.has(element.tagName) && !allowedBlock)
      return [...element.childNodes]
        .map((child) => encode(child, parent))
        .join("");
    const id = markers.size;
    const name = protectedContent
      ? "yaku-keep"
      : element.tagName === "A"
        ? "yaku-link"
        : ["EM", "STRONG", "B", "I"].includes(element.tagName)
          ? "yaku-em"
          : "yaku-inline";
    const marker: Marker = {
      id,
      parent,
      name,
      element,
      open: `<${name} id="${id}">`,
      close: `</${name}>`,
      ...(protectedContent
        ? {
            opaque: copyProtectedContent(document, element),
            sourceContent: element.innerHTML,
          }
        : {}),
    };
    markers.set(id, marker);
    return (
      marker.open +
      (protectedContent
        ? ""
        : [...element.childNodes].map((child) => encode(child, id)).join("")) +
      marker.close
    );
  }
  const text = [...block.childNodes]
    .map((node) => encode(node, null))
    .join("")
    .trim();
  const instruction = markers.size
    ? `Formatting requirements: Keep every inline marker exactly unchanged: ${[...markers.values()].map((marker) => marker.open + marker.close).join(" ")}. Translate the complete paragraph naturally into the target language. Preserve each tag around the corresponding translated phrase. The yaku-keep markers represent protected source content: keep them empty and retain their position in the translated sentence; their contents are restored separately. Do not add, remove, duplicate, or rename tags. Output only the translated paragraph with its tags.`
    : undefined;

  function decode(translated: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const stack: { marker: Marker; copy: Element }[] = [];
    const seen = new Set<number>();
    const append = (node: Node) =>
      (stack.at(-1)?.copy ?? fragment).appendChild(node);
    for (const token of translated.split(/(<[^>]*>)/g)) {
      if (!token) continue;
      if (!token.startsWith("<") || !token.endsWith(">")) {
        if (/<\/?yaku-/i.test(token)) throw new Error(invalidMarkers);
        if (
          stack.at(-1)?.marker.element.tagName === "BR" ||
          stack.at(-1)?.marker.opaque
        ) {
          if (token.trim()) throw new Error(invalidMarkers);
          continue;
        }
        append(document.createTextNode(unescape(token)));
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
        const copy = document.createElement(
          marker.element.tagName.toLowerCase(),
        );
        if (marker.opaque) {
          seen.add(marker.id);
          append(marker.opaque.cloneNode(true));
          stack.push({ marker, copy });
          continue;
        }
        for (const attribute of attributes) {
          const value = marker.element.getAttribute(attribute);
          if (value === null) continue;
          if (attribute === "href") {
            let protocol: string;
            try {
              protocol = new URL(value, document.baseURI).protocol;
            } catch {
              throw new Error(invalidMarkers);
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
        seen.add(marker.id);
        append(copy);
        stack.push({ marker, copy });
      } else if (stack.at(-1)?.marker.close === token) stack.pop();
      else throw new Error(invalidMarkers);
    }
    if (stack.length || seen.size !== markers.size)
      throw new Error(invalidMarkers);
    return fragment;
  }
  const originals = [...markers.values()].map((marker) => marker.element);
  const isCurrent = () =>
    [...markers.values()].every(
      (marker) =>
        marker.element.isConnected &&
        block.contains(marker.element) &&
        (marker.sourceContent === undefined ||
          marker.element.innerHTML === marker.sourceContent),
    );
  return { text, instruction, decode, originals, isCurrent };
}
