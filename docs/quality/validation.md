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

- The integrated build passes strict TypeScript, import boundaries and 154 unit tests. OPFS allocation/write failures and lifecycle serialization have controlled regression coverage; physical disk exhaustion has not been simulated.
- Protected-PDF missing/incorrect/correct password journeys and real translated PDF export passed. Passwords were absent from extension storage after the test.
- Real Chrome React-preserving page rendering, context/editor interactions and lazy-image batches passed with the actual executing background source checked. Offline unload/queued translation and offscreen recreation completed without HTTP requests.
- Ten non-model browser cases passed for settings, scoped glossaries, appearance, v3 sync, source-language rules, temporary website activation and the native action popup. Three model-dependent cases were explicitly skipped in that suite; separate real-model experiments cover their recorded workflows. Native popup Stop removed its activation without restoring the current reading page.
- Real product UI respected explicit German/English source choices for the ambiguous word Gift and produced Traditional Chinese with the requested digits. Page translation retained links, code and glossary text. Correctly declared UTF-8 fixtures preserved mixed Chinese/English content, and replay of the actual captured request matched the page result.
- Scoped native-caption exports passed with two real players, trusted pointer selection, source changes, late-result rejection, exact cue timing edits and timing-only cue reuse. Platform-shaped fixtures remain separate from authenticated production playback.
- WXT produced the 26.85 MB Chrome archive from the 79.94 MB unpacked build, without model weights. Packaging retained the accepted background and content script bytes.

## Acceptance still in progress

- Broader native editor/IME, subtitle-platform, PDF-layout and image-reader scenarios, including cases outside the recorded fixtures.
- Original-extension runtime comparison and site-specific differences.
- Remaining reference features and HTML/EPUB paragraph fidelity. DOCX story traversal has structural tests; complete Word rendering and all document constructs are not established.
- Complete feature-parity disposition and final release acceptance. The implementation checkpoint is published in [draft PR #1](https://github.com/stvlynn/yaku/pull/1); publication is not final acceptance.

No complete-parity or final acceptance claim is justified until the remaining work is resolved.
