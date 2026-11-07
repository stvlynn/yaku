# Temporary translation editing, comparison and sharing

## Scope and evidence strength

This is a clean-room behavior specification from the supplied Immersive Translate 1.34.2 package, existing retained REA facts and official product history. No proprietary script was executed, no original-extension editing/share journey was driven, and no upload or sharing action was performed. Static availability, documented historical behavior and observed runtime behavior are separate claims.

The complete existing bundle is `.workspace/research/rea-evidence-editing.json` (11 records). Its parent application analysis is `ev_d7133ad51f4a8539224f0a5e9fc2224847cdd1376226036bd9ac031dba220a84`, covering selected `popup.js` and `background.js` only, with 40,216 semantic unknowns and 51 unselected files. The retained editing trace `ev_7c12921ac8512903a6480359d79b2b508ecebd20c158b2f4b9b523041975884c` has **zero seed matches, zero traversed nodes/relations and 39,708 relevant unknowns**. It does not demonstrate an editing call chain or feature absence. Repeating that oversized trace was unnecessary.

A bounded authenticated file-backed REA view, `ev_553e0d4f37930aa26cd1e385152dccbaef87dc5163b62a92031c8f4b655f279c`, confirms that `content_main.js` was inventoried at the digest below but excluded from the selected semantic analysis. Its asset observation is `jag_observation_374e3e3ef2d28c2077f4aab393edaeb14add8ae0b41219873aea395663115d64`; its separate unavailable-analysis observation is `jag_observation_1adb8ee460b0be4a4faa7c4afb87ae649c046183c9bd37d75c14cc2978868a1f`. The summary view `ev_5a5117defea4689b1575deea0ab968bb61d929d82d1e84489c809b7cca9ed058` preserves the parent coverage. These view records are exported to `.workspace/research/rea-editing-views.json`.

The feature facts below additionally use bounded, inert inspection of specific function regions and JSON values, not recovered original source or a complete REA reachability claim. Offsets are zero-based **UTF-16 code units** in decoded JavaScript, not byte offsets. File digests are SHA-256 of the UTF-8 bytes.

| Evidence label | Supplied package member | SHA-256                                                            |
| -------------- | ----------------------- | ------------------------------------------------------------------ |
| C              | `content_main.js`       | `10f6ec883d76f38ae269d297a20b44551a88894fbc168a06db0c07065e0777a6` |
| P              | `popup.js`              | `1b78cd9dd4473d2a966528a2d391a53cc8400332b867ddd4e0860633c405470d` |
| D              | `default_config.json`   | `622e4c836ad6320a07338595c59213a6ae9c2757e1a9fc29fb952d6b3f219910` |
| L              | `locales.json`          | `6e03aa62c5ac437014d8a3e5227089dd7ee044b8124b38c1e07d0c30237929e6` |

## Findings and reference journeys

### Temporary editing is a page interaction

Both packaged default configurations set `enableEditTranslation` to false. The English locale contains enable/disable labels and `Temporary translation editing`; the current inspected More drawer uses the latter as a switch. The official changelog records adding temporary editing to the panel's More entry in version 1.4.12. This establishes the documented entry, not persistence semantics. [Official changelog](https://immersivetranslate.com/en/docs/CHANGELOG/?force=1#1412).

Static drawer behavior queries the content frame's current edit state on opening and sends an explicit boolean when the switch changes. The content controller stores the flag in a JavaScript `Map` memory backend, updates the active rendering context, and adds/removes `contenteditable` on existing `[data-imt-p]` nodes. Later translation rendering also checks the flag and enables editability on newly rendered output. The off branch removes editability; that branch does not restore earlier text. These are static operation facts, not a demonstrated typing/undo journey. Evidence: C offsets 180991, 2349334, 2933909, 2936562 and 4221240; P offsets 1880785 and 1883439.

The supported user-level reading is: translate a page, open More, enable temporary editing, edit a rendered translation, then turn editing off. The memory backend supports a document-lifetime interpretation rather than a durable preference; reload, BFCache, frame transitions and other rendering observers were not exercised. There is no demonstrated evidence here that edited text updates a glossary, model cache, cloud record, downloaded document or later translation result. Merely seeing an editable DOM node does not establish any of those storage contracts.

### Translation Comparison is specifically context versus baseline

`enableContextDiffPreview` is also false in packaged defaults. Its English `contextDiffPreview` locale label is `Translation Comparison`. This must not be conflated with ordinary source/translation bilingual reading, comparison between translation providers, or an edit revision history.

The inspected AI-context control builds a link to the current page with `imt_context_preview=1` and `_immersive_translate_auto_translate=1`, when comparison information is available. Its surrounding UI includes service capability and membership checks. The source's preview helper recognizes the query flag or the configuration flag. In the article path, comparison dispatch runs a context-enabled translation and a baseline with context/terminology state removed; the baseline also disables its ordinary cache path. Results are paired by sentence identity, and rendering produces two adjacent translation panels. The contextual result highlights differences against the baseline; the baseline is shown separately. A provider-level flag path also contains with-context/without-context comparison. The two paths are not evidence of a universal multi-service comparison tool. Evidence: C offsets 153798, 1356417, 1679797, 2252502, 2337463, 2344114 and 2901762.

