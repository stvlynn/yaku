# Distribution

Yaku is distributed as a Chrome Manifest V3 extension, not a hosted application.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm zip
```

The build copies version-matched local ONNX, OCR and PDF workers/WASM and generates toolbar icons from the shared theme. Load `.output/chrome-mv3` for manual acceptance. The ZIP produced by WXT is the package for a later Chrome Web Store submission; repository publication does not imply a store listing.

CI runs type checks, structural tests and the production build, then retains the unpacked extension artifact. GPU/browser acceptance is recorded separately because a generic CI runner does not establish WebGPU availability or model output quality.

Publish source changes with their lockfile, notices, evidence summaries and actual validation results. Exclude `.workspace`, model weights, browser profiles, third-party reference packages and generated runtime assets from Git. Preserve unresolved parity items rather than relabeling partial verification as complete.

For rollback during development, rebuild the prior commit into the same unpacked-extension path and reload it. Browser-origin model storage is independent of source files; changing extension identity, profile or uninstalling can remove access to that cache. Do not assume a new installation inherits it.
