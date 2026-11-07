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

## Acceptance still in progress

- The integrated build passes strict TypeScript, import boundaries and 130 unit tests. OPFS allocation/write failures and lifecycle serialization have controlled regression coverage; physical disk exhaustion has not been simulated.
- Protected-PDF missing/incorrect/correct password journeys and real translated PDF export passed. Passwords were absent from extension storage after the test.
- Real Chrome regression for React-preserving page rendering, context/editor interactions, scoped glossaries and lazy-image batches is in progress.
- Broader input/editor, subtitle-platform, PDF-layout and image-reader scenarios.
- Original-extension runtime comparison and site-specific differences.
- Visual review after all final surface changes.
- Complete feature-parity disposition and final package acceptance. The implementation checkpoint is published in [draft PR #1](https://github.com/stvlynn/yaku/pull/1); publication is not final acceptance.

No complete-parity or final acceptance claim is justified until the remaining work is resolved.
