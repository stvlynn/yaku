# Evidence ledger

## Selected targets

The supplied ZIP contains a CRX rather than an unpacked extension. The CRX3 header was parsed locally, and its ZIP payload extracted under the ignored `.workspace/research/package` directory. No packaged scripts were executed during extraction.

| Target | Observation | REA parent evidence |
| --- | --- | --- |
| Supplied ZIP | Complete central-directory inventory; two file occurrences including the root | `ev_d885f5a9b6f81466f32e899ca34d7ce6733fcc097b9141e5539ce6e750f1b877` |
| Extracted 1.34.2 | Manifest and three selected JavaScript entry/bridge sources | `ev_da23ca5ae1e840f58d67455988fde0d815336cdb35a3c9face87c0725457cc94` |
| Installed 1.34.4 | Same selected sources from Chrome Default profile | `ev_d015ab47d56cf2fb80065c72df46a0ec69065b42111ccc6888e76187fdc2b19a` |

The selected sources are `manifest.json`, `content_guard.js`, `popup-layout-bootstrap.js`, and `browser-bridge/inject.js`. The package has 49 unselected files and the installed version 50. Both analyses retain 2,408 semantic unknowns. Graph coverage is partial; these static graphs do not establish live behavior or complete functional equivalence. Runtime observations are recorded separately below.

The complete ten-record evidence bundle is retained locally at `.workspace/research/rea-evidence.json`. Proprietary bundles and assets remain outside product source and Git history. Evidence identities describe observations, not a product download gate.

An additional focused analysis of `popup.js` and `background.js` is retained as `ev_d7133ad51f4a8539224f0a5e9fc2224847cdd1376226036bd9ac031dba220a84`. Both sources were parsed with bounded semantic retention (3,000 nodes per file, 6,000 total); 40,216 semantic unknowns remain. The follow-up `ev_fe9b94fd1579fccebdefb76784e7e65a3ac7b123965d1d62e18a2aa3ce79473a` exposes source locations for popup automatic-translation and current-site setting references. These are static references, not demonstrated call paths.

## Original UI runtime observations

Both versions were loaded in separate disposable Chrome profiles with HTTP(S) blocked. Popup, options and side-panel text and screenshots were captured under `.workspace/research/original-runtime`. The default options surfaces render language, service, reading mode and appearance controls. Popup rendering reports a blocked fetch; no remote translation outcome is asserted. The 1.34.4 subtitle settings expose automatic subtitles, source-caption enablement, bilingual mode and download controls. Several secondary settings remained in a loading state during the bounded capture, so they remain runtime unknowns. This Playwright observation is separate from REA static Evidence.

## Framework basis

Context7 `/websites/wxt_dev` confirms file-based content/background entrypoints and `createShadowRootUi` with event isolation and mount cleanup. The implementation uses WXT's React module and an extension-owned offscreen runtime so model work can outlive a popup.

Registry queries resolved WXT 0.21.5, its React module 1.2.2, and Transformers.js 4.3.2. Version-specific behavior still requires the build and browser checks.

## Outstanding evidence

- Focused content/background/UI feature tracing.
- Original-extension journeys beyond the isolated UI captures, especially authenticated services.
- Language-quality and resource-pressure coverage beyond the measured real-model download, inference, cancellation and offline-reuse experiments.
- Full feature acceptance and version-difference disposition.
