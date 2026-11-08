import {
  composedParent,
  createInlineCodec,
} from "../../shared/translation-markup";
import { contextErrors } from "./config";
import { languages } from "../../shared/languages";

type Editor = HTMLInputElement | HTMLTextAreaElement | HTMLElement;
type Snapshot = {
  element: Editor;
  native: boolean;
  text: string;
  signature: string;
  version: number;
  originalNodes: Node[];
  selection?: {
    start: number;
    end: number;
    direction: "forward" | "backward" | "none";
  };
  richSelection?: {
    anchor: Node;
    anchorOffset: number;
    focus: Node;
    focusOffset: number;
  };
  replaceSelection?: (translated: DocumentFragment) => DocumentFragment;
  codec?: ReturnType<typeof createInlineCodec>;
  prefix?: string | DocumentFragment;
  suffix?: string;
  targetLanguage?: string;
};

function nodePath(root: Node, node: Node): number[] {
  const path: number[] = [];
  for (let current = node; current !== root; current = current.parentNode!)
    path.unshift(
      Array.from(current.parentNode!.childNodes).indexOf(current as ChildNode),
    );
  return path;
}

function richReplacement(root: HTMLElement, range: Range) {
  const document = root.ownerDocument;
  const start = nodePath(root, range.startContainer);
  const end = nodePath(root, range.endContainer);
  const startOffset = range.startOffset;
  const endOffset = range.endOffset;
  const originalRoot = root.cloneNode(true);
  // Rebuild from the original on each retarget, leaving the undo nodes untouched.
  return (translated: DocumentFragment) => {
    const clone = originalRoot.cloneNode(true);
    const at = (path: number[]) =>
      path.reduce((node, index) => node.childNodes[index]!, clone);
    const replacement = document.createRange();
    replacement.setStart(at(start), startOffset);
    replacement.setEnd(at(end), endOffset);
    const ancestor = replacement.commonAncestorContainer;
    const edge = (node: Node) => {
      const path: Element[] = [];
      for (let item = node; item !== ancestor; item = item.parentNode!)
        if (item.nodeType === 1) path.unshift(item as Element);
      return path;
    };
    const leading = edge(replacement.startContainer);
    const trailing = edge(replacement.endContainer);
    replacement.deleteContents();
    function join(into: ParentNode, path: Element[], side: "start" | "end") {
      const boundary = side === "start" ? into.firstChild : into.lastChild;
      const [original, ...descendants] = path;
      if (!original) return;
      if (
        boundary?.nodeType !== 1 ||
        (boundary as Element).localName !== original.localName
      )
        throw new Error(contextErrors.protectedEditor);
      join(boundary as Element, descendants, side);
      if (side === "start") original.append(...boundary.childNodes);
      else original.prepend(...boundary.childNodes);
      into.removeChild(boundary);
    }
    join(translated, leading, "start");
    join(translated, trailing, "end");
    replacement.insertNode(translated);
    const result = document.createDocumentFragment();
    result.append(...clone.childNodes);
    return result;
  };
}

function inputDirective(text: string) {
  const matches = [
    ...text.matchAll(
      /(?<!\S)\/\/\s*|(?<!\S)\/([a-z]{2,3}(?:-[a-z]+)?)(?=\s)\s*/giu,
    ),
  ];
  for (const match of matches.reverse()) {
    const targetLanguage =
      match[1] &&
      languages.find(
        ([code]) => code.toLowerCase() === match[1]!.toLowerCase(),
      )?.[0];
    if (match[1] && !targetLanguage) continue;
    const start = match.index!;
    const end = match.index! + match[0].length;
    return { start, end, targetLanguage: targetLanguage || undefined };
  }
}

