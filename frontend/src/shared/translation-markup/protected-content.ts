const mathTags = new Set(
  "math mrow mi mn mo mtext mspace mfrac msqrt mroot msub msup msubsup munder mover munderover mtable mtr mtd menclose mstyle mpadded mphantom semantics annotation".split(
    " ",
  ),
);
const svgTags = new Set(
  "svg g path rect circle ellipse polygon polyline line text tspan defs clippath lineargradient radialgradient stop".split(
    " ",
  ),
);
const safeAttributes = new Set(
  "display displaystyle mathvariant mathsize mathcolor mathbackground scriptlevel stretchy fence separator form lspace rspace accent accentunder linethickness rowalign columnalign rowspacing columnspacing columnspan rowspan notation open close separators viewBox width height d x y x1 y1 x2 y2 cx cy r rx ry points fill stroke stroke-width transform offset stop-color".split(
    " ",
  ),
);

/** Copy source-owned static code/formula data without event handlers or active content. */
export function copyProtectedContent(
  document: Document,
  source: Node,
): Node | undefined {
  if (source.nodeType === 3)
    return document.createTextNode(source.textContent ?? "");
  if (source.nodeType !== 1) return;
  const element = source as Element;
  const tag = element.localName.toLowerCase();
  if (
    ["script", "style", "iframe", "object", "embed", "foreignobject"].includes(
      tag,
    )
  )
    return;
  const math = element.namespaceURI === "http://www.w3.org/1998/Math/MathML";
  const svg = element.namespaceURI === "http://www.w3.org/2000/svg";
  const safeTag = math
    ? mathTags.has(tag)
    : svg
      ? svgTags.has(tag)
      : [
          "code",
          "pre",
          "kbd",
          "samp",
          "span",
          "b",
          "strong",
          "i",
          "em",
          "sub",
          "sup",
          "mark",
        ].includes(tag);
  if (!safeTag) return document.createTextNode(element.textContent ?? "");
  const copy =
    math || svg
      ? document.createElementNS(element.namespaceURI!, element.localName)
      : document.createElement(tag);
  for (const attribute of element.attributes)
    if (
      safeAttributes.has(attribute.name) &&
      !/url\s*\(|javascript:|data:/i.test(attribute.value)
    )
      copy.setAttribute(attribute.name, attribute.value);
  for (const child of element.childNodes) {
    const safe = copyProtectedContent(document, child);
    if (safe) copy.append(safe);
  }
  return copy;
}
