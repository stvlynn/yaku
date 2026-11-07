# Media and document validation matrix

This matrix separates implementation, small-fixture verification and unverified production coverage. It does not claim complete equivalence with the reference extension.

## Implemented workflows

| Workflow | Evidence exercised | Remaining boundary |
| --- | --- | --- |
| TXT / Markdown / HTML / JSON | Round-trip tests preserve protected Markdown syntax, HTML links, JSON keys and non-string values | Arbitrary encodings, advanced Markdown extensions and every HTML construct are not covered |
| SRT / VTT / ASS / LRC files | Timing, identifiers/settings, protected tags, ASS drawing controls, LRC metadata and bilingual export tested | Every subtitle dialect and malformed-file recovery are not claimed |
| DOCX | Full-paragraph requests; ZIP/XML round trip retains run properties, relationships and binary parts | Target text allocation to differently formatted runs is approximate; semantic emphasis alignment is not guaranteed |
| EPUB | Container/manifest traversal, language metadata, asset preservation, first uncompressed mimetype entry and reload tested | Encrypted EPUB is rejected; broad reader/DRM/layout compatibility is not established |
| Images in workspace | Actual local OCR pixels, boxes/confidence, real HY-MT2 Chinese output, HTML and PNG downloads | Complex backgrounds, vertical/rotated text and OCR correction need broader fixtures |
| Images on a page | Actual registered menu handler, background grant, content message, offscreen OCR/HY-MT2, decodable PNG replacement, exact responsive-attribute restoration | Native operating-system menu item selection was not automated; generic lazy manga-reader adaptation remains separate |
| PDF reading | Actual PDF.js text extraction/rendering and real HY-MT2 Chinese translation; self-contained HTML with original page images | Reading-order recovery for complex columns/formulas is not equivalent to layout reconstruction |
| PDF binary export | Dedicated PDF tests and a real exported reading PDF are retained by the document validation workflow | Export is a reading edition with original-page images and translated text pages, not an editable reconstruction of the original PDF layout |
| Native video TextTracks | Real Chrome VTTCue objects, two real model translations, loaded-cue pretranslation, VTT export retaining 0–5 and 65–70 second timings | Only already loaded cues can be used; no private player endpoint interception or complete-stream guarantee |
| DOM video/meeting captions | Six candidate DOM shapes tested; one synthetic YouTube-host fixture translated/exported through real Chrome and HY-MT2 | All authenticated production playback/call sessions remain unverified |

## Representative DOM adapter coverage

| Candidate | Structural basis | Fixture result | Authenticated production result |
| --- | --- | --- | --- |
| YouTube | Caption-window public DOM examples | Unit and real Chrome/model fixture | Unknown |
| Netflix | Public timed-text DOM examples | Unit fixture | Unknown |
| Udemy | Caption-text CSS-substring candidate | Unit fixture; selector remains an inference | Unknown |
| Google Meet | Public caption-region and locale-independent container observations | Unit fixtures including speaker handling | Unknown |
| Zoom web | Public live-caption item observations | Unit fixture including speaker handling | Unknown |
| Teams web | Public caption-text data attributes | Unit fixture including speaker handling | Unknown |

The [full reference inventory](feature-parity.md) includes 214 advertised subtitle platforms. This implementation does not mark that list as supported. Each injected frame operates on its own document; a context-menu command targets the supplied frame ID. Caption visibility must already be enabled by the platform/user. No microphone capture, ASR, cloud caption generation or automatic call interaction is implemented.

DOM exports are explicitly named `observed-captions`; VTT includes a NOTE explaining approximate timing and incomplete coverage. Meeting timestamps are relative to observation, and video DOM timestamps use observed player time. Native tracks retain actual source cue times. Appearance changes must retain already captured history, including captions that have left the DOM. Language or glossary changes retranslate retained source history; cue IDs remain stable across refreshes. Focused unit regressions cover those requirements.

## Reproducible checks and local evidence

Maintained tests:

- `tests/document-translation.test.ts`
- `tests/image-translation.test.ts` and `tests/image-overlay.test.ts`
- `tests/pdf-translation.test.ts`
- `tests/video-subtitles.test.ts` and `tests/video-subtitles-dom.test.ts`
- `tests/e2e/image-pdf.spec.ts` and `tests/e2e/page-media.spec.ts`

Real-model browser tests require `YAKU_MODEL_PROFILE` to identify an explicitly prepared test profile. OCR integration uses local English traineddata when available; its actual recognition case was executed during this validation. The source PDF is an original generated fixture in `tests/fixtures/reading-sample.pdf`. Native PNG checks cover dimensions, out-of-region pixel preservation, clamped bounds, transparent backgrounds and rejection of translations that cannot fit legibly.

Ignored local evidence under `.workspace/qa/` includes `words.translated.png`, `reading.translated.html`, `reading.translated.pdf`, `page-image.translated.png`, translated/restored page screenshots, `native-captions.real-model.vtt`, `observed-captions.real-model.vtt`, and `subtitle-real-model-result.json`. The DOM caption screenshot explicitly labels itself as a synthetic fixture rather than production playback. A separate CSP probe recorded no remote executable script/worker requests for the image/PDF pipeline; traineddata transport is data, while OCR/PDF worker/core code is packaged locally.

Page-media testing dispatches the extension's existing registered context-menu event through the debugger, then exercises the normal production route. It does not add test-only product messages. Fixture URLs include unique nonces and assert exactly one matching browser tab; this avoids inadvertently targeting an old restored tab in a persistent profile.

Primary-source links and the static-versus-runtime evidence distinction are retained in [feature parity research](feature-parity.md).