export function createEditorTracker(
  document: Document,
  signal: AbortSignal,
  onEdit?: (editor: HTMLElement, event: Event) => void,
) {
  const view = document.defaultView!;
  const versions = new WeakMap<Editor, number>();
  const composing = new WeakSet<Editor>();
  const ownEvents = new WeakSet<Event>();
  const isNative = (
    element: Editor,
  ): element is HTMLInputElement | HTMLTextAreaElement =>
    element instanceof view.HTMLInputElement ||
    element instanceof view.HTMLTextAreaElement;
  const signature = (element: Editor) =>
    isNative(element) ? element.value : element.innerHTML;
  function editorFor(node: EventTarget | null): Editor | undefined {
    if (!(node instanceof view.Node)) return;
    for (
      let element =
        node.nodeType === 1 ? (node as Element) : composedParent(node);
      element;
      element = composedParent(element)
    ) {
      if (
        element instanceof view.HTMLInputElement ||
        element instanceof view.HTMLTextAreaElement
      )
        return element;
      const editable = element.getAttribute("contenteditable");
      if (editable === "false") return;
      if (
        editable !== null &&
        ["true", "", "plaintext-only"].includes(editable)
      )
        return element as HTMLElement;
    }
  }
  function eventEditor(event: Event) {
    return event.composedPath().map(editorFor).find(Boolean);
  }
  const bump = (element: Editor) =>
    versions.set(element, (versions.get(element) ?? 0) + 1);
  for (const name of [
    "beforeinput",
    "input",
    "compositionstart",
    "compositionend",
  ]) {
    document.addEventListener(
      name,
      (event) => {
        if (ownEvents.has(event)) return;
        const element = eventEditor(event);
        if (!element) return;
        bump(element);
        if (
          event.type === "compositionstart" ||
          (event instanceof view.InputEvent && event.isComposing)
        )
          composing.add(element);
        if (event.type === "compositionend") composing.delete(element);
        onEdit?.(element, event);
      },
      { capture: true, signal },
    );
  }
  function activeEditor() {
    if (!document.hasFocus()) return;
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement)
      active = active.shadowRoot.activeElement;
    return editorFor(active);
  }
  function caretAtEnd(element: Editor) {
    if (composing.has(element)) return false;
    if (isNative(element))
      return (
        element.selectionStart === element.value.length &&
        element.selectionEnd === element.value.length
      );
    const selection = view.getSelection();
    if (
      !selection?.isCollapsed ||
      !selection.anchorNode ||
      !element.contains(selection.anchorNode)
    )
      return false;
    const rest = document.createRange();
    rest.selectNodeContents(element);
    rest.setStart(selection.anchorNode, selection.anchorOffset);
    return rest.toString() === "";
  }
  function capture(element: Editor): Snapshot | undefined {
    if (composing.has(element)) return;
    const native = isNative(element);
    if (
      native &&
      (element.disabled ||
        element.readOnly ||
        (element instanceof view.HTMLInputElement &&
          !["text", "search", "tel"].includes(element.type)))
    )
      return;
    if (element.getAttribute("aria-readonly") === "true") return;
    const snapshot: Snapshot = {
      element,
      native,
      text: native ? element.value : (element.textContent ?? ""),
      signature: signature(element),
      version: versions.get(element) ?? 0,
      originalNodes: native ? [] : [...element.childNodes],
    };
    if (native) {
      snapshot.selection = {
        start: element.selectionStart ?? 0,
        end: element.selectionEnd ?? 0,
        direction: element.selectionDirection ?? "none",
      };
      const { start, end } = snapshot.selection;
      if (start !== end) {
        snapshot.prefix = element.value.slice(0, start);
        snapshot.suffix = element.value.slice(end);
        snapshot.text = element.value.slice(start, end);
      } else {
        const directive = inputDirective(snapshot.text);
        if (directive) {
          snapshot.targetLanguage = directive.targetLanguage;
          snapshot.prefix = snapshot.text.slice(0, directive.start);
          snapshot.text = snapshot.text.slice(directive.end);
        }
      }
    } else {
      if (
        element.querySelector(
          '[contenteditable="false"],script,style,iframe,input,textarea,select',
        )
      )
        throw new Error(contextErrors.protectedEditor);
      let translationRoot = element;
      const selection = view.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
      if (
        range &&
        selection?.anchorNode &&
        selection.focusNode &&
        element.contains(range.commonAncestorContainer)
      )
        snapshot.richSelection = {
          anchor: selection.anchorNode,
          anchorOffset: selection.anchorOffset,
          focus: selection.focusNode,
          focusOffset: selection.focusOffset,
        };
      const selectedRange =
        snapshot.richSelection && range && !range.collapsed ? range : undefined;
      const directive = selectedRange
        ? undefined
        : inputDirective(snapshot.text);
      if (selectedRange) {
        translationRoot = document.createElement("div");
        translationRoot.append(selectedRange.cloneContents());
        snapshot.replaceSelection = richReplacement(element, selectedRange);
      } else if (directive) {
        snapshot.targetLanguage = directive.targetLanguage;
        const range = document.createRange();
        range.selectNodeContents(element);
        const point = (offset: number): [Node, number] => {
          const walker = document.createTreeWalker(element, 4);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const length = (node as Text).length;
            if (offset <= length) return [node, offset];
            offset -= length;
          }
          return [element, element.childNodes.length];
        };
        range.setEnd(...point(directive.start));
        snapshot.prefix = range.cloneContents();
        range.selectNodeContents(element);
        range.setStart(...point(directive.end));
        translationRoot = document.createElement("div");
        translationRoot.append(range.cloneContents());
      }
      const walker = document.createTreeWalker(translationRoot, 4);
      const nodes: Text[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode())
        nodes.push(node as Text);
      snapshot.codec = createInlineCodec(document, translationRoot, nodes, {
        preserveBlocks: true,
        preserveProtected: true,
        preserveEditorElements: !!selectedRange,
      });
      snapshot.text = snapshot.codec.text;
    }
    return snapshot;
  }
  const current = (snapshot: Snapshot) =>
    snapshot.element.isConnected &&
    !composing.has(snapshot.element) &&
    (versions.get(snapshot.element) ?? 0) === snapshot.version &&
    signature(snapshot.element) === snapshot.signature;
  function emit(
    element: Editor,
    type: string,
    inputType: string,
    data: string | null,
    cancelable = false,
  ) {
    const event = new view.InputEvent(type, {
      bubbles: true,
      composed: true,
      cancelable,
      inputType,
      data,
    });
    ownEvents.add(event);
    return element.dispatchEvent(event);
  }
  function nativeValue(element: Editor, value: string) {
    const prototype =
      element instanceof view.HTMLInputElement
        ? view.HTMLInputElement.prototype
        : view.HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value,
    );
  }
  function apply(
    snapshot: Snapshot,
    translated: string,
    isCurrent = () => current(snapshot),
  ) {
    if (!isCurrent()) return;
    const { element } = snapshot;
    const fragment = snapshot.codec?.decode(translated);
    const plain = fragment?.textContent ?? translated;
    if (
      !emit(element, "beforeinput", "insertReplacementText", plain, true) ||
      !isCurrent()
    )
      return;
    if (snapshot.native)
      nativeValue(
        element,
        (typeof snapshot.prefix === "string" ? snapshot.prefix : "") +
          translated +
          (snapshot.suffix ?? ""),
      );
    else if (snapshot.replaceSelection)
      element.replaceChildren(snapshot.replaceSelection(fragment!));
    else if (snapshot.prefix && typeof snapshot.prefix !== "string")
      element.replaceChildren(snapshot.prefix.cloneNode(true), fragment!);
    else element.replaceChildren(fragment!);
    const appliedSignature = signature(element);
    emit(element, "input", "insertReplacementText", plain);
    const version = versions.get(element) ?? 0;
    const canUndo = () =>
      element.isConnected &&
      !composing.has(element) &&
      signature(element) === appliedSignature &&
      (versions.get(element) ?? 0) === version;
    function undo() {
      if (
        !canUndo() ||
        !emit(element, "beforeinput", "historyUndo", null, true) ||
        !canUndo()
      )
        return false;
      if (snapshot.native) nativeValue(element, snapshot.signature);
      else element.replaceChildren(...snapshot.originalNodes);
      emit(element, "input", "historyUndo", null);
      element.focus({ preventScroll: true });
      if (snapshot.native && snapshot.selection && isNative(element))
        element.setSelectionRange(
          snapshot.selection.start,
          snapshot.selection.end,
          snapshot.selection.direction,
        );
      else if (snapshot.richSelection) {
        const { anchor, anchorOffset, focus, focusOffset } =
          snapshot.richSelection;
        view
          .getSelection()
          ?.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
      }
      return true;
    }
    return { text: plain, undo, canUndo };
  }
  return { activeEditor, caretAtEnd, capture, current, apply, editorFor };
}
