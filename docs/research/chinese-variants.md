# Chinese script normalization research

This is a read-only dependency and evaluation study. No dependency, model prompt, product code, or frozen media behavior was changed. Package JavaScript was read as archive data, not imported or executed.

## Verified candidate

The official npm registry's stable `opencc-js` release is **1.4.2**; `1.5.0-beta.0` is a separate prerelease. The stable package has no runtime dependencies. The repository's main branch currently describes the prerelease, so production research must use the stable tag/package rather than silently treating main as stable. [Stable documentation](https://github.com/nk2028/opencc-js/tree/v1.4.2), [official package metadata](https://registry.npmjs.org/opencc-js/1.4.2).

OpenCC-js is pure JavaScript with pre-generated dictionaries in the package, suitable for browser bundling without a native addon, WASM module, runtime dictionary fetch, or CDN script. Upstream OpenCC's `opencc` npm package uses a native Node addon and is a different deployment choice. Existing project dependencies and both available pnpm lockfiles contain no OpenCC or other Chinese-variant converter. Transformers.js supplies model inference; it does not supply this normalization layer. [OpenCC-js data/runtime documentation](https://github.com/nk2028/opencc-js/blob/v1.4.2/README.md), [OpenCC deployment documentation](https://github.com/BYVoid/OpenCC#nodejs).

The stable package metadata identifies the combined license as `MIT AND Apache-2.0`: JavaScript code is MIT; bundled dictionary derivatives are Apache-2.0. A future addition must retain the supplied MIT notice, Apache license and third-party attribution, including any applicable notices. The inspected archive contains `LICENSE`, `THIRD_PARTY_LICENSES.md`, and `LICENSES/Apache-2.0.txt`. This is a report of the package's declared license material, not a separate legal assessment. [Code license](https://github.com/nk2028/opencc-js/blob/v1.4.2/LICENSE), [dictionary attribution](https://github.com/nk2028/opencc-js/blob/v1.4.2/THIRD_PARTY_LICENSES.md).

## Measured artifact sizes

The official 1.4.2 tarball was downloaded into ignored research storage and parsed without extracting/running package code. Its SHA-512 equals the npm registry integrity value. Measurements below use UTF-8 file bytes and Node gzip/Brotli defaults; compressed columns are comparison measurements, not promises about the final WXT ZIP.

| Published ESM entry                                | Raw bytes | Gzip bytes | Brotli bytes |
| -------------------------------------------------- | --------: | ---------: | -----------: |
| `dist/esm/full.js`                                 | 1,195,200 |    512,513 |      373,414 |
| `dist/esm/cn2t.js`                                 | 1,100,383 |    466,795 |      347,368 |
| `dist/esm/t2cn.js`                                 |   109,060 |     54,695 |       37,572 |
| `dist/esm-lib/core.js` alone, without dictionaries |    15,380 |      3,989 |        3,399 |

The whole tarball is 2,602,149 bytes and npm reports 6,094,454 unpacked bytes across multiple formats/entries; neither number is the necessary runtime payload. The `cn2t` and `t2cn` bundles include more regional conversions than just generic script conversion. Core/dictionary module exports allow narrower bundling, but a custom tree-shaken build was not created or measured. Avoid copying dictionary literals or reconstructing the upstream conversion algorithm just to trim a small part of the bundle. Initialization latency, trie memory, browser worker compatibility in this extension, and final bundle deduplication remain unmeasured. The archive integrity and local raw measurements are retained in `.workspace/research/opencc-package-static.json`.

## Conversion semantics

Stable package core and presets were inspected: `{from:'cn',to:'t'}` resolves `s2t`; `{from:'t',to:'cn'}` resolves `t2s`. These are supported configurations, not a handwritten character substitution table.

| Requested policy                  | Candidate configuration       | Boundary                                                                                    |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| Generic Simplified to Traditional | `s2t` / `cn` to `t`           | OpenCC's intermediate Traditional form; not a guarantee of a regional orthographic standard |
| Generic Traditional to Simplified | `t2s` / `t` to `cn`           | Many-to-one forms lose distinctions; exact round trips are not a valid quality requirement  |
| Taiwan glyph conventions          | `s2tw`                        | Regional glyph layer beyond the generic form                                                |
| Taiwan vocabulary and glyphs      | `s2twp`                       | Also changes regional terms; broader than a script guarantee                                |
| Hong Kong glyph conventions       | `s2hk`                        | Distinct regional target                                                                    |
| Regional reverse normalization    | `tw2s`, `tw2sp`, `hk2s`, etc. | Must match the explicitly selected regional policy                                          |

The product currently labels `zh-Hant` simply Traditional Chinese, with no Taiwan/Hong Kong preference. Generic `s2t` is therefore a candidate to evaluate without silently introducing regional vocabulary replacement. This is an application-policy inference, not a claim that OpenCC's intermediate form equals the BCP 47 language tag. Upstream explicitly distinguishes these concepts. [OpenCC design principles](https://github.com/BYVoid/OpenCC/blob/master/DESIGN_PRINCIPLES.md), [configuration list](https://github.com/BYVoid/OpenCC#configurations-配置文件).

OpenCC uses character/phrase dictionaries and conversion chains rather than deep sentence semantics. It cannot repair omissions, mistranslations, lost inline structure, or arbitrary ambiguous names. OpenCC-js intentionally omits upstream `TSCharactersExt` mappings that risk unsupported glyph display; exact parity with native OpenCC is not promised. Normalizing before presenting output is a candidate deterministic script layer, not proof of semantically correct translation. [Stable implementation scope](https://github.com/nk2028/opencc-js/blob/v1.4.2/README.md).

## Fixed comparison plan

The model agent reported a genuine Simplified output for a requested Traditional target. A separate apparent mixed-sentence omission was traced to a GBK-decoded test fixture; do not combine that fixture failure with evidence of model omission. This document did not run new model/converter executions.

Compare four arms on the same verified model/build, deterministic generation options and UTF-8 corpus:

1. Current production prompt/output.
2. Explicit target-script instruction, without a converter.
3. Production output followed by the pinned generic converter.
4. Explicit script instruction followed by the same converter.

Keep both raw model output and normalized output, along with prompt bytes, request metadata, elapsed time and converter version/configuration. Assert the input's expected Unicode code points after file reading; save UTF-8 JSON rather than relying on shell default encoding. Reuse the same verified model/profile serially and run the existing executed-background identity preflight. Model temperature determinism does not imply universal script compliance; a prompt-only pass on this corpus is bounded evidence.

Two corpus groups separate concerns: direct Chinese script conversion tests check orthography/context; English-to-Chinese model cases check whether semantic coverage survives postprocessing. Suggested fixed cases:

| Case                               | Input or protected payload                                                         | Required assessment                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Basic script                       | `汉字、语言、电脑、云端、网络`                                                     | Known distinguishing characters actually change for the selected target                                                       |
| Phrase ambiguity                   | `头发与发展；皇后后来出门；干净、干杯、干活、干涉；里面与公里`                     | Human-reviewed phrase choices; document allowed variants instead of assuming character-by-character mappings                  |
| Already Traditional / mixed script | `頭髮與发展；皇后後來出門。`                                                       | Requested output script, no dropped clauses; test idempotence separately                                                      |
| Lossy reverse distinctions         | `發展與頭髮；皇后與後方`                                                           | Correct reverse direction; do not assert perfect Simplified-to-Traditional recovery                                           |
| Regional vocabulary                | `软件、鼠标、出租车、打印机、视频`                                                 | Generic script conversion must not be scored as Taiwan terminology conversion; compare regional modes separately if requested |
| English semantic source            | `The software update fixes the network connection. Keep the file at version 2.4.`  | Translation covers both sentences, numbers and meaning, independently of script normalization                                 |
| Inline code                        | `const 开发 = "发型"; // 后台`                                                     | Exact protected code bytes remain unchanged; prose around code can change                                                     |
| URLs and identifiers               | `https://example.test/软件/开发?q=头发#后台`, `user+后台@example.test`             | Exact URL/email bytes, including literal Han path/query segments, remain unchanged                                            |
| Markup                             | `<a href="/软件">LINK_0</a>`, existing inline placeholders, JSON keys              | Only permitted human text changes; attributes/keys/token identity and order remain intact                                     |
| Explicit glossary output           | A custom brand/term whose desired spelling contains `后` or another ambiguous form | Exact chosen glossary policy must be defined; blanket conversion must not silently override explicit user spelling            |
| Non-Chinese targets                | English, Japanese with Kanji, and Korean output                                    | No Chinese converter runs simply because CJK characters appear                                                                |
| Rare/name cases                    | Personal/place names, supplementary Han and compatibility forms                    | Record uncertain outputs and font behavior; no blanket complete-coverage claim                                                |

Code/URL protection is a separate acceptance requirement. A converter operates on strings and can change Han characters inside a URL or identifier. Existing page/document code already owns structured inline protection, but `TranslationRequest` is also used with plain strings and has no general protected-range contract. Therefore applying a converter indiscriminately to a complete serialized response/document is unsafe. A later design must establish where protected spans are excluded or masked, when they are restored, and how explicit glossary spellings are handled, reusing existing protection instead of creating a second DOM translator. This research does not select or implement that insertion point.

Score requested-script compliance, exact protected-span equality, semantic clause preservation, numeric/placeholder integrity, phrase errors and regional drift separately. Record cold/warm converter initialization, runtime memory, final WXT bytes, cancellation behavior and offline no-network operation before enabling a production layer. A script converter can make configured mappings repeatable; it cannot establish correctness outside its dictionaries or justify claims that all Traditional writing conventions are covered.
