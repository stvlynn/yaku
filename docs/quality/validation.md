# Validation

## Automated checks

- `pnpm check`: strict TypeScript.
- `pnpm lint`: FSD import boundaries and formatting.
- `pnpm test`: DOM restoration/dynamic mutation, model completion, settings sync and document archive/text round trips.
- `pnpm build`: production MV3 extension and local runtime assets.
- `pnpm test:e2e`: real Chrome extension surfaces, storage and UI interaction checks.

Structural tests inject deterministic translation functions and must not be cited as evidence of model quality. Real model tests are separate observations recorded in the research documents.

## Observed results

Real Chrome UI tests verify preferences persistence, invalid import recovery, JSON export, keyboard navigation, narrow layouts, website selector editing/reset, floating-control drag/visibility/theme and Chrome sync storage chunk round trips. The sync test verifies browser storage APIs and incoming change handling, not synchronization between two signed-in devices.

The real HY-MT2 conversion has produced English/Chinese translations with Transformers.js 4.3.2 and WebGPU. Extension-origin OPFS survives page reload and model-worker destruction; an offline run reported zero model network requests. Some tests seed previously downloaded model data explicitly. A separate fresh production-profile test completed the actual 1.38 GB Hugging Face download without seeding or request remapping, canceled during the large file, retried successfully and produced Chinese output through onboarding. See the reproducible scripts and detailed limits in the model-runtime research document.

Real-model tests also cover inline-link paragraph translation and exact restoration, nested open shadow roots and dynamic paragraphs, TXT/SRT exports, image OCR and PNG export, PDF extraction/HTML export, grammar correction, polite rewriting and contextual explanation. A six-window generation experiment matched a single-generation reference exactly through EOS; controlled tests separately verify output longer than the former 1024-token limit. These observations do not establish translation quality for every supported language or format.

The native PDF download test produced a two-page PDF with the source page's exact point dimensions and a Chinese A4 translation page; Poppler rendering was reviewed. The page-image test dispatched the actual registered Chrome menu event through the debugger, then exercised the production tab/frame-bound route, offscreen OCR, model inference, image decoding and responsive-picture restoration. It verified pixel dimensions and exact restored markup. It does not claim that native OS context-menu selection itself was clicked. Unique fixture URLs prevent a persistent test browser's restored old tabs from receiving the action instead of the current test page.

## Current integrated checkpoint

- The integrated build passes strict TypeScript, import boundaries, formatting and 205 unit tests. OPFS allocation/write failures and lifecycle serialization have controlled regression coverage; physical disk exhaustion has not been simulated.
- Protected-PDF missing/incorrect/correct password journeys and real translated PDF export passed. Passwords were absent from extension storage after the test.
- Real Chrome React-preserving page rendering, context/editor interactions and lazy-image batches passed with the actual executing background source checked. Offline unload/queued translation and offscreen recreation completed without HTTP requests.
- Ten non-model browser cases passed for settings, scoped glossaries, appearance, v3 sync, source-language rules, temporary website activation and the native action popup. Three model-dependent cases were explicitly skipped in that suite; separate real-model experiments cover their recorded workflows. Native popup Stop removed its activation without restoring the current reading page.
- Real product UI respected explicit German/English source choices for the ambiguous word Gift and produced Traditional Chinese with the requested digits. Page translation retained links, code and glossary text. Correctly declared UTF-8 fixtures preserved mixed Chinese/English content, and replay of the actual captured request matched the page result.
- Scoped native-caption exports passed with two real players, trusted pointer selection, source changes, late-result rejection, exact cue timing edits and timing-only cue reuse. Platform-shaped fixtures remain separate from authenticated production playback.
- HTML and EPUB each passed real-model replacement and bilingual exports. Checks retained relative links, code/formulas, unique IDs, one original image and target/source language metadata; Workspace previews contained plain translated text. Production import/export did not execute source scripts or fetch their resources.
- Native external-caption acquisition passed with real HY-MT2 on ordinary HTTP: a disabled French track loaded on explicit request and returned to disabled, a native English choice overrode the global French preference, and the production picker kept two active tracks separate without overwriting their modes. The separate picker probe covered keyboard/focus, cancellation, narrow dark layout and fullscreen video.
- Ordinary HTTP installed-content tests exercised page, selection, input and native-caption request creation with controlled translation responses. All request IDs used the HTTP-compatible CSPRNG path; no page exceptions occurred. This isolation test is separate from the actual-model native-caption result.
- Temporary editing passed native Popup/frame/session integration and a real HY-MT2 paragraph editing, undo/redo, source-preservation and switch-off journey. A separate source probe covered native rich-clipboard paste, browser composition events, caret retention across appearance changes and exact source restoration. Reference 1.34.2 was also exercised in an isolated profile with genuine provider translations; its source-containing editable containers are documented separately from Yaku's source-preserving design.
- WXT produced the 26.87 MB Chrome archive from the 80.00 MB unpacked build, without model weights. Packaging retained the accepted background/content bytes and dependency licenses.

## Acceptance still in progress

- Screenshot-area translation is available from the Chrome page context menu. It captures the visible tab before opening a frozen selection surface, maps the pointer rectangle to capture pixels and reuses local image OCR and translation. `scripts/experiments/screenshot-product.mjs` dispatched the registered menu handler in real Chrome, verified Escape produced no inference, dragged a real rectangle and observed only `HELLO WORLD` in the actual model request. The Chinese PNG measured 558 × 112 pixels. A second run with `--high-dpi --restart-worker` captured 2560 × 1440 pixels at a 1280 × 720 CSS viewport. It stopped and restarted the background worker while the picker was open, verified that only the tab and URL authorization survived in session storage, then translated the same screenshot selection into a 1116 × 224 PNG. Both runs use a seeded model and OCR language fixture. Native operating-system menu selection remains outside this test. [Chrome capture API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab)

- Broader native editor/IME, subtitle-platform, PDF-layout and image-reader scenarios, including cases outside the recorded fixtures.
- Original-extension runtime comparison and site-specific differences.
- Remaining reference features and broader document fidelity. HTML/EPUB paragraph behavior is verified on the recorded fixtures; complete reader/layout/encoding coverage is not established. DOCX story traversal has structural tests; complete Word rendering and all document constructs are not established.
- Complete feature-parity disposition and final release acceptance. The implementation checkpoint is published in [draft PR #1](https://github.com/stvlynn/yaku/pull/1); publication is not final acceptance.

No complete-parity or final acceptance claim is justified until the remaining work is resolved.
