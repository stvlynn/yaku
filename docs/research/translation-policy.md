# Source-language and temporary-domain policies

## Evidence and limits

This specification extends the inventory in [feature parity](feature-parity.md). The inspected reference is the extracted 1.34.2 package under `.workspace/research/package`; existing retained REA analysis records partial static coverage. Package scripts were read as inert text. The following observations establish available configuration and syntax, not successful reference runtime behavior.

- `default_config.json` contains empty `translationLanguagePattern.matches` and `excludeMatches`, and `tempTranslateDomainMinutes: 0`.
- English localization describes language-based automatic translation, states that a never-translate website rule takes priority over an always-translate language, and describes never-translate languages as paragraph exclusions.
- Static matching syntax checks excluded languages before included languages. The paragraph path passes language exclusions to its detector; an explicit force path omits them.
- Static temporary-domain syntax stores an exact hostname and epoch expiration. Manual page translation can create an activation when the duration is positive; an existing unexpired record is not extended. Effective settings ignore expired records.
- The reference options list durations of disabled, 5, 10, 15, 30 and 60 minutes. Its source-language-by-URL configuration is separate; target-language switching is not implied by an always-source-language rule.

No reference runtime precedence matrix, restart/clock-change behavior or expiry-boundary interaction was exercised for these settings. The policy below is an explicit Yaku contract rather than an assertion of undocumented original behavior.

## Accepted implementation contract

Settings add `alwaysSourceLanguages: string[]`, `neverSourceLanguages: string[]`, and `temporaryDomainMinutes: 0 | 5 | 10 | 15 | 30 | 60`, with empty lists and zero duration by default. Language entries use the existing supported language codes, excluding `auto`. A language appearing in both lists resolves to never; import does not require a separate approval to express this conflict.

A pure entity helper resolves an observation consisting of a language code and reliability flag to `always`, `never` or `default`. Missing, unknown, automatic or unreliable observations resolve to default. A declared source language may be supplied as reliable by its caller. HTML metadata alone does not establish reliability. The source-rule UI exposes generic Chinese (`zh`), reflecting Chrome CLD's observed result; it does not claim automatic Simplified/Traditional identification. Output-language choices remain independent.

For automatic page startup, explicit never-site wins first, then a reliably matched never-source language. Otherwise site-always, an unexpired exact-hostname activation, always-source or global automatic translation can enable startup. A language allow list adds automatic triggers; it is not an implicit whitelist that disables unrelated explicit site rules. Reliable paragraph-language exclusions apply during page reading through the page renderer. Direct selection/input actions remain available. These helpers do not run the detector or initiate translation themselves.

Root orchestration owns temporary grants in separate local storage, not the Settings snapshot. A grant contains an exact hostname and `expiresAt` epoch milliseconds; it does not implicitly include subdomains, sibling domains or ports as separate hostname identities. Only a top-frame manual page action can create a grant; a broadcast must not activate a third-party iframe hostname. Accepting a real manual page-translate action starts a configured grant without waiting for inference to complete. Restore, cancel and failed preflight actions do not create one. Repeated translation during its active interval does not slide expiry. Explicit Stop removes it. Expiry prevents future automatic startup and does not restore already displayed translations or interrupt an active reading session.

Temporary grants stay local to the browser profile and are not synchronized or included in Settings JSON. The duration preference and language lists are ordinary validated preferences and participate in Settings import/export/reset and complete sync snapshots. Migration must preserve existing appearance and named glossaries when reading an older snapshot; an older client must not silently delete new policy fields.

## UI and ownership

Languages settings expose two compact lists using the existing language choices, with direct add/remove actions. Website settings expose a duration choice including Disabled. No account, confirmation modal or unrelated capability is required. Popup orchestration shows an active expiry and Stop action only when a real grant exists.

The settings entity owns validation-independent policy resolution. Preferences owns validation, controls, local settings persistence and sync migration. Root owns grants, content/background decisions and popup wiring. The page-translation owner applies reliable paragraph exclusions using its existing detector; other entrypoints do not duplicate language matching.

