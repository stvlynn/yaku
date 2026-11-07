# Page and context interaction audit

## Evidence boundaries

This audit compares the independent implementation with the core page/context interactions in [the feature inventory](feature-parity.md). Unit tests use controlled translator outputs to exercise DOM ownership and editor transactions; those outputs are not model-quality evidence. The language and rendering experiments below ran in installed Chrome. The final production context/React browser driver is `tests/e2e/context-page.spec.ts`; its acceptance status must come from an actual run against the centralized build.

## Defects reproduced and corrected

Three focused tests first reproduced input-data corruption: translation started during IME composition; a pending result overwrote text when composition had begun without changing its visible value yet; and the explicit Undo button overwrote a newer user edit. Editor state now includes composition status, edit revisions, source signatures, and original selections/nodes. New edits cancel pending input requests. Native setters are used for text inputs, with cancelable `beforeinput` before replacement and composed `input` after it. Explicit undo emits `historyUndo` and restores selection only while the translated state is still current. This does not claim insertion into the operating system/browser Ctrl+Z history stack. [InputEvent.isComposing](https://developer.mozilla.org/en-US/docs/Web/API/InputEvent/isComposing) and [beforeinput](https://developer.mozilla.org/en-US/docs/Web/API/Element/beforeinput_event) define the relevant browser boundaries.

The focused tracker follows active elements into open shadow roots and requires the owning document to have focus, so a broadcast input command cannot change a previously focused editor in another frame. Read-only, disabled, password, non-text input types, excluded sites/elements, and protected non-editable editor regions are not overwritten. Basic rich contenteditable prose uses the shared marker codec to retain paragraph/inline structure; original node objects are retained for explicit undo. Editors containing non-editable embedded widgets receive an explicit safety error rather than destructive flattening. This is not an adapter for every proprietary editor model.

Selection commands now use the live selection rather than a stale mouse snapshot. Hover reads source text without appending injected translations to its prompt, respects exclusions, ignores IME/AltGr/key repeats, and toggles an existing result on repeated Alt. Selection/result text uses `dir=auto`. Both workflows use the owning frame's DOM.

The local speech control handles delayed [voiceschanged](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/voiceschanged_event), selects only matching [localService](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService) voices, and never substitutes a remote or wrong-language voice. Voice-list availability and actual pronunciation are separate browser/OS observations. No available local voice means no listen control, not a cloud speech request.

## React source ownership and rendering ablation

The earlier renderer wrapped original Text nodes, changing their parents. This reproduces the reconciliation problem described by React's [DOM mutation report](https://github.com/react/react/issues/11538) and [component removal report](https://github.com/react/react/issues/26048). A real React 19 `createRoot` fixture with conditional text followed by a `strong` sibling failed: the Text parent changed, and conditional removal produced `NotFoundError`.

The selected renderer does not reparent source nodes. Bilingual mode inserts the translated target before or after the original content. Translation-only mode temporarily empties owned source Text data and hides original inline/protected elements, storing original values and styles. Restore writes back only still-owned empty connected nodes and preserves host-authored changes, including an intentional empty value. React may remove or insert its original Text nodes normally. No DOM prototype is patched and no reconciliation exception is swallowed.

An installed-Chrome geometry fixture measured these alternatives with the same 310-pixel source paragraph and a 28-pixel synthetic target. This is a rendering experiment, not model inference:

| Strategy | Result height | Original Text parent retained |
| --- | --- | --- |
| Hidden wrappers | 28 px | No |
| Transparent custom highlights | 338 px | Yes |
| Empty owned Text plus temporarily hidden original inline elements | 28 px | Yes |

`scripts/experiments/rendering-strategies.mjs` reproduces the geometry measurement. Four real React reconciler tests cover conditional deletion and insertion before a sibling in bilingual/translation-only modes with before/after placement. Additional cases cover host empty-value changes and mode changes while language detection is pending. Appearance changes update the existing target's position/fonts/line height/colors without entering the translation settings key.

## Protected code and formula data

Omitting excluded inline code from the encoded paragraph removed meaning from sentences such as `Run npm install now.` The shared codec now emits empty `yaku-keep` markers for visible protected code/formulas. Their contents never enter the model prompt. Decoding restores a static allowlisted copy of the original data at the translated marker position; active tags, event attributes, and unsafe resource-bearing attributes are not copied. MathML retains its namespace. The original nodes remain under their original parents. Changed or missing protected markers produce an explicit error, and a source-content snapshot invalidates stale protected copies.

Actual HY-MT2 probes returned `现在运行 <yaku-keep id="0"></yaku-keep>。` and `该公式 <yaku-keep id="0"></yaku-keep>适用于所有示例。`, preserving each empty marker once. The second source said “both examples”; its broader “all examples” wording remains a model-quality defect. Marker preservation does not guarantee semantic precision.

## Same-language detection ablation

`scripts/experiments/language-detection.mjs` ran Chrome's actual [`i18n.detectLanguage`](https://developer.chrome.com/docs/extensions/reference/api/i18n) in a fresh isolated profile without a model. HTML language metadata was recorded independently from content detection.

| Input | Chrome result |
| --- | --- |
| Long English paragraph | Reliable `en`, 100% |
| French paragraph mislabeled `html.lang=en` | Reliable `fr`, 100% |
| Mixed English/Chinese paragraph | Reliable `zh` 61%, `en` 38% |
| `Gift` | Unreliable `no`, 100% |
| `Hello world.` | Unreliable `ky`, 100% |
| Simplified Chinese paragraph | Reliable `zh`, 100% |
| Traditional Chinese paragraph | Reliable `zh`, 100% |

Therefore metadata alone never skips translation. Automatic-source paragraphs skip only with a reliable single 100% candidate whose non-Chinese language code exactly matches the target. Unknown, mixed, short/unreliable, explicitly selected-source, and script-ambiguous Chinese cases retain normal translation. Chinese variants are not merged because this detector did not distinguish them. Skipped entries are invalidated on source/target/glossary changes and are not redetected for unrelated mutations.

## Lifecycle and remaining browser acceptance

The page controller observes scope replacement and open shadow roots, invalidates language/glossary changes, and deduplicates SPA route notifications. It follows Navigation API events where available and checks route changes during DOM mutations; ordinary fragment anchors do not trigger full retranslation. Restore cancels outstanding work and stays restored after later route changes. Closed roots and an existing host acquiring a new shadow root without any observable outer mutation retain the documented platform boundaries.

Focused context/page/React tests and type checking passed before centralized browser acceptance. The real-browser driver uses unique nonce URLs and asserts a unique target tab, because persistent profiles can restore old tabs with the same URL. It uses production closed shadow roots through CDP accessibility/box coordinates, native Chrome IME protocol events, real model inference, actual iframe focus, RTL/table/exclusion fixtures, and React 19. It does not call `runtime.reload`: CDP-loaded temporary extensions become disabled by that operation in the tested Chrome build. Successful browser results, installed local voice availability, and any OS-IME/audio limitations must be recorded separately after that run.
