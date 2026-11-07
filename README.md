# Yaku

A local-first browser translation extension built with WXT, React, and Transformers.js. Translation runs on the browser GPU with HY-MT2-1.8B. Model weights download on first use and are retained in origin-private storage.

## Development

Use Node.js 24 and pnpm 9.

```sh
pnpm install
pnpm dev
pnpm check
pnpm test
pnpm build
pnpm test:e2e
pnpm zip
```

Load `.output/chrome-mv3` as an unpacked extension in Chrome developer mode. A WebGPU adapter with shader-f16 is required. The model occupies approximately 1.38 GB before runtime memory. Runtime JavaScript and WASM ship inside the extension; model and OCR language files are data downloads.

## Current implementation

- Bilingual page translation, original restoration, dynamic paragraphs, translation-only mode, appearance controls and website rules.
- Selection, hover and editable-input translation, reversible input changes, concise explanations and local-voice playback.
- Text and writing workspaces, persisted preferences, glossary, settings import/export, optional Chrome settings sync, popup and side panel.
- Local model preparation, cancellation, cache inspection and removal.
- TXT, Markdown, HTML, JSON, EPUB, DOCX and SRT/VTT/ASS/LRC translation with downloadable output.
- Standard HTML media text-track translation, pretranslation and subtitle export; bounded DOM-caption adapters for representative video and meeting sites.
- Local image OCR, bilingual reading views and translated PNG export; page-image replacement with responsive-source restoration. PDF extraction and scanned-page OCR with bilingual HTML and reading-PDF exports.

The [feature parity inventory](docs/research/feature-parity.md) distinguishes observed reference features from delivered behavior. This repository does not claim full Immersive Translate parity or complete end-to-end acceptance yet. In particular, DOM captions cover observed content rather than unexposed complete tracks; translated image backgrounds use flat-color estimation; PDF reading exports do not reconstruct the source layout.

## Evidence and architecture

See [research](docs/research/README.md), [architecture](docs/project/architecture.md), and [validation](docs/quality/validation.md). Tests using deterministic translation functions validate structure and state only. Real model/browser experiments are recorded separately.

The extension is independently implemented. Immersive Translate bundles, branding, artwork and downloaded model weights are not committed. Source code uses the MIT license; third-party dependencies and model weights retain their own licenses. See [third-party notices](THIRD_PARTY_NOTICES.md).