Acceptance requires migration/sync tests, overlapping-list precedence, unreliable/unknown observations, exact-hostname isolation, fixed expiry/non-sliding behavior, and real UI list/duration editing. Runtime page/paragraph behavior and expiry tests must be reported separately from static reference evidence.

## Settings implementation and verification

The settings entity exports `resolveSourceLanguagePolicy(settings, observation?)`, `SourceLanguageObservation`, `SourceLanguagePolicy`, `validSourceLanguage` and `temporaryDomainDurations`. Missing/unreliable/unsupported observations return `default`; a supported observation checks never before always. Explicit `zh-Hant` source declarations normalize to generic `zh`, independently from output-language choices. The supported language table has one owner in `shared/languages`; the translation entity keeps its existing public re-export.

General settings use two reusable language-list controls. Chinese is one source-rule choice; Traditional Chinese remains an output option. A code may occur in both lists, resolving to never without an import gate. Website rules provide the agreed duration presets. Reset restores empty lists and Disabled. Local records predating these fields receive those defaults.

Sync writes version 3 complete snapshots. Version 2 has an explicit retained field list covering appearance and named glossaries; version 1 retains its original list. Applying either older version preserves local policy preferences and local sync opt-in, then schedules a current-version upload. Missing fields in a version-3 payload are rejected rather than defaulted. Temporary grants do not belong to these snapshots.

Focused policy tests exercise reliable/unknown observations, conflicting lists, generic Chinese, invalid codes/durations, local migration and independent default arrays, version-2 migration preserving policy, complete version-3 round trips and rejection of incomplete current payloads. Existing sync and appearance/glossary tests also pass. The integrated browser checks below separately verify controls, native storage events and root-owned grant/page routing; unit checks alone are not used as runtime evidence.

## Integrated Chrome acceptance

The fixed integrated build passed nine non-model UI scenarios, including language-list add/remove, overlap persistence, generic Chinese choices, JSON export/reset, duration persistence, named glossary metadata and CSV, appearance overrides/clearing, native storage.sync version-3 field round trips, keyboard/narrow layouts and injected controls. Three cached-model scenarios were explicitly skipped in this isolated run. The popup busy-state check supplies controlled page-state responses and native session-storage status; it verifies enabled/disabled control semantics and is not an actual inference run.

`tests/e2e/policy.spec.ts` uses a fresh profile and real content/background messaging. Its sufficiently long English fixture is reliably detected by native Chrome CLD as one English candidate at 100%; all fixture text is marked `translate=no`, deliberately preventing model inference. It verifies manual top-frame activation creates a five-minute exact-hostname grant, repeated translation does not extend expiry, same-host navigation starts automatically, sibling hosts do not match, an explicitly expired grant does not start a new page, always-English enables startup, never-English wins an overlapping language rule, and never-site wins always-language. Negative cases observe inactivity repeatedly over a bounded 700 ms window after content-listener readiness; they do not establish behavior for every later host mutation or scheduling delay.

Chrome's actual `chrome.action.openPopup()` surface displayed the expiry and Stop action. A second CDP connection exposed that native popup target without mocking its active tab or runtime API. Stop removed the local grant while the currently translated page remained active. The test inspects grant storage directly elsewhere: an options-tab runtime sender has its own `sender.tab`, whereas the intended native popup caller does not. It does not broaden product provenance rules to accommodate a synthetic caller.

Both suites compare Chrome's executed background script source to the built file using the maintained identity preflight. The final cache probe remained incomplete with zero downloaded bytes; the policy run observed no model-host requests and no downloading/loading/translating model-status transitions. These results verify policy routing and UI, not model output quality, all-language detection or multi-device cloud delivery. Local evidence includes `policy-routing.json`, `ui-background-identity.json`, `popup-temporary.png`, `language-policy-narrow.png`, `temporary-domain-settings.png` and the appearance/glossary screenshots under `.workspace/qa/`. Native popup, new settings and narrow/dark controls were visually reviewed.
