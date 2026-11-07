# Design system and user journey research

## Scope and evidence

This document records the initial research baseline for Yaku, a translation extension. The repository snapshot and implementation priorities below describe that initial assessment. Subsequent runtime and feature decisions are recorded in [project architecture](../project/architecture.md); actual checks are recorded in [validation](../quality/validation.md).

| Source | Evidence used | Authority |
| --- | --- | --- |
| [agentic-coding](https://github.com/stvlynn/agentic-coding) and local `CLAUDE.md` | FSD/DDD structure, public APIs, English copy, semantic styling, documentation evolution | Engineering conventions |
| [AstraFoundry design README](https://github.com/AstraFoundry/design/blob/main/README.md), [Sunbeam specification](https://github.com/AstraFoundry/design/blob/main/skills/sunbeam/SKILL.md), [token source](https://github.com/AstraFoundry/design/blob/main/tokens/sunbeam.json) | Tokens, materials, typography, package integration and motion | Visual system |
| [coss introduction](https://coss.com/ui/docs), [styling](https://coss.com/ui/docs/styling) | React/Base UI component ownership, accessible interactions and theme contracts | Component anatomy |
| Arion `docs/frontend/design-system.md`, `docs/decisions/007-sunbeam-design-system.md` | Native adaptation of Sunbeam and coss anatomy | Local implementation reference |
| Arion `apps/desktop/ui/entities/onboarding/onboarding.go`, `ui/pages/onboarding/onboarding.go`, `docs/project/account-signin.md` | Current onboarding sequence, conditional steps and optional account behavior | Current journey reference |
| Arion `docs/research/ux-reference.md` | Earlier product research and recorded design choices | Historical context; current source takes precedence |

The requested `cossui.com` address was not accessible through the web reader. The official coss documentation available at `coss.com/ui` describes the relevant library. This is an evidence substitution, not a verified redirect claim. AstraFoundry repository files were read through the GitHub connector after the web reader could not fetch them.

## Initial repository baseline

Yaku currently contains the agentic-coding template, not an extension application. `frontend/src` contains layer README files; `backend/src` contains DDD layer README files. There is no manifest, browser entry point, application code or selected UI stack in the inspected source tree. `package.json` retains the template name and placeholder check/test/lint scripts. Project architecture still contains runtime/framework/database placeholders. Existing CI or successful placeholder commands must not be reported as product validation.

The template already supplies the required coding conventions. Keep its architecture rules rather than importing another copy of the template. Fill in the project overview and architecture when the actual product/runtime decision is made.

## Design ownership and integration

Sunbeam owns color, material, typography and motion. coss supplies accessible component structure. Yaku owns translation scenarios and copy. Do not load coss's default neutral theme over Sunbeam or introduce a second palette.

For a React implementation, prefer the shared `@astrafoundry/design` package for its supported tokens and primitives. Its README reports React 19, Motion 13 and Tailwind 4 peers; validate those against the selected extension toolchain before adoption. Use a verified package release or a pinned Git commit, as its README explicitly does not guarantee that a version has been published. Product sites must consume the shared package rather than copy its sources. A non-React implementation can adapt the specification, as Arion does, without bringing in a web runtime merely for visual parity.

coss is a source-owned component collection built on Base UI and Tailwind. Add only required components to `shared/ui`, preserve attribution/license information, and adapt their tokens in the common theme. Do not hand-build focus trapping, keyboard navigation or select behavior already provided by its primitives. The two sources have distinct consumption policies: shared AstraFoundry components are consumed as a package; coss components are intentionally owned as source.

## Visual rules

- Use warm paper/ink surfaces and one yellow primary action. The current upstream yellow is `hsl(48 100% 50%)`; use the upstream token, not an approximate hex copied from older Arion prose.
- `primary` pairs with `primary-foreground` (dark ink), including dark mode. Yellow is unsuitable as small text on light surfaces. Use `accent-foreground` for accent text.
- Map local theme vocabulary to Sunbeam once: background/foreground, card/card-foreground, popover/popover-foreground, primary/primary-foreground, muted/muted-foreground, accent/accent-foreground, border, input and ring. Existing template examples such as `bg-bg` are illustrative names; choose one canonical mapping.
- coss adds contracts such as destructive, warning, sidebar and status foreground tokens. Define and contrast-check these in the adapter rather than leaving component variables unresolved. A semantic status always has words or an accessible name; color alone is insufficient.
- Keep light/dark differences in the theme layer. Components use semantic utilities with no physical colors or scattered `dark:` branches.
- Use 1px hairlines, warm contact/ambient shadows and concentric corners. Sunbeam radii are 2/4/6/10/14/18/24px, with full rounding for pills. Controls use the compact coss anatomy; do not impose marketing card dimensions on a popup.
- Use the system sans face for dense extension controls as an explicit product adaptation, following Arion's native-reading rationale. Keep a 12px caption floor from current Sunbeam, readable body copy and tabular numbers. Reserve Sunbeam's display serif for spacious welcome or public-site titles if those surfaces exist.
- Natural motion-blurred photography belongs in onboarding/product demonstrations, with licensed local assets and one solid focus surface. Keep operational translation panels quiet and legible. No glass, colored glows, decorative gradients or tinted icon tiles.
- Motion communicates a transition and settles. Respect reduced motion, show the final illustrative state immediately, and avoid perpetual decorative animation. Operational loading must reflect a real pending request.

## Surface and component plan

These are proposed responsibilities, not implemented screens or fixed browser API choices.

| Surface | Primary job | Suitable coss primitives |
| --- | --- | --- |
| First-run page | Configure only what is necessary and complete one real translation | Card, Field, Select/Combobox, Button, Progress, Kbd |
| Compact extension surface | Translate or control translation for the current context | Button, Select, Switch, Popover, Tooltip |
| In-page result | Keep source context visible and expose result actions | Popover or solid result panel, Toolbar, Button, Scroll Area |
| Options/settings | Change language, provider, activation and privacy preferences | Group, Fieldset, Field, Select, Switch, Separator |
| Failure state | Explain the failed stage and offer its actual recovery | Alert, Button; persistent inline state rather than toast-only errors |

Start with a small shared inventory: Button/IconButton, Field, Input/Textarea, Select or Combobox, Switch, Card/Group, Separator, Tooltip, Popover, Alert, Progress and Kbd. Add Dialog only for an operation that needs a blocking decision. Icon-only controls need names and tooltips; essential instructions cannot exist only on hover.

Use a stable header/content/footer layout, designate the scrolling result/settings region, and put `min-height: 0` along its flex chain. Test long source/output text, expanded errors and narrow panels. Do not clip result actions or create competing body/panel scroll regions. An injected panel needs isolated styles and a portal/stacking strategy tested on host pages; coss's application-root isolation guidance alone does not establish an extension integration.

## Journey adapted from Arion

Current Arion source orders `Welcome → Account → Microphone → Accessibility → InputMethod → Model → Polish → Cloud → HoldKey → Try → Finished`, with conditional skip/readiness rules. Earlier research lists a shorter flow and says there are no account steps; `account-signin.md` and current source supersede that claim. Arion now offers optional sign-in and a local continuation. It keeps account networking off the critical startup path.

Transfer the structure: explain value, request capability at its point of need, verify readiness, practice, then return the user to their task. Do not copy microphone/Accessibility/input-method steps into a browser translation extension.

| Stage | Proposed Yaku behavior | Completion evidence |
| --- | --- | --- |
| Welcome | Show a concise source-to-translation example and one next action | User chooses to configure |
| Translation setup | Select target language and the supported translation mode/provider; expose credential configuration only if required | Valid configuration, not merely a selected radio |
| Capability | Explain access required by the selected activation path and invoke the platform's real permission flow | Actual permission/capability result; denial retains a recovery path |
| Activation | Show the supported selection/action/shortcut entry; verify the chosen trigger if applicable | Actual trigger observed, not a self-reported success check |
| Try translation | Translate a supplied sample without requiring unrelated personal text | Completed translation displayed with the chosen language |
| Finish | Show the real invocation method and return to browsing | User can invoke again and reach settings |

This flow does not require an account unless a confirmed provider/product contract requires one. Do not promise offline/local translation, downloadable models, history, synchronization or a free tier merely because Arion has related surfaces.

Daily use should be short: invoke on supported text/context → display progress → read result → copy or another supported result action → dismiss and resume reading. Settings remain a secondary destination. Source and translated output remain distinguishable; changing the target language must not relabel stale output as a new translation.

Use explicit states: idle, input-ready, requesting, completed, failed and cancelled. Associate output with its source, target language and request identity. A new request or cancellation invalidates stale results. Navigation/dismissal must have a documented cancellation or continuation policy. A completion mark means a completed action; copy success appears only after clipboard success. Never silently change provider, return the source as a successful translation or retry a different route after an unexplained failure.

## Proposed FSD boundaries

| Layer | Responsibility |
| --- | --- |
| `app` | Surface bootstraps, providers, dependency composition, theme/i18n installation and global styles |
| `pages` | Onboarding, compact control and options composition; route/entry parameters only |
| `widgets` | Translation panel, setup shell, settings groups and context/result composition |
| `features` | Translate text, configure translation, request capability, verify activation, copy result; scenario-specific API adapters and orchestration |
| `entities` | Pure translation request/result, language/provider configuration, readiness and onboarding state rules; no UI or HTTP |
| `shared` | UI primitives, theme adapter, copy dictionary, general browser/transport utilities and configuration |

Extension background/content entry points are composition/transport boundaries, not a reason to put business logic in page files or shared utilities. Document where platform messaging and provider execution live after choosing the runtime. If a service is needed, use DDD domain/application/infrastructure/interfaces; do not create a backend merely because the template contains its directories.

All imports point downward, all slices expose `index.ts`, and same-layer slices do not import one another. A widget can compose multiple features and pass callbacks; a feature cannot import a sibling feature to bypass orchestration. Keep all UI copy, validation messages and accessible names in one English dictionary unless a later user requirement specifies localization. Provider responses are data, not executable UI markup.

## Implementation order and review gates

1. **P0:** Confirm the extension runtime, browser targets, translation provider/execution boundary, activation mechanism and permission model; replace architecture placeholders.
2. **P0:** Establish one theme/token adapter and the minimal accessible primitives; record dependency versions and ownership.
3. **P0:** Deliver the vertical journey from configured input to a real result, cancellation and explicit failure; then build the first-run practice around it.
4. **P1:** Add settings and any additional approved activation surfaces using the same state contracts and primitives.
5. **P1:** Verify light/dark and reduced-motion states, keyboard-only operation, accessible names/focus return, long text, narrow width, permission denial, provider failure and stale-result rejection. Perform visual inspection of each actual extension surface.

Use meaningful domain/state tests and a small set of real extension journey checks. Placeholder npm scripts are not quality gates. Before implementation lands, document selected commands and update the nearest documentation index. The initial research phase did not validate an application runtime; subsequent implementation checks are recorded below and in the validation document.

## Implementation follow-up: preferences and browser sync

The initial assessment was followed by controlled React Popup, Settings, Workspace and Onboarding pages. Native controls and Base UI Select/Switch share the Sunbeam values in `shared/styles/tokens.css`. Injected panels adapt those tokens to shadow hosts. Workspace file, writing and download actions use callbacks; actions are shown only when their implementation is supplied.

Browser sync is optional and disabled by default. The `syncPreferences` flag remains local to each device and is excluded from synchronized payloads. Enabling sync uses an existing valid browser snapshot, or publishes local settings when none exists. Disabling it stops writes and incoming updates without deleting the browser snapshot. Import preserves the device's opt-in state; Reset settings disables sync. No product account is required.

The background worker installs one `installPreferencesSync` controller. Only validated preferences, website rules and glossary are synchronized. Model data, translation input/output and floating-control position are excluded. Changes are debounced for five seconds; pending uploads survive worker restart through local status metadata. Current-version incoming snapshots replace the settings document while retaining the local sync opt-in. A later received remote snapshot can therefore replace unsynchronized local edits. Version-1 snapshots preserve local appearance and named collections; version-1 and version-2 snapshots preserve local source-language rules and temporary-duration preferences.

The version-3 payload encodes UTF-8 JSON as base64 in 7,000-character chunks. Transport key names retain the `yaku.preferences.v1.` prefix so migration uses the same browser storage record. The reader accepts complete version-1, version-2 or version-3 snapshots; new writes always use version 3. Older snapshots update only fields present in their schema, preserve locally added fields and are republished with the current complete schema. Older clients reject the unsupported version rather than silently deleting its additional settings. One `storage.sync.set` writes a manifest and fixed-index revision-tagged chunks. Every referenced chunk must match the manifest before local settings are replaced. Obsolete tail chunks are removed afterward. Quota or validation errors preserve local preferences and produce visible status with a Retry action.

Chrome documents a 102,400-byte aggregate sync allowance, 8,192 bytes per item, 512 items, and write ceilings of 120 operations per minute and 1,800 per hour. Account transport and offline delivery are browser responsibilities. See the [official Chrome storage reference](https://developer.chrome.com/docs/extensions/reference/api/storage).

Focused sync tests cover simulated devices, opt-in isolation, echo prevention, Unicode chunks, cleanup, incomplete revisions/documents, failure/retry, debouncing and quota rejection. Real Chrome UI checks also write/read a multi-chunk Unicode payload through storage.sync and verify incoming storage events update Settings. This is evidence of storage integration, not delivery between signed-in accounts on separate physical devices.

Real-model UI checks translated and exported TXT and SRT, preserving subtitle timing and original cues. Separate UI samples corrected an English past-tense sentence, made a request polite, and explained an idiom in context. The idiom explanation included an incorrect optional grammatical claim, so these samples do not establish general factual accuracy. Full outputs and screenshots are local QA artifacts; current acceptance scope belongs to [validation](../quality/validation.md).

## Binary PDF reading edition

`TranslatedPdf.exportPdf()` creates an actual PDF with pdf-lib. It keeps each rendered original page at its original point dimensions, then adds A4 translation pages using shared measured wrapping and bounded pagination. Translation pages are rasterized at two canvas pixels per PDF point. This is a reading edition: original text layout is not rewritten, exported text is not searchable/selectable, and interactive PDF fields are not retained as fields.

Canvas output depends on fonts installed in the browser's operating system. The explicit fallback stack includes Segoe UI, Microsoft YaHei, Noto Sans SC, Nirmala UI, Noto Sans Devanagari/Arabic and Segoe UI Emoji. It does not bundle a universal font or guarantee every script on every platform. A system lacking the required glyph fonts can produce missing-glyph boxes; there is no reliable general glyph-coverage detector in this implementation. Windows QA rendered Chinese, Arabic, Devanagari, Latin combining marks and emoji in a five-page sample and inspected every Poppler-rendered page after correcting an initial fallback failure. Other operating-system font sets remain unverified.

PDF wrapping retains grapheme clusters, handles long unbroken tokens and preserves explicit line breaks. Direction is determined per rendered line. Fixed-size readable text flows onto another page rather than being clipped or reduced to fit. Source preparation accepts a password; the UI requests it only after a password-required/invalid response, and the controller keeps it in memory rather than Settings or sync storage.

## Glossary CSV and remaining configuration gaps

CSV import/export reuses the existing glossary dictionary. The project format has two columns, `source` and `translation`, with case-insensitive headers. Export emits UTF-8 BOM and CRLF records; quotes, commas and internal line breaks are quoted/escaped. Import normalizes line endings and trims outer field whitespace consistently with manual term entry. Existing terms are updated by the explicit import action; identical values are no-ops. Identical repeated records in one file are deduplicated. Only conflicting translations for the same term within a file reject the entire import without partial changes. Blank lines are ignored; malformed quotes, missing values and unexpected columns are errors. Static reference evidence establishes a CSV feature but does not establish its exact file schema, so this format is not presented as original-extension CSV compatibility.

Named collections now retain independent dictionaries, optional target-language bindings and optional URL scopes. The legacy `glossary` remains the General glossary, so existing local records require no destructive conversion. The same term editor and CSV implementation serve the selected collection. Metadata edits preserve its dictionary; deletion removes only that collection.

`entities/settings.resolveGlossary(settings, {targetLanguage, url?})` is the single matching rule consumed by content and workspace orchestration. It starts with the General glossary, then applies matching named libraries in ascending specificity: unscoped, language-only, URL-only, URL plus language. Later collections break equal-specificity ties. Source-language `auto` does not change target binding. Missing, invalid or non-web/file URL context excludes URL-bound libraries; files and writing therefore receive only general and matching language-only terms. Background image requests use their sender page URL, not an image CDN URL. Settings migration, import and sync validate unique library IDs, language codes, URL patterns and all term values.

URL scopes use the browser's native [WHATWG URLPattern](https://urlpattern.spec.whatwg.org/) parser and matcher, also available in the required Node 24 runtime. This is deliberately distinct from [Chrome extension match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns). For example, `https://*.example.com/*` matches a subdomain but does not include the apex; add `https://example.com/*` separately. HTTP, HTTPS, wildcard protocol and file patterns are accepted; each nonblank line is one pattern. No parallel glob matcher exists. Bound language means the requested output language, regardless of automatic source detection.

Appearance settings offer before/after original position, existing relative font size, and a collapsed Typography & colors section for generic/system font family, four weights, line-height presets, text color and background color. Page inheritance is the default; cleared colors remove their override. Named palettes and validated six-digit hex values share centralized reading presets. Generic families follow [CSS Fonts](https://www.w3.org/TR/css-fonts-4/#font-family-prop); hex validation intentionally accepts a smaller explicit subset of [CSS Color](https://www.w3.org/TR/css-color-4/#hex-notation), excluding arbitrary CSS declarations. These choices do not install fonts or guarantee glyph coverage. Renderer application belongs to the page-translation slice and must update existing output without another model request.

| Appearance concern | Implemented settings | Remaining reference gap |
| --- | --- | --- |
| Translation position | Before/after original block | Per-site position overrides |
| Typography | Relative size, family, weight and line height | Independent original typography controls and custom installed-font picker |
| Style | Plain, underline, highlight, quote and hover-revealed blur; text/background colors | Opacity, borders and additional style recipes |
| Scope | Global reading style; site include/exclude selectors | Per-site/per-language visual themes and explicit custom CSS |

Matched-term highlighting and selection-to-glossary remain separate gaps. The reference evidence is the static matrix in [feature parity](feature-parity.md); presence in reference configuration is not proof of current runtime behavior. Unit checks cover legacy migration, complete sync versions, invalid appearance values, native URL matching, language/URL precedence, absent URL isolation and invalid collection metadata. Real UI checks must run against the build containing these additions before claiming browser acceptance.

Source-language rules and the temporary website duration are specified in [translation policy](translation-policy.md). Settings controls and the version-3 sync codec implement those fields; runtime activation and grant expiry are separate orchestration responsibilities.
