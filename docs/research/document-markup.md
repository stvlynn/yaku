# HTML and EPUB paragraph fidelity

## Parsing and preservation boundary

HTML uses a detached HTML parser; XHTML uses the XML parser and must remain well-formed. Imported nodes never enter the extension's active document. The [HTML parsing specification](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-domparser-parsefromstring) disables scripting in the parsed document. Inert processing is not export sanitization: original scripts, event handlers, styles and resource references remain source data. Opening an export in another reader is a separate operation.

[EPUB 3.3](https://www.w3.org/TR/epub-33/) defines XHTML content documents, manifest/spine structure and the OCF container. Literal relative/fragment links retain their original paths. Content documents use their actual archive path as an explicit synthetic base for target-link validation; no synthetic URL is written into the book. Manifest/spine structure and non-content assets remain in the archive. This implementation does not validate every EPUB conformance rule.

## Paragraphs and the shared codec

The document slice groups Text nodes by their nearest paragraph, heading, list item, cell or container. Parent-owned text excludes nested blocks. Direct text around nested blocks is grouped under its nearest container; arbitrary HTML does not always expose an exact authorial sentence boundary. Head/script/style/form data, protected code/math, media and foreign content are not translated. Explicit hidden/aria-hidden and inline display/visibility/content-visibility hiding are retained without exposing source contents in the target. External CSS is not fetched to infer class-based visibility.

The slice reuses the [shared codec](../frontend/translation-markup.md). Complete owned paragraphs receive validated structural markers; protected code/formula/resource contents and original attributes do not enter model output. Namespace-aware handling preserves XHTML and original inline attributes. The model cannot generate HTML attributes.

Translation-only reconciliation reuses source inline/opaque nodes within a detached working tree. IDs, class/style, EPUB types and resources remain; target language/direction metadata is an intentional exception. Translated blocks and existing inline language/direction overrides receive target language and `dir=auto`, while protected source keeps its source language semantics. HTML and EPUB translated-only root metadata identify the target language.

Bilingual output retains source children/metadata and appends an ID-free span and line break inside the owner, avoiding duplicate list items, cells or background styling. Target spans declare their language and automatic direction. Inline code and inline MathML receive safe static target copies so sentence meaning is complete. Standalone pre/code/display-math blocks remain once; images/media and nested blocks remain source-only. Repeating semantic code/formula content across the two sentences is intentional, while resource/ID duplication is not. Target inline projections retain semantic formatting and safe links without copying source class/style/ID or translated-text source language overrides.

A pristine tree supports repeated writes and mode changes. Normal sequential writes update one working document. Rewriting an applied segment builds/replays a candidate before commit, so changed markers cannot replace a previously valid result. Parent reconciliation retains translated child objects and resources. `PreparedDocument.translationPreview()` exposes a plain semantic projection for Workspace progress/result display; marker syntax never needs to appear in the product UI.

## Encoding and serialization

HTML decoding honors UTF BOMs, then declared charset metadata within the first 1,024 bytes, otherwise explicit UTF-8. This is a bounded prescan rather than every browser encoding-sniffing heuristic. Native TextDecoder handles supported declared legacy encodings; unsupported labels and invalid bytes fail visibly. Output is UTF-8 with normalized/added charset metadata. Doctype and its absence are retained, avoiding an accidental quirks-to-standards change.

XML decoding supports UTF-8/UTF-16 BOM/signatures, validates compatible declarations and rejects unsupported/contradictory declarations. DOCX and EPUB XML share this decoder. Modified XML is serialized as UTF-8; unchanged asset bytes survive while ZIP compression is rebuilt. EPUB retains its first uncompressed mimetype entry.

## Verification

Document structural tests cover rich HTML, XHTML namespaces, literal relative/fragment links, protected code/math, media/unique IDs, nested parent/list/table ownership, replace-to-bilingual replay, invalid-marker atomicity, explicit hidden content, target/source language metadata, manifest/spine/navigation fixtures, UTF-16 XHTML and declared legacy HTML encoding. Deterministic callbacks establish structure rather than model quality.

A standalone Chrome 157 detached-DOMParser probe observed no script execution or stylesheet/image/iframe requests. `tests/e2e/document-markup.spec.ts` additionally tests the production import/export path with protected HTML/EPUB and no model inference, checking source resource requests, sentinels and empty cache. Its separately gated real-model case covers HTML/EPUB in replacement and bilingual modes and inspects exports and plain Workspace results. Both integrated scenarios passed against the fixed build containing this change. The protected import/export case processed HTML and EPUB without model inference: source-resource requests stayed empty, the script sentinel remained unset and model-cache bytes stayed zero. The four-mode model case used the actual cached HY-MT2 conversion through production Workspace callbacks, not a deterministic translation stub.

Complex CSS layout/visibility, every encoding heuristic, all EPUB readers/conformance rules, active-source behavior after a user opens an export, and model marker compliance for every document remain outside verified coverage.

## Integrated export evidence

A fresh isolated profile passed executed-background-source verification before the real model run. An older cached profile was rejected because its running service worker differed from the built file; it was not used for acceptance. The new profile was explicitly seeded from previously independently downloaded/hash-verified assets, so this run is not another production-download claim. The complete cache contained 1,383,140,565 bytes.

All four outputs—HTML replacement, HTML bilingual, EPUB replacement and EPUB bilingual—produced the same complete Chinese sentence in this small fixture. Each retained `npm install`, MathML `x+1`, the literal `second.xhtml#intro` link, one image and unique IDs. Replacement retained one code/formula instance; bilingual retained a semantic instance in each sentence. Translated blocks declared `lang=zh` and `dir=auto`. Source resource requests stayed empty during preparation and result inspection. Workspace rendered the plain translation without internal marker syntax.

The actual EPUB downloads were inspected as ZIP binaries: 2,461 bytes replacement and 2,531 bytes bilingual. Both had a first stored mimetype entry, the expected nine parts, unchanged image SHA-256 and script-part bytes, and spine order `chapter,second`. XHTML parsed without errors. Replacement root language was Chinese; bilingual source root remained English and its target span declared Chinese. These small fixtures do not establish general EPUB reading-system or model-quality coverage.

Local evidence includes `document-import-inert.json`, `document-markup-real-model.json`, `document-epub-package.json`, the four `rich-replacement`/`rich-bilingual` HTML/EPUB exports, and Workspace screenshots under `.workspace/qa/`. Separate reading screenshots were rendered from temporary inspection copies with active source scripts removed; exported files were not modified. Both reading modes were visually reviewed for complete text, visible code/formula and preserved link styling. Original active source remains preserved in the exports as documented above.
