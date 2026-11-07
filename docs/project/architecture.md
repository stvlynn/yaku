# Architecture

Yaku is a Manifest V3 extension. It has no application server. Browser surfaces use Feature-Sliced Design; transport entrypoints compose features rather than embed translation engines in pages.

## Data flow

1. A content script or extension surface creates a translation request with an identity, source, target language and optional glossary/context.
2. The background service worker ensures a single offscreen document and forwards the request.
3. The offscreen document routes messages to a dedicated module worker.
4. The local-model feature prepares the pinned model from OPFS and serializes GPU inference requests.
5. Responses carry the original identity. Callers reject stale responses and restore original DOM when requested.

The model worker owns tokenizer/session lifetime. Closing a popup does not close inference. Download cancellation, inference cancellation, unloading and cache removal have distinct operations. Cancellation does not silently switch providers or return source text as a successful translation.

## Layers

| Layer | Responsibility |
| --- | --- |
| entrypoints / app | WXT bootstraps, browser transport listeners, surface composition and injected dependencies |
| pages | Popup, settings, onboarding and workspace composition |
| widgets | Translation editor and extension-surface controller; the controller coordinates file workflows and supplies page props |
| features | Local model, preferences, page/context/document/media workflows and translation session state |
| entities | Settings and translation contracts, defaults and pure domain values |
| shared | UI primitives, centralized copy, semantic theme and transport helpers |

Features receive translation functions rather than importing sibling workflows. Public slice indexes are the import boundary. The template backend directories remain unused; no server is introduced merely to satisfy a template structure.

## Persistence and permissions

Settings use `chrome.storage.local`; an optional background sync controller chunks settings into `chrome.storage.sync` within Chrome's item and total quotas. Model files and translated content are not synced. Current model status uses `chrome.storage.session`. Large model files use OPFS under the extension origin. `unlimitedStorage` supports the large local model; it does not replace actual allocation/error checks. Model readiness depends on successfully committed expected files and a usable session, not a superficial download progress event.

All-host access enables user-requested page, input and subtitle translation. Browser-protected pages remain unavailable. Local files require the user's Chrome extension file-access setting. Content and document output are treated as data. Generated translations are inserted as text, not executable HTML.

## Runtime assets

Build scripts copy the exact installed ONNX, PDF.js and Tesseract workers/WASM into public assets. The extension CSP allows self-hosted JavaScript and WASM compilation. ONNX uses its documented external-WASM export condition to prevent an unused duplicate binary. OCR language files and model weights are remote data, not remote executable code.

Production dependency license files and metadata are copied into the extension's `licenses` directory during the same asset build. Model weights are never included in the extension package.

Page-image actions originate from the browser's image context menu. The service worker retains the selected URL with its tab/frame identity; content scripts cannot turn this route into an arbitrary cross-origin fetch proxy. The offscreen document processes pixels with the same OCR and image-export feature used by the workspace, then requests the shared model worker. Content scripts keep responsive source attributes and original nodes for restoration, and reject stale results after source changes. Image fetching omits credentials; private/authenticated resources can therefore be unavailable.

## Deliberate boundaries

Reference service billing, remote availability, authenticated player behavior and unobserved site integrations are not established by static package analysis. A generic text-track adapter is not evidence of all-platform subtitle support. The parity ledger remains open for those workflows.
