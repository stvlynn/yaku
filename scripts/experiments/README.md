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

`node scripts/experiments/preservation-ablation.mjs` compares the production translation instruction with an explicit full-content preservation prefix on five mixed-language fixtures, including numbers, inline markers, protected code positions, and requested Traditional Chinese output. The candidate prefix is supplied through the production request's context field so both variants use the same model/generation path. Raw outputs are evidence; literal token checks do not prove semantic completeness. This experiment requires the complete cached model and an executed-background match just like the other model scripts.

Related targeted experiments use the same profile and record the executed build identity:

- `node scripts/experiments/page-payload.mjs`: UTF-8 DOM/source equality, passive background-message observation, and exact production-request replay.
- `node scripts/experiments/script-variant-ablation.mjs`: original/explicit-English-script/Chinese-script instructions on three Traditional-target fixtures.
- `node scripts/experiments/script-marker-combination.mjs`: actual marker codec, protected code, glossary and Traditional output in one request.
- `node scripts/experiments/source-language-ablation.mjs`: German/English `Gift` and French/English `pain`, with explicit source hints.
- `node scripts/experiments/product-prompt-regression.mjs`: final production behavior through workspace source/target controls and normal page requests, without adding any experimental prompt prefix. It checks German/English `Gift`, Traditional output, inline links/protected code/glossary and exact UTF-8 mixed-source restoration.

Historical prompt contrasts were recorded against background SHA `d469fe2869828f89cb6c992ed3a100cb45a6f717a45fdb56ebfce92522bda71e`, before the measured hints were integrated. Later builds naturally include the winning hints in their production baseline. Compare recorded build identities and prompts when interpreting a new run.

Profiles default to `.workspace/experiments/model-profile`; JSON evidence is written to `.workspace/experiments/results/`. Keep those large, local artifacts out of version control. Never point the harness at your everyday personal Chrome profile. Only one Chrome process may use an experiment profile at a time.

`YAKU_BROWSER_CHANNEL` defaults to `chrome`; an installed compatible alternative can be selected explicitly. Set `YAKU_HEADLESS=false` to observe Chrome interactively. Runtime errors, unsupported adapters, incomplete caches, and download failures cause an explicit nonzero exit. No cloud inference or alternative model is used.

Media experiments use the same explicitly prepared cache and executed-background preflight:

- `node scripts/experiments/reader-batch-real-model.mjs` runs an original local HTTP reader/image fixture through explicit batch authorization, real OCR/model translation, lazy discovery, blank skipping, a stopped/restarted background worker, forbidden-URL rejection and exact image restoration. It does not automate native operating-system menu selection.
- `node scripts/experiments/scoped-media-real-model.mjs` exercises trusted pointer context events on real native video, separate selected-player VTT exports, selection consumption, seek/query retention, provider/resource changes, retired cue refusal and exact host retiming/reused-cue exports. Menu item selection is dispatched through Chrome's existing registered handler. Set `YAKU_VIDEO_FIXTURE` to a local copy of the official [MDN CC0 flower.webm](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm); the default local path is `.workspace/research/flower.webm`. Its JSON sets `completed: true` only after every assertion passes.

Media evidence is written to `.workspace/qa/`; it does not establish authenticated production playback, all advertised platforms/readers, or a fresh model download.
