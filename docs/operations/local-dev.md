# Local development

Install Node.js 24 and pnpm 9, then run:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

No database, application server, account or API key is needed. WXT launches the development extension. Production browser acceptance uses `pnpm build` and the unpacked `.output/chrome-mv3` directory.

The local model requires a WebGPU adapter with shader-f16 and sufficient memory. First-use setup downloads approximately 1.38 GB; subsequent loads use OPFS. Model and OCR language data are not bundled in Git. JavaScript and WASM assets are copied from locked dependencies by `pnpm assets`.

```sh
pnpm check
pnpm lint
pnpm test
pnpm test:e2e
```

Real model tests require a prepared isolated browser profile through `YAKU_MODEL_PROFILE`. See [experiment instructions](../../scripts/experiments/README.md) to reproduce a fresh production download, cancellation/retry, marker ablation and offline worker reload. Tests that use synthetic translators explicitly validate structure rather than model quality.

On the managed Windows environment, sandboxed pnpm links can produce false module-resolution errors. Run authorized build/test commands with normal filesystem access; do not patch library imports to hide that environment issue.
