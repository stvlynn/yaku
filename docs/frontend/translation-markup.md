# Translation markup ownership

`shared/translation-markup` owns the single strict inline-marker codec used by page reading, editable prose and detached HTML/XHTML file translation. Model output is parsed as text plus exact known markers; it is never assigned as HTML. Every marker must occur once, balance correctly and retain its original marker parent. The complete plan is validated before materialization, so invalid output cannot partially reparent document source nodes.

## Default page and editor policy

`createInlineCodec(document, block, selectedTextNodes, options)` defaults to safe projections. Only known source inline tags and the existing attribute allowlist are copied. Protected code/formulas use the static protected-content copier, excluding active nodes, event attributes and resource-bearing style data. Source nodes are not moved. `decode(translatedText)` keeps this behavior.

Tag matching uses `localName` so HTML and XHTML take the same structural path, and new safe projections preserve the source namespace. DOM defines [element namespace/local names and namespaced creation](https://dom.spec.whatwg.org/#dom-document-createelementns); XML serialization must not turn XHTML links into no-namespace elements.

## Explicit detached document policy

```ts
const codec = createInlineCodec(document, paragraph, selectedTextNodes, {
  documentPreservation: {
    baseUrl: "https://archive.invalid/OPS/chapter.xhtml",
  },
});
const replacement = codec.decode(modelOutput, { mode: "replace" });
paragraph.replaceChildren(replacement);
```

`InlineCodecOptions` and `InlineDecodeOptions` are exported from the public module. Document preservation is a caller-selected policy for a detached file working tree, not a sanitizer for inserting arbitrary uploaded nodes into the live extension UI. The caller supplies a meaningful absolute base for relative/fragment link validation; the original literal `href` is retained, and validation does not fetch it.

- `replace` reconciles original source elements in translated order and replaces their owned text children. Original object identity, namespace, IDs, class/style, namespaced attributes and media nodes survive. Unselected nested blocks, comments and resources remain opaque empty markers and are restored from the source, never reconstructed from model attributes.
- `bilingual` leaves the original block untouched. The caller inserts a new target wrapper without copying the source block's ID/resources and sets its output language/direction. The target contains semantic inline projections and safe links, without source IDs, class/style or source `lang`/`dir` overrides. Inline wrappers around code/formulas are traversed so their semantics are retained; inline code/MathML receive static safe copies with no duplicated IDs/resources. Images, audio/video, nested blocks, standalone preformatted blocks and display formulas remain in the original only.
- Explicitly hidden subtrees remain original-only, including when selected text was supplied accidentally. Hidden attributes and inline display/visibility/content-visibility are recognized; external stylesheet visibility is not inferred by loading CSS.

The caller owns paragraph grouping, immutable source snapshots, repeated-write/mode-switch reconstruction, target wrappers, archive ordering and serialization. Parent/child paragraphs can retain shared original node references because replacement preserves opaque nested objects. A writer must not treat a previously translated working tree as its pristine bilingual source.

Document-only semantic protected copies snapshot their nearest declared/inherited source language and valid direction when the codec is created, before writers change target metadata. Those copies retain that language through safe `lang`/`xml:lang` and `dir` attributes; explicitly unknown language stays unknown, and missing declarations are not guessed. Translated inline prose inherits the target wrapper's metadata. Page/editor copy policy does not gain these attributes.

[EPUB 3.3](https://www.w3.org/TR/epub-33/) defines XHTML content documents and structural attributes such as `epub:type`; original namespace-qualified metadata therefore remains on its source node. HTML requires [IDs to be unique in the element tree](https://html.spec.whatwg.org/multipage/dom.html#the-id-attribute). Cloning whole source subtrees into bilingual targets would duplicate IDs and resource references, so the document policy uses reconciliation and a separate safe semantic projection.

## Validation evidence

Focused tests first reproduced lowercase-XHTML loss, lost document attributes/resources and missing-marker acceptance. The corrected suite covers original-node reordering, relative/fragment links from an about:blank parsed document, namespace-qualified attributes, invalid-output rollback, hidden content, wrapped inline code/MathML, resource/ID counts, comments and standalone blocks. Existing page/editor/React suites also pass.

An installed Chrome 157 DOM experiment separately parsed XHTML and exercised both modes. Replacement retained the exact original link/image objects and attributes; bilingual output retained one image and one source ID while producing two semantic code/formula copies. Relative `../notes.xhtml#n` remained literal, serialized XML reparsed without errors, and malicious marker output left the original subtree unchanged. This uses controlled translated text to verify DOM behavior; it is not real-model translation-quality evidence. HTML/EPUB grouping, exported package integrity and real model output are verified by the document feature's separate acceptance workflow.
