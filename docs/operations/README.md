# Operations

Use Node.js 24 with pnpm 9. The lockfile is committed. `pnpm install --frozen-lockfile` prepares WXT types; `pnpm assets` copies version-matched local workers and WASM. `pnpm build` builds the Chrome MV3 extension under `.output/chrome-mv3`; `pnpm zip` creates the distribution archive.

`pnpm dev` runs WXT development. For manual testing, load the unpacked production directory in Chrome developer mode. The first-use workflow prepares the local model and performs a real practice translation.

Model data lives in browser-origin OPFS, not in the extension package or repository. OCR language data downloads separately. Runtime code stays packaged under the extension CSP. Use settings to inspect/remove model data; reinstallation can remove browser-owned storage.

`pnpm check`, `pnpm test`, and `pnpm build` run in CI. Real GPU/Chrome acceptance is performed separately on a capable host; see [validation](../quality/validation.md). Test scripts create separate browser profiles and never operate on the user's personal Chrome profile.

The Windows test environment uses Chrome's explicit extension-debugging protocol to load unpacked extensions into isolated headless profiles. This is a test launch option, not a flag users need for normal extension installation.

Reusing an isolated profile after rebuilding can retain an earlier extension background service worker even when the unpacked files are current. This was observed through `Debugger.getScriptSource`: the executing worker lacked new handlers present on disk. `ServiceWorker.updateRegistration` did not refresh that worker in the observed Chrome session. Acceptance must verify the executing background source, rather than merely fetch the extension URL or inspect the output directory. Use a fresh isolated profile for a changed build when necessary. Explicitly seeded model data is permitted for runtime regression and must be reported as such; it is not first-download evidence. Keep the independently recorded fresh production-download test separate.
