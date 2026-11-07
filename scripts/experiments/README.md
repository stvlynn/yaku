# Real model experiments

These scripts run the built MV3 extension in installed Chrome with its real WebGPU model. They do not stub model output, redirect Hugging Face requests, or bundle weights. They are intentionally separate from fast deterministic tests.

Install the repository dependencies and run `pnpm build` first. Use a Chrome version supporting the CDP `Extensions.loadUnpacked` command and WebGPU with `shader-f16`. The harness enables Chrome's extension debugging switch to load the unpacked extension; it does not override GPU settings.

Run these commands sequentially:

```powershell
# Optional: use an isolated persistent profile of your choice.
$env:YAKU_MODEL_PROFILE = Join-Path (Get-Location) '.workspace/experiments/model-profile'
pnpm experiment:download
pnpm experiment:offline
pnpm experiment:markers
```

The download experiment requires a fresh empty profile. It opens welcome, clicks Get started, observes the real production download, cancels once after progress begins, retries through the UI, waits for readiness, and performs the welcome practice translation. It downloads about 1.38 GB into extension-origin OPFS. If interrupted before completion, run `pnpm experiment:download --resume` with the same profile. A completed profile is preserved for the other experiments; do not run the fresh-download experiment against a completed profile.

The offline experiment starts with that complete cache, disables networking, prepares and translates, closes the entire offscreen document and dedicated worker, then translates again after automatic recreation. It preserves the cache.

The marker ablation compares whole paragraphs, individual inline fragments with paragraph context, and whole paragraphs with stable inline tags. It records actual outputs and measured timing, plus a tag-multiset check. This check is not a translation-quality score or the production parser's full nesting validation. Compare the raw outputs; the script does not fabricate expected translations.

The broader page/context acceptance driver uses the same complete profile:

```powershell
pnpm exec playwright test tests/e2e/context-page.spec.ts
```

It bundles a local React fixture, intercepts only its synthetic reading pages, and invokes the production model. Unique fixture URLs avoid collisions with restored tabs. Production closed-shadow controls are located through Chrome accessibility nodes and clicked by their DOM box coordinates. Chrome's native IME protocol exercises composition events; explicit Undo is tested separately from the operating system's Ctrl+Z history. Local voice availability is recorded, but headless execution cannot establish audible pronunciation. Evidence is written to `.workspace/qa/context-page-real-model.json`. The driver does not reload the temporary extension or make closed roots open.

The shared harness and page driver compare `Debugger.getScriptSource` with the built background file before inference. A persistent Chrome profile can retain an older extension service worker despite loading the same unpacked directory again. A mismatch stops the experiment explicitly. Use a fresh dedicated profile for a new build; keep production-download evidence separate from any explicitly seeded integration fixture. `YAKU_PAGE_ONLY=1` isolates page/React acceptance while skipping editor/selection phases; unset it for the complete context driver.

Profiles default to `.workspace/experiments/model-profile`; JSON evidence is written to `.workspace/experiments/results/`. Keep those large, local artifacts out of version control. Never point the harness at your everyday personal Chrome profile. Only one Chrome process may use an experiment profile at a time.

`YAKU_BROWSER_CHANNEL` defaults to `chrome`; an installed compatible alternative can be selected explicitly. Set `YAKU_HEADLESS=false` to observe Chrome interactively. Runtime errors, unsupported adapters, incomplete caches, and download failures cause an explicit nonzero exit. No cloud inference or alternative model is used.
