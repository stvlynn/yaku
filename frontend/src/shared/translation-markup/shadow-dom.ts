export type TranslationRoot = Element | ShadowRoot;

export function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === 11 && "host" in node;
}

export function composedParent(node: Node): Element | null {
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode();
  return isShadowRoot(root) ? root.host : null;
}

export function matchesComposed(node: Node, selector: string): boolean {
  for (
    let element =
      node.nodeType === 1 ? (node as Element) : composedParent(node);
    element;
    element = composedParent(element)
  ) {
    if (element.matches(selector)) return true;
  }
  return false;
}

/** Enumerate accessible roots without patching page prototypes or closed roots. */
export function collectOpenRoots(scope: Element): TranslationRoot[] {
  const roots: TranslationRoot[] = [];
  function visit(root: TranslationRoot) {
    roots.push(root);
    const elements = isShadowRoot(root)
      ? [...root.querySelectorAll("*")]
      : [root, ...root.querySelectorAll("*")];
    for (const element of elements)
      if (element.shadowRoot) visit(element.shadowRoot);
  }
  visit(scope);
  return roots;
}

export const visibilityTarget = (root: TranslationRoot): Element =>
  isShadowRoot(root) ? root.host : root;