The corresponding journey is: enable eligible AI context, open its information/comparison link, inspect the contextual and baseline translations of the same article. No successful reference runtime comparison, entitlement result, cancellation behavior, cost accounting, missing-result display or edit-to-comparison interaction was captured. Locale labels alone do not prove those details.

### Current card sharing and historical page snapshots differ

The official history first described a public link for a bilingual translated page in 0.11.5, then changed the format to a page snapshot. Importantly, version **1.20.6 removed the Snapshot entry from the panel**. A historical sharing tutorial therefore cannot prove a snapshot button still exists in the inspected 1.34.2 panel. [Official changelog](https://immersivetranslate.com/en/docs/CHANGELOG/?force=1#1206-release-2025-08-11).

The current package instead contains an X-post bilingual-card adapter and quick entry. Eligibility checks require a recognized post URL and both original and translated text, without a translation error. The packaged general rule disables card sharing; actual site activation depends on applicable rules and was not observed. Generation builds an image using original/translated post text, author/media metadata and a QR destination. The inspected image preview has Save; a native/mobile bridge conditionally exposes Share. Desktop save uses a PNG download. Although locale data also defines Copy and Copy Base64, those strings do not prove corresponding buttons in this preview. Evidence: D `generalRule.shareCardRule`; C offsets 2753135, 3889707, 3894269 and 4213715.

The QR destination builder contains an original-post URL in a web redirect parameter, not the edited translation text or a demonstrated uploaded snapshot. The inspected renderer uses a canvas, and asset preparation can fetch avatars/media with omitted credentials; base64 output does not prove a fully offline/no-network journey. Existing-translation extraction could include current rendered edits, but that effect was not verified. Evidence: C offsets 3883099, 3892900 and 3895742.

A whole-page HTML snapshot helper also remains in the package. It clones page content and selected styling, with configured removal selectors and optional iframe handling. Its inspected callers attach that HTML to diagnostic/feedback reports. Presence of this helper or the legacy empty `shareToDraft` shortcut is not proof of a current public snapshot-share command. Evidence: C offsets 2226018, 2464077 and 2619253; D `shortcuts.shareToDraft`.

## Clean-room product contract

The following is a proposed independent contract, not a claim that every detail was observed in the reference. It contains user actions and outcomes only; it does not copy package code, UI artwork, selectors or private protocols.

| Journey             | User action and required outcome                                                                                                                                                                                                                                                     | Boundary                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Temporary editing   | Explicitly enable editing for the current reading session; clearly indicate the active state; change translation text while source content remains intact; disable editing without silently changing the current edited text. Newly translated paragraphs follow the current switch. | Turning this into durable translation memory, source editing or a cloud save is separate work and must not be implied.                                         |
| Edit lifecycle      | Preserve a clear distinction between original source, generated translation and user-edited translation. Copy/export should state and use the currently displayed result when offered. Restore returns to source; retranslation must not silently masquerade as retaining edits.     | A persistence/retranslation policy requires an explicit product decision and tests, because the reference evidence does not settle it.                         |
| Context comparison  | Label two genuine results of the same source/model/languages: the configured context/terminology result and a context-free baseline. Show actual textual differences and identify a failed/missing result rather than duplicating one output into both columns.                      | Source-versus-translation reading, edited-versus-generated comparison and provider comparison need distinct names; none alone reproduces `contextDiffPreview`. |
| Sharing an artifact | Make the payload concrete before the action: a PNG card, a local reading document or a hosted snapshot/link. An image embeds the displayed text; a link to the original page does not thereby preserve edits.                                                                        | Creating a public hosted copy is not the same action as local download. No upload, remote account or public URL is established by the local model requirement. |
| Safe rendering      | Edited text and model results remain data. Preserve source/inline relationships, link destinations, protected code/formulas and media ownership; reject malformed structure rather than rendering model-supplied HTML.                                                               | The native `contenteditable` fact is not permission to copy arbitrary pasted HTML or bypass the shared strict marker policy.                                   |

With the present single local HY-MT2 engine, a terminology/context ablation could be an honest comparison when both variants are actually generated. It should not be labeled multi-engine comparison, and it must not silently introduce a cloud service. A local export can provide a reviewable sharing artifact without claiming the removed historical hosted-snapshot workflow. These are product adaptations, not assertions of reference equivalence.

## Acceptance still required

1. Original-runtime typing, selection, IME, paste, undo/redo and keyboard-focus behavior in temporary editing; whether source/links remain unaffected.
2. Switch-off, popup reopen, new dynamic paragraphs, restore, target/service changes, SPA routes, reload, iframe and BFCache behavior; exact edit lifetime and whether any cache is updated.
3. A real eligible comparison with observed requests, result pairing, labels, differences, failure/cancellation behavior and evidence that the two outcomes are genuinely distinct computations.
4. An actual enabled X card path, preview/save/native sharing and its complete network/payload behavior, including whether current manual edits enter the exported image.
5. Any present public-snapshot workflow after panel removal, with explicit upload/retention/deletion semantics. Until observed, historical documentation and feedback snapshots are insufficient.

No original-extension runtime outcome or end-to-end parity acceptance is claimed by this read-only investigation.
