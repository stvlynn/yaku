# Feature parity research

## Scope and evidence

This is a static product inventory for an independently implemented WXT extension using HY-MT2 through Transformers.js. It is not an implementation, a claim of complete parity, or an end-to-end test report.

Evidence labels used throughout:

- **Observed**: manifest, configuration, localization, or bundle text exists in the inspected artifact. A setting or advertised platform is not proof that the workflow currently works.
- **Inferred**: likely behavior derived from configuration names, selectors, or UI structure; requires execution and representative fixtures to confirm.
- **Unknown**: absent runtime evidence, hosted service behavior, availability, quota enforcement, or platform compatibility.

Sources: user-provided CRX payload extracted under `.workspace/research/package` (manifest version 1.34.2), and installed Chrome artifact `<Chrome user data>/Default/Extensions/bpoadfkcbjbfhfodiogcnhhhpibjhbnh/1.34.4_0` (manifest version 1.34.4). Package content was treated as untrusted data. The static pass parsed JSON and inspected bundles as text without executing packaged scripts. Separate isolated UI runtime captures are documented in the evidence ledger. No proprietary implementation or artwork was copied into product source. External URLs in package data were not followed.

## Baseline size and extension surfaces

The 1.34.2 configuration has 800 rule entries, 214 advertised subtitle-site entries, 238 advertised manga-site entries, and 103 translation-service keys including historical migration variants. There are 22 runtime locale dictionaries and 1,884 English localization entries. Counts describe configuration records, not unique functioning integrations. Rules can overlap, inherit, or duplicate IDs.

Observed Manifest V3 surfaces: service worker, action popup, options page, offscreen document, side-panel assets, early content guard at document start in all frames, PDF viewer, subtitle injector, image injector, browser bridge, Tesseract worker, and WASM assets. Permissions include storage, activeTab, contextMenus, webRequest, declarativeNetRequest variants, offscreen, sidePanel, and all-host access. The manifest exposes resources for all URLs and file URLs; actual local-file access remains a user/browser permission condition. The extension-page CSP permits self-hosted scripts and WASM evaluation.

## Functional and interaction matrix

All entries below are **Observed** as shipped product surfaces/configuration; runtime outcomes are **Unknown** unless explicitly stated otherwise. Priority is a proposed dependency order for this project, not a claim about work completed.

| Area | Observable workflow and controls | Evidence anchors | Dependency / parity boundary |
| --- | --- | --- | --- |
| P0 Page translation | Translate current page, restore original; bilingual / translation-only; main-content / whole-page / immediate-to-page-end scopes | manifest commands; `translationMode`, `shortcuts`, `generalRule.preTranslateLimiter` | DOM extraction, scheduling, reversible rendering, translation worker |
| P0 Automatic translation | Always/never site rules; temporary per-domain activation; language-based enable/disable; source and target language pairs; same-language checks | `defaultAlwaysTranslatedUrls`, `tempTranslateDomainMinutes`, `translationLanguagePattern`, `sourceLanguageUrlPattern`, `translationLanguagePairs` | Rule precedence and persistence need explicit specification |
| P0 Dynamic page adaptation | Translate newly inserted content; SPA URL observation; visibility/deferred rendering; all-frame and shadow-root handling | `generalRule.mutationConfig`, `observeUrlChange`, `shadowRootSelectors`, `visibleObserverScreens`, manifest `all_frames` | Inferred intent; virtualized lists, cross-origin frames, rich DOM need fixtures |
| P0 Popup | Language/service selection, translate/restore, more tools/settings; simple/full popup variants | `popup.html/js`, `popupVariant`, `popupMode`, locale `popup.simpleMode.*` | Independent UI; remote promotions are separate from translation |
| P0 Keyboard/context menus | Page, whole page, input, side panel shortcuts; optional context-menu entries for pages, PDF, ebook, HTML/text, subtitle, images | manifest `commands`, locales `browser.*`, `isShowContextMenu` | Browser-reserved shortcut conflicts and permission conditions unknown |
| P0 Floating controls | Page translate ball, hover expansion, side-panel visibility/pinning, settings/feedback buttons, manga button | `pcFloatBall`, locale `floatBallOptions.*` | Drag/position/viewport behavior requires runtime validation |
| P0 Translation appearance | Original before/after translation; per-site/per-language themes; font selection; learning mask; colors/borders/highlight and custom styling | `translationPosition`, `translationFonts`, `translationThemePatterns`, locale `translationTheme.*` | Preserve host layout, selection, links, accessibility and dark/RTL behavior |
| P1 Hover paragraph | Modifier/hold/custom shortcut or automatic hover translates a paragraph; repeat toggles translation; site exclusions | `mouseHoverHoldKey`, `mouseHoverPreferenceKey`, `mousePressHoldTranslateDelay`, `mouseHoverExcludeSelectors` | Range/block targeting; independent from whole-page state |
| P1 Selection lookup | Select word/sentence; direct/icon/mini-icon; hover/click trigger; copy, expand/collapse, original+translation/translation-only, resize; pronunciation and word information | `generalRule.selectionTranslation`, locale `selectionTranslation*` | Dictionary/context analysis and speech are additional capabilities beyond translation-only HY-MT2 |
| P1 Input translation | Translate input/textarea/editable content; whole or delimiter-defined suffix; trigger repetitions; explicit/default/detected target; target bar; retain bilingual content; undo; long-text confirmation; exclusions | `enableInputTranslation`, `inputStartingTriggerKey`, `inputTrailingTriggerKey*`, `generalRule.inputConfig`, locales `inputTranslation.*` | Editors, IME, selection and undo history require independent validation |
| P1 Side panel | Text, file, video, image, tutorial tabs; text processing; professional mode with AI Expert and AI Terms; matched terms | `side-panel.html/js`, `sidePanel.navItems`, locales `sidePanel.*` | Each tab may link to a hosted workflow; asset presence does not imply local implementation |
| P1 Documents | PDF viewer/basic translation; EPUB read/build; HTML/TXT; advertised DOCX/Markdown/JSON/subtitle formats | locale `browser.*`, `fileTranslate.*`; format arrays in options/side-panel | Full format matrix below; preserve container structure during export |
| P1 Video subtitles | Auto/manual bilingual; target/source tracks; translation-only; pretranslation; manual-track preference; native/immersive display; learning mask; styling and download | `generalRule.subtitleRule`, locales `subtitle.*`; site rules | Platform acquisition and cue timing are separate from text translation |
| P1 Meetings/live captions | Auto-enable meeting subtitles; Zoom/Teams/Meet live caption integration and live trial states | `subtitleRule.meetingAutoEnableSubtitle`, `zoom`, `team`, `googleMeet` rules | Caption capture observed; microphone transcription implementation unknown |
| P1 Image/manga | Translate/restore image; retranslate; manga floating action; supported-site discovery; cache cleanup; resource-restriction errors | `generalRule.imageRule`, `supportedMangaSites`, image injector, Tesseract assets, locales `manga*`, `image*` | Requires OCR, geometry, background cleanup/reconstruction; HY-MT2 alone translates extracted text |
| P1 Screenshot translation | Selection screenshot area, trigger key, recognition mode/model | `generalRule.selectionTranslation.screenshotArea` | Enabled flag is false in packaged defaults; exposure and accuracy unknown |
| P1 Glossary | Create, name, describe, target language; add/edit/delete terms; optional translations; CSV import/export; URL matching; matched-term highlights; select translated text to save terms | locale `terms.*`, `articleTerminology.*`; `generalRule.glossaries` | Exact format and deterministic term enforcement require tests |
| P2 Context/domain experts | AI context; automatic/custom/installable experts; URL matching; domain glossary/context labels; translation scenes | `enableAiAssistant`, locale `aiAssistant.*`, `sidePanel.professionalTranslationMode` | Prompt-compatible structured behavior must be validated for HY-MT2 |
| P2 Comparison/editing | Compare translations, temporarily edit rendered translations | `enableContextDiffPreview`, `enableEditTranslation`, locale `contextDiffPreview`, `tempEditTranslation` | Editing persistence/export semantics unknown |
| P2 Writing/replies | Gmail/GitHub reply button; summary, suggestions, simple/pro mode; length/formality/tone/role; chat refinement; stop/regenerate/retranslate/insert | `generalRule.aiWriting`, locale `aiWriting.*` | Generative composition/summarization are not established HY-MT2 translation capabilities |
| P2 Sharing/search | Bilingual page sharing and share cards; search-result enhancement | `enableFloatShare`, `generalRule.shareConfig`, `shareCardRule`, `searchEnhancementConfig` | Hosted sharing persistence and privacy behavior unknown |
| P2 Configuration/backup | Import/export, reset, cache size/clear, official-rule sync, account/cloud/Google Drive sync, auto sync; sensitive-key sync choice | locale `import_export*`, `sync*`, `enableAutoSync*`, `cacheSize`; `cache*` | Network/account backend contracts are not demonstrated by static UI strings |
| P2 Account/commerce/help | Login/logout/manage account, Pro/trial/quota/add-on states, onboarding/tutorials, feedback/reporting, notifications | locale account/quota/tutorial keys; `telemetry`, `messageCenter`, report flags | Commercial service infrastructure is a separate dependency, not reproduced by a local model |
| P2 Advanced settings | Per-site selectors, include/exclude tags, URL/language patterns, prompts, model/endpoints, batching/request limits, developer rules | `generalRule`, `rules`, `translationServices`, locale `developer` | Configuration compatibility is not guaranteed by matching field names |

## Defaults and settings organization

Packaged defaults are raw configuration values before migrations, per-user settings, remote updates, experiments, and site overrides. `translationMode=dual`, `translationPosition=after`, `translationStartMode=dynamic`, `cache=true`, `inputTranslationMode=translation`, input start delimiter `/`, end trigger `space`, repeated 3 times. Historical `.add_v.*` keys mean these values must not be treated as the final effective value for every installation.

Observed settings families:

| Family | Settings that a parity specification must resolve |
| --- | --- |
| Languages | source auto-detection, target list, language pairs, RTL, same-language handling, paragraph language detection, site/language defaults |
| Rendering | bilingual/translation-only, position, fonts, line wrapping, mask, opacity, emphasis, border/underline/background, custom CSS, theme matching |
| Translation scope | main/whole page, sidebar/header controls, include/exclude selectors/tags, minimum text/word thresholds, dynamic-content and mutation exclusions |
| Triggers | browser and in-page shortcuts, hover modifier/hold/custom keys, selection mode, input delimiter/trigger repetition/timeouts, touch gestures |
| Services | separate page/input/subtitle/image services, custom API configuration, language/model overrides, prompts, context, batching, intervals, concurrency, cache |
| Websites | always/never/temporary translation, per-domain settings, URL patterns, exceptions, embedded PDF extraction, site rule updates |
| Subtitles | global/per-site/YouTube/meeting enablement, pretranslation/manual preference, AI preference, dialogue-only filtering, source/target typography and position, native/immersive display |
| Images | manga control visibility, supported-site list, client translation service, cache, recognition/backend failure states |
| Privacy/storage | consent surfaces, telemetry/report options, caches and cleanup, config import/export/reset, cloud synchronization and sensitive-info inclusion |
| Advanced | developer settings, beta features, custom rules, conflict handling, feature enablement and service errors |

Observed theme identifiers (labels are summarized, not artwork): none, grey, dashed, dotted, dashedBorder, solidBorder, underline, mask, opacity, paper, dividingLine, highlight, marker, marker2, blockquote, weakening, italic, bold, thinDashed, nativeDashed, nativeDotted, nativeUnderline, wavy, background. Localization has a few duplicate labels; identifier presence does not prove every theme is exposed together.

## Document and file matrix

| Format/workflow | Static evidence | Observed advertised operations | Unknown / verification needed |
| --- | --- | --- | --- |
| PDF | manifest `pdf/index.html`; local/embedded PDF labels | Basic document translation, embedded PDF opening, local upload | Text extraction, tables, columns, figures, export, fonts, encrypted files, large files |
| PDF Pro / scanned PDF | `fileTranslate.pdfPro*`, tutorial scan/formula labels | OCR scanned pages, formula/table preservation | Hosted service, quota, upload/storage, fidelity and OCR languages |
| BabelDOC PDF | context-menu and document tool labels | Preserve original layout/formulas/images/tables in bilingual output | Hosted processor, exact output and document classes supported |
| EPUB | context-menu read/build commands; format arrays | Read local ebook; create bilingual EPUB | TOC, spine, metadata, CSS, images, DRM, export validity |
| HTML / TXT | context-menu labels and format arrays | Local text/HTML translation | Encoding, script removal, formatting and export behavior |
| DOCX | `fileTranslate.description`; bundle format array | Advertised basic document translation | Tables, comments, fields, headers/footers, tracked changes and export |
| Markdown (`md`) | description and bundle format array | Advertised basic document translation | Code fences, frontmatter, links, tables, math preservation |
| JSON | options and side-panel format arrays | Advertised file category | Key preservation, nested values, escaping and round-trip behavior |
| SRT / ASS / VTT / LRC | options and side-panel format arrays; parser names/text | Subtitle translation, edit, bilingual export | Styling, overlaps, offsets, karaoke tags, encodings and exact export formats |
| Other office/archive formats | No sufficient inspected evidence | None established | PPTX/XLSX/ODT support must not be claimed |

The bundle arrays advertise `pdf, ePub, docx, txt, html, md, json, srt, ass, vtt, lrc`; this proves UI categorization only. Some file flows are hosted tools. No uploaded document, export artifact, or successful round trip was observed in this research.

## Subtitle capability and platform matrix

Capabilities observed in locales/configuration include global auto-enable, per-site enable, temporary enable/disable, YouTube-specific preference for extension versus native machine translation, human subtitles first, translation-only/bilingual, subtitle download, native-player versus immersive overlay, source/translation font family/size/weight/color, position, background color/opacity, text edge style, learning mask, reset styling, dialogue annotation filtering, YouTube basic and AI sentence segmentation, AI subtitle generation/regeneration/cache preference, live trial/quota errors and meeting auto-enable.

Site rules expose several acquisition families: HTML text tracks, dynamic text tracks, fetch/XHR text interception, WebVTT/subsrt cue parsing, TTML/EBU-TT/XML, provider-specific YouTube/Netflix/Disney+/Mubi paths, attached overlays, and live captions. These are static classifications. A generic VTT parser is insufficient evidence of all-site parity.

| Representative platform group | Observed rule families | Special states exposed | Runtime status |
| --- | --- | --- | --- |
| YouTube desktop/mobile/embed/Kids/TV/Music/no-cookie | `youtube`, XHR response hooks | Manual/auto track preference, pretranslation, Shorts/live positioning, ASR clause optimization, AI captions | Unknown |
| Netflix | `netflix`, fetch/XHR | Provider-specific caption integration | Unknown |
| Prime Video/Amazon/BBC/ARD/ZDF | EBU-TT/XML and WebVTT variants | Structured subtitle parsing | Unknown |
| Disney+ / Hulu / Mubi / iQIYI | provider-specific or XML | Platform-specific track acquisition | Unknown |
| Coursera/Khan/Vimeo/Apple TV/Max/Paramount/Pluto | text-track/dynamic-track/WebVTT variants | Player track selection/overlays | Unknown |
| Udemy/TED/edX/FrontendMasters and course hosts | subsrt, attached VTT, general fetch, text tracks | Manual target-language preference explicitly mentions Udemy | Unknown |
| Twitter/X, YouTube | specialized rules plus conditional AI configuration | AI cached/generated subtitles advertised; repost limitation exposed | Unknown |
| Zoom / Teams / Google Meet | live; Zoom recordings use VTT | Meeting auto enable, live trial/quota | Unknown |
| TikTok / ABC iview / Abema | live or live-attached | Live subtitle path inferred | Unknown |
| Bilibili / Reddit / Facebook / Dailymotion | general/subsrt/fetch/XHR | Site-specific payload and injection | Unknown |

### Complete advertised subtitle-site checklist

The following names/hosts are derived from `supportedVideoSubtitleSites` in 1.34.2. Every entry is **Observed as advertised; runtime unknown**. Several labels describe content hosts while captions are served by a shared player/CDN. No assertion is made about account, territory, DRM, live support, AI generation, downloads, or styling for an individual row.

| # | Advertised platform | Host/path |
| --- | --- | --- |
| 1 | YouTube | `https://www.youtube.com` |
| 2 | TV YouTube | `https://tv.youtube.com` |
| 3 | YouTube Kids | `https://www.youtubekids.com` |
| 4 | Netflix | `https://www.netflix.com` |
| 5 | Prime Video | `https://www.primevideo.com` |
| 6 | Twitter Spaces | `https://twitter.com` |
| 7 | Facebook | `https://www.facebook.com/` |
| 8 | HBO Max | `https://play.max.com` |
| 9 | HBO GO | `https://www.hbogoasia.tw` |
| 10 | Vimeo | `https://vimeo.com/watch` |
| 11 | Khan Academy | `https://www.khanacademy.org/` |
| 12 | Coursera | `https://www.coursera.org/` |
| 13 | Udemy | `https://www.udemy.com/` |
| 14 | Bloomberg | `https://www.bloomberg.com` |
| 15 | Fox News | `https://www.foxnews.com/video` |
| 16 | Nebula | `https://nebula.tv/videos` |
| 17 | Bilibili | `https://www.bilibili.com` |
| 18 | TED | `https://www.ted.com/` |
| 19 | FrontendMasters | `https://frontendmasters.com` |
| 20 | CodeWithChris | `https://learn.codewithchris.com` |
| 21 | edX | `https://www.edx.org` |
| 22 | Skillshare | `https://www.skillshare.com/` |
| 23 | BBC | `https://www.bbc.com/` |
| 24 | Disney+ | `https://www.disneyplus.com/` |
| 25 | ARD Mediathek | `https://www.ardmediathek.de/` |
| 26 | ITV | `https://www.itv.com/` |
| 27 | Domestika | `https://www.domestika.org/` |
| 28 | ArtStation | `https://www.artstation.com/learning` |
| 29 | ZDF | `https://www.zdf.de` |
| 30 | MasterClass | `https://www.masterclass.com` |
| 31 | Learn Microsoft | `https://learn.microsoft.com` |
| 32 | Mindvalley | `https://home.mindvalley.com` |
| 33 | iview | `https://iview.abc.net.au/` |
| 34 | nmaArt | `https://www.nma.art/` |
| 35 | Developer Apple | `https://developer.apple.com` |
| 36 | egghead.io | `https://egghead.io/` |
| 37 | LinkedIn | `https://cn.linkedin.com/` |
| 38 | Kanopy | `https://www.kanopy.com/` |
| 39 | RachelsEnglishAcademy | `https://www.rachelsenglishacademy.com/` |
| 40 | three.js journey | `https://threejs-journey.com/` |
| 41 | WeTV iflix | `https://www.iflix.com/` |
| 42 | Hulu | `https://www.hulu.com/` |
| 43 | ESPN | `https://www.espn.com/` |
| 44 | IMDb | `https://www.imdb.com/` |
| 45 | Rotten Tomatoes | `https://www.rottentomatoes.com/` |
| 46 | FMovies | `https://ww4.fmovies.co/` |
| 47 | Bflixhd | `https://bflixhd.to/` |
| 48 | Hianime | `https://hianime.to/` |
| 49 | iQIYI | `https://www.iq.com/` |
| 50 | Youku | `https://www.youku.tv/` |
| 51 | Dailymotion | `https://www.dailymotion.com/` |
| 52 | Paramount Plus | `https://www.paramountplus.com/` |
| 53 | starz | `https://www.starz.com/` |
| 54 | pluto | `https://pluto.tv/` |
| 55 | movie-web | `https://movie-web-me.vercel.app/` |
| 56 | Unreal Sensei | `https://www.unrealsenseiacademy.com/` |
| 57 | DeepLearning.ai | `https://learn.deeplearning.ai` |
| 58 | Piped.Video | `https://piped.video/` |
| 59 | University of Southampton | `https://southampton.cloud.panopto.eu` |
| 60 | VK Video | `https://vk.com/video` |
| 61 | COMSOL | `https://www.comsol.com/video` |
| 62 | The Motion Magic | `https://themotionmagic.com/` |
| 63 | SVT Play | `https://www.svtplay.se/` |
| 64 | Osmosis | `https://www.osmosis.org/` |
| 65 | DR | `https://www.dr.dk/` |
| 66 | PBS | `https://www.pbs.org/` |
| 67 | Viki | `https://www.viki.com/` |
| 68 | MGTV | `https://w.mgtv.com/` |
| 69 | DevEpicGames | `https://dev.epicgames.com/` |
| 70 | ZOOM | `https://app.zoom.us/` |
| 71 | TEAM | `https://teams.live.com/` |
| 72 | Google Meet | `https://meet.google.com/` |
| 73 | Weverse | `https://weverse.io/` |
| 74 | Zenva Academy | `https://academy.zenva.com` |
| 75 | Kevin Powell | `https://courses.kevinpowell.co` |
| 76 | Fau TV | `https://www.fau.tv` |
| 77 | Thai PBS | `https://www.thaipbs.or.th/` |
| 78 | GORAILS | `https://gorails.com/` |
| 79 | QUANTRA | `https://quantra.quantinsti.com/` |
| 80 | Gaia | `https://www.gaia.com/` |
| 81 | RTVE.es | `https://www.rtve.es` |
| 82 | Amazon | `https://www.amazon.com/` |
| 83 | KIKA | `https://www.kika.de` |
| 84 | Jove | `https://www.jove.com` |
| 85 | ASU | `https://asu.instructure.com/` |
| 86 | F1tv | `https://f1tv.formula1.com/` |
| 87 | Patreon | `https://www.patreon.com` |
| 88 | CBS NEWS | `https://www.cbsnews.com` |
| 89 | Khflix | `https://khflix.com` |
| 90 | Donghuaworld | `https://donghuaworld.com` |
| 91 | Datacamp | `https://projector.datacamp.com` |
| 92 | Urplay | `https://urplay.se` |
| 93 | Ganjingworld | `https://www.ganjingworld.com` |
| 94 | Lecturio | `https://app.lecturio.com` |
| 95 | Gagaoolala | `https://www.gagaoolala.com` |
| 96 | curiositystream | `https://curiositystream.com` |
| 97 | NRK TV | `https://tv.nrk.no` |
| 98 | TUBI | `https://tubitv.com` |
| 99 | TikTok | `https://www.tiktok.com` |
| 100 | BARRONS | `https://www.barrons.com/` |
| 101 | MITXONLINE | `https://courses.mitxonline.mit.edu/` |
| 102 | Docubay | `https://www.docubay.com/` |
| 103 | Hubspot | `https://app.hubspot.com/` |
| 104 | Rumble | `https://rumble.com/` |
| 105 | WSJ | `https://www.wsj.com/` |
| 106 | WSJ-CN | `https://cn.wsj.com/` |
| 107 | Lmanga | `https://www.lmanga.com/` |
| 108 | SpringAcademy | `https://spring.academy/` |
| 109 | Quark | `https://pan.quark.cn/` |
| 110 | Medici | `https://www.medici.tv/` |
| 111 | UCDAVIS | `https://canvas.ucdavis.edu/` |
| 112 | IAABCFOUNDATION | `https://learning.iaabcfoundation.org/` |
| 113 | CoinDesk | `https://www.coindesk.com/` |
| 114 | Reuters | `https://www.reuters.com/` |
| 115 | TVer | `https://tver.jp/` |
| 116 | CodeWithAndrea | `https://pro.codewithandrea.com/` |
| 117 | Hikaritv | `https://watch.hikaritv.xyz/` |
| 118 | LowStressHandling | `https://university.lowstresshandling.com/` |
| 119 | UnityLearn | `https://learn.unity.com/` |
| 120 | Medbridge | `https://www.medbridge.com/` |
| 121 | anix | `https://anix.com.co/` |
| 122 | ahrefs | `https://ahrefs.com/` |
| 123 | ANGEL | `https://www.angel.com/` |
| 124 | Shangpa Academy | `https://shangpa-academy.mn.co/` |
| 125 | Internetfundamentals | `https://internetfundamentals.com/` |
| 126 | DMM | `https://tv.dmm.com/` |
| 127 | SAP | `https://learning.sap.com/` |
| 128 | Dynasty Scans | `https://dynasty-scans.com/` |
| 129 | Weebcentral | `https://weebcentral.com/` |
| 130 | Aljazeera | `https://www.aljazeera.com/` |
| 131 | Arte | `https://www.arte.tv/` |
| 132 | Feynmanlectures | `https://www.feynmanlectures.caltech.edu/` |
| 133 | Updraft | `https://updraft.cyfrin.io/` |
| 134 | MediaSpace | `https://mediaspace.illinois.edu/` |
| 135 | NBCNEWS | `https://www.nbcnews.com/` |
| 136 | Fawesome | `https://fawesome.tv` |
| 137 | Maven | `https://maven.com/` |
| 138 | Master.dev | `https://master.dev` |
| 139 | Whop.com | `https://whop.com` |
| 140 | Lennysnewsletter.com | `https://lennysnewsletter.com` |
| 141 | Av.tib.eu | `https://av.tib.eu` |
| 142 | Vod.sooplive.com | `https://vod.sooplive.com` |
| 143 | Shibaristudy.com | `https://shibaristudy.com` |
| 144 | Epic React | `https://epicreact.dev` |
| 145 | Billboard | `https://www.billboard.com` |
| 146 | App.tonebase.co | `https://app.tonebase.co` |
| 147 | App.acilearning.com | `https://app.acilearning.com` |
| 148 | Dramawave | `https://dramawave.chartdrama.com` |
| 149 | StartDev | `https://start.dev` |
| 150 | LearnMIT | `https://learn.mit.edu/` |
| 151 | gdc-search.github.io | `https://gdc-search.github.io` |
| 152 | EpicWeb | `https://www.epicweb.dev` |
| 153 | AI Hero | `https://www.aihero.dev` |
| 154 | Code With Antonio | `https://www.codewithantonio.com` |
| 155 | Apple TV | `https://tv.apple.com` |
| 156 | Reddit | `https://www.reddit.com` |
| 157 | Substack | `https://www.substack.com` |
| 158 | Roots of Progress | `https://newsletter.rootsofprogress.org` |
| 159 | The Economist | `https://www.economist.com` |
| 160 | KelbyOne | `https://members.kelbyone.com` |
| 161 | MarketSurge | `https://marketsurge.investors.com` |
| 162 | Investors.com | `https://www.investors.com` |
| 163 | ABC | `https://www.abc.net.au` |
| 164 | MATLAB Academy | `https://matlabacademy.mathworks.com` |
| 165 | Udacity | `https://www.udacity.com` |
| 166 | SlidesLive | `https://slideslive.com` |
| 167 | Viu | `https://www.viu.com` |
| 168 | ServiceNow | `https://www.servicenow.com` |
| 169 | OCR Training | `https://ocrtraining.cit.nih.gov` |
| 170 | NIH VideoCast | `https://videocast.nih.gov` |
| 171 | Anthropic Course | `https://anthropic.skilljar.com` |
| 172 | Crunchyroll | `https://www.crunchyroll.com` |
| 173 | SmartPoly | `https://smartpoly.teachable.com` |
| 174 | 9AnimeTV | `https://9animetv.to` |
| 175 | Global TV | `https://watch.globaltv.com` |
| 176 | Plex | `https://watch.plex.tv` |
| 177 | Level Effect | `https://training.leveleffect.com` |
| 178 | Physeo | `https://www.physeo.com` |
| 179 | Laracasts | `https://laracasts.com` |
| 180 | Adobe TV | `https://tv.adobe.com` |
| 181 | MUBI | `https://mubi.com` |
| 182 | The Real World | `https://app.jointherealworld.com` |
| 183 | Agency Supremacy | `https://agencysupremacy.io` |
| 184 | Dynamous | `https://dynamous.ai` |
| 185 | GraphPad | `https://www.graphpad.com` |
| 186 | Thinkific | `https://www.thinkific.com` |
| 187 | NI Learning | `https://learn.ni.com` |
| 188 | CG Cookie | `https://cgcookie.com` |
| 189 | Yoast Academy | `https://academy.yoast.com` |
| 190 | Maven Analytics | `https://courses.mavenanalytics.io` |
| 191 | AP Classroom | `https://apclassroom.collegeboard.org` |
| 192 | MSN | `https://www.msn.com` |
| 193 | TI | `https://www.ti.com.cn` |
| 194 | EdClub | `https://www.edclub.com` |
| 195 | Investopedia | `https://www.investopedia.com` |
| 196 | SBS | `https://www.sbs.com.au` |
| 197 | Typing.com | `https://www.typing.com` |
| 198 | Thieme | `https://www.thieme.de` |
| 199 | SproutVideo | `https://videos.sproutvideo.com` |
| 200 | IXL | `https://www.ixl.com` |
| 201 | Gumlet | `https://play.gumlet.io` |
| 202 | Megaplay | `https://megaplay.buzz` |
| 203 | BrightTALK | `https://www.brighttalk.com` |
| 204 | DAIR.AI Academy | `https://academy.dair.ai` |
| 205 | CloudNestra | `https://cloudnestra.com` |
| 206 | Tagesschau | `https://www.tagesschau.de` |
| 207 | MediaDelivery | `https://iframe.mediadelivery.net` |
| 208 | Cdnapisec.kaltura.com | `https://cdnapisec.kaltura.com` |
| 209 | peacocktv | `https://www.peacocktv.com` |
| 210 | Abema.tv | `https://abema.tv` |
| 211 | Kaltura | `https://keats.kcl.ac.uk` |
| 212 | Nvidia.com | `https://www.nvidia.com` |
| 213 | Gem CBC | `https://gem.cbc.ca` |
| 214 | Learn.learn.nvidia.com | `https://learn.learn.nvidia.com` |

### Static subtitle adapter inventory

The table below includes rules carrying a direct `subtitleRule` or `subtitleRule.add` object. It intentionally preserves repeated IDs; full effective configuration also depends on versioned/conditional overrides and inherited rules. A blank type inherits or remains unspecified.

| Rule ID | Declared adapter type | Declared hook | Explicit parse format |
| --- | --- | --- | --- |
| twitter | twitter | — | — |
| common-vtt | webvtt | xhr / fetch | vtt |
| zoom-asu | subsrt | xhr | vtt |
| zoom | live | — | — |
| team | live | — | — |
| googleMeet | live | — | — |
| cbc-gem-text-track | text_track_dynamic | — | — |
| tv.apple | text_track_dynamic | — | — |
| redditList | subsrt | fetch | vtt |
| reddit | subsrt | fetch | vtt |
| angel | subsrt | xhr | — |
| reuters | subsrt | xhr | — |
| facebook | subsrt | — | — |
| facebookV20VideoPlugin | subsrt | xhr | vtt |
| youtubeMobile | youtube | xhr_response | — |
| youtubeeducation | youtube | xhr_response | — |
| yotube-embed | youtube | xhr_response | — |
| youtube | youtube | xhr_response | — |
| youtubekids | youtube | xhr_response | — |
| tvYoutube | youtube | xhr_response | — |
| youtube-subtitle | youtube | xhr_response | — |
| substack | general | fetch | — |
| sydeny | subsrt | fetch | — |
| artstationLearning | subsrt | — | — |
| missav | av2 | — | — |
| netflav.player | av2 | — | — |
| netflav | av2 | — | — |
| economist | webvtt | xhr | — |
| kelbyone | subsrt | xhr | — |
| primevideo | ebutt | xhr / fetch | — |
| amazon | webvtt | xhr | — |
| bloomberg | subsrt | fetch / xhr | — |
| tiktok | live | — | — |
| wsj | text_track | — | — |
| bilibili | general | — | — |
| netflix | netflix | fetch / xhr | — |
| udemy | subsrt | fetch / xhr | — |
| iview | live_attach | — | — |
| marketsurge | subsrt | — | — |
| nmaart | subsrt | — | — |
| investors | subsrt | xhr | — |
| abc.net | webvtt | xhr | srt |
| patreon | webvtt | xhr | — |
| thaipbs | subsrt | — | — |
| matlabacademy | webvtt | xhr | srt |
| hstream | subsrt | — | — |
| zenva | multi_attach_vtt | — | — |
| lowstresshandling | subsrt | — | — |
| apple | webvtt | — | — |
| khanacademy | text_track | — | — |
| nebula | webvtt | — | — |
| fawesome | text_track | — | — |
| frontendmasters | webvtt | — | — |
| udacity | webvtt | — | — |
| skillshare | subsrt | — | — |
| tubitv | subsrt | fetch / xhr | — |
| iaabcfoundation | subsrt | xhr | — |
| domestika | subsrt | — | — |
| svtplay | subsrt | — | — |
| unity-learn | subsrt | — | — |
| hbogo | text_track_dynamic | — | — |
| video-barrons | text_track | — | — |
| hbomax | webvtt | — | — |
| mindvalley | subsrt | — | — |
| viki | subsrt | — | — |
| masterclass | text_track_dynamic | — | — |
| slideslive | text_track | — | — |
| viu | subsrt | xhr | — |
| linkin | webvtt | xhr | — |
| kanopy | webvtt | xhr | — |
| iflix | subsrt | xhr | — |
| imdb | subsrt | — | — |
| itv | subsrt | — | vtt |
| vk.com | text_track | — | — |
| egghead | text_track | — | — |
| coursera1 | text_track | — | — |
| coursera2 | text_track | — | — |
| whop | text_track_dynamic | — | — |
| servicenow | subsrt | — | — |
| foxnews-video | subsrt | fetch / xhr | vtt |
| quark | text_track | — | — |
| kika | text_track | — | — |
| ocrtraining | webvtt | — | — |
| espn | webvtt | — | — |
| anthropic-course | multi_attach_vtt | — | — |
| fmoviesz | multi_attach_vtt | — | — |
| dailymotion | webvtt | xhr / fetch | srt |
| crunchyroll | subsrt | fetch | vtt |
| osmosis | subsrt | fetch / xhr | vtt |
| pbs | subsrt | xhr | — |
| internetfundamentals | subsrt | xhr | — |
| mgtv | subsrt | fetch | — |
| smartpoly.teachable.com | webvtt | xhr / fetch | — |
| themotionmagic | subsrt | — | — |
| movie-web | subsrt | fetch | — |
| deeplearning | subsrt | — | vtt |
| weverse | subsrt | — | vtt |
| docubay | webvtt | xhr | — |
| hubspotvideo | webvtt | xhr | — |
| quantinsti | subsrt | — | vtt |
| paramountplus | text_track_dynamic | — | — |
| plex.tv | text_track_dynamic | — | — |
| pluto | text_track_dynamic | — | — |
| ted | multi_attach_vtt | fetch | — |
| devEpicGames | multi_attach_vtt | xhr | — |
| hikaritv | multi_attach_vtt | xhr | — |
| khflix | multi_attach_vtt | xhr | — |
| donghuaworld | multi_attach_vtt | xhr | — |
| lecturio | multi_attach_vtt | xhr | — |
| ganjingworld | multi_attach_vtt | fetch | — |
| fautv | text_track | — | — |
| vimeo | text_track | — | — |
| player.vimeo | text_track | — | — |
| laracasts.com | text_track_dynamic | — | — |
| start-dev | text_track_dynamic | — | — |
| tv.adobe | text_track | — | — |
| threejs-journey | text_track | — | — |
| comsol | text_track | — | — |
| jove | text_track | — | — |
| rumble | text_track | — | — |
| shibaristudy-com | text_track_dynamic | — | — |
| codewithchris | general | fetch | — |
| panopto | general | fetch | — |
| edx | general | — | — |
| ardmediathek | ebutt | fetch | — |
| bbc-iplayer | ebutt | fetch | — |
| bbc-emp | xml | xhr | — |
| bbc | ebutt | fetch | — |
| zdf.de | ebutt | fetch / xhr | — |
| piped.video | ebutt | fetch | — |
| disneyplus | disneyplus | — | — |
| mubi | mubi | fetch | — |
| hulu | xml | fetch | — |
| youku.tv | subsrt | fetch | ass |
| starz | subsrt | — | vtt |
| jointherealworld | subsrt | xhr | vtt |
| rtve | subsrt | fetch | vtt |
| dmm | subsrt | fetch | vtt |
| www.iq.com | xml | — | — |
| cbsnews | xml | — | — |
| gaia | multi_attach_vtt | xhr | vtt |
| medbridge | multi_attach_vtt | xhr | vtt |
| urplay | webvtt | xhr | vtt |
| medici | subsrt | xhr | — |
| asu | webvtt | xhr | vtt |
| gagaoolala-verticals | subsrt | xhr | vtt |
| gagaoolala | webvtt | xhr | vtt |
| curiositystream | webvtt | xhr | vtt |
| shangpaAcademy | webvtt | xhr | vtt |
| codewithandrea | webvtt | fetch / xhr | — |
| ucdavis | webvtt | xhr | vtt |
| f1tv | webvtt | xhr | — |
| wwwformula1 | webvtt | xhr | — |
| datacamp | webvtt | xhr | — |
| coindesk | subsrt | xhr | — |
| dr | subsrt | — | — |
| nrk | webvtt | — | — |
| mediadelivery | subsrt | — | — |
| tver | subsrt | xhr | — |
| aljazeera | subsrt | xhr | — |
| arte | webvtt | xhr | — |
| updraft | webvtt | xhr | — |
| learningSap | text_track_dynamic | — | — |
| billboard-com | text_track_dynamic | — | — |
| abema-tv | live_attach | — | — |
| whop-com | subsrt | xhr | vtt |
| feynmanlectures | subsrt | xhr | — |
| wistia-hook | general | fetch | — |
| graphpad | general | fetch | — |
| wistia | general | fetch | — |
| sooplive | general | xhr | — |
| msn | subsrt | xhr | — |
| www.ti.com.cn | subsrt | xhr | — |
| edclub.com | webvtt | xhr | — |
| mediaspace | webvtt | xhr | — |
| nbcnews | subsrt | fetch / xhr | vtt |
| investopedia | subsrt | xhr | — |
| master-dev | subsrt | fetch / xhr | vtt |
| live_attach_basic | live_attach | — | — |
| dramawave-chartdrama | text_track | — | — |
| kaltura-embed | text_track | — | — |
| sbs | subsrt | fetch / xhr | — |
| common-text-track | text_track | — | — |
| common-vtt-jw | subsrt | fetch / xhr | vtt |
| av-tib-eu | subsrt | xhr | vtt |
| epicreact-dev | subsrt | xhr | vtt |
| app-acilearning | subsrt | xhr | vtt |
| app-tonebase | subsrt | xhr | vtt |
| kaltura | text_track_dynamic | — | — |
| nvidia-on-demand | text_track_dynamic | — | — |
| common-vtt | subsrt | fetch / xhr | — |
| common-ebutt | ebutt | fetch | — |

## Manga/image coverage

The shipped list advertises 238 manga-site entries. Representative names include Pixiv, MANGA Plus, Zebrack, Comic Fuz, MangaDex, ShonenJumpPlus, Comic Days, ComicWalker, Web Ace, BOOK WALKER, Gangan Online, Bilibili Manga, Comic Naver, Webtoons, Lezhin Comics, Piccoma, Kakao, GANMA and many independent readers. Records may carry browser-platform qualifiers, e.g. Chrome/Firefox/Safari/userscript/mobile variants; those are advertisements, not validated capability. The manga list is not a subtitle list, even where domains overlap.

Observed image workflows distinguish translating/restoring a single image, retranslating, translating a supported reader, detecting missing manga targets, reporting blocked image access, downloading model/backend resources, and cleaning comic caches. Client OCR assets do not establish that all image processing is local: remote model/service/quota strings also exist. Tests must cover visible and lazy images, canvas readers, cross-origin resources, vertical text, rotation, text masks, preserved artwork, and translation toggle restoration.

## Version comparison: 1.34.2 and installed 1.34.4

Observed differences from parsed JSON, aligned by stable rule ID where possible rather than array position:

- Manifest: version changes to 1.34.4 and installed copy adds a public extension `key`; other manifest objects compare equal.
- All 22 `locales.json` dictionaries compare equal; English has no added/removed/changed strings. The same labels do not imply bundles are identical.
- Main configuration top-level differences are `loginAiQuotaGift`, `generalRule`, `translationServices`, `rules`, and added migration key `blockUrls.remove_v.[1.34.4]`.
- Login gift configuration adds `claimOnPageInit=true` and lowers `maxDailyAutoClaimAttempts` from 3 to 2.
- General inline-selector list changes `p > button` to `p button` and shrinks from 8 to 7 entries.
- DeepSeek service model metadata changes, including `deepseek-v4.1-flash-1017`; SiliconCloud model lists/overrides add a V4.1 Flash variant. These are package observations, not verified provider availability.
- Rule count changes from 800 to 801. Added IDs: `facebookBusinessInbox`, `webtoon.kakao.com`, `skebetter`, `extra-block-sites`. Removed IDs: `qidian`, `docs-tutorials`, `coinmarketcap`.
- Changed common IDs: `github` selectors; `ru-sites` exclusions; `speed-manga` matches; `manwadd`, `ridibooks.com`, `hentaizap` image rules; `v-comic` image rules and matches. Added removal migration targets a Steam loopback URL.
- The advertised subtitle and manga site lists compare equal. No new end-user feature can be established solely from this patch-level configuration comparison.

## HY-MT2 parity constraints and acceptance work

The requested engine choice replaces translation service infrastructure. It does not by itself provide OCR, speech recognition, text-to-speech, dictionary definitions, open-ended writing, cloud accounts/sync, hosted document layout reconstruction, image inpainting, or provider-specific subtitle acquisition. Those workflows remain part of the parity inventory and require explicit capability implementations or clearly documented gaps. No remote-provider fallback should be silently introduced.

Before declaring parity, create observable acceptance cases for each matrix row and each advertised supported platform. At minimum:

1. Establish local model load/download/progress/cancellation/error behavior and language limits; measure representative latency/memory on the target browser.
2. Verify reversible page rendering with rich links, inline markup, math/code exclusions, tables, RTL, dynamic content, nested frames, shadow roots and SPA navigation.
3. Verify input undo/IME/editor behavior; hover and selection targeting; shortcuts and exclusions; settings migration/import/export persistence.
4. Verify each document input and export round trip with fixtures covering layout, encodings and non-text objects.
5. Verify subtitle acquisition separately from translation: original/target language cues, timing, overlaps, seeking, playback rate, fullscreen, PiP, live sessions, missing tracks and request limits.
6. Verify image OCR/layout/restoration and supported-reader access using independently created or authorized test images.
7. Verify privacy/consent and failure surfaces for each network-dependent auxiliary service. A visible button or localization key is never a completed capability.

Unknowns left by this static pass include exact effective remote settings, authenticated backend APIs, quotas and plans, experiment rollout, actual supported format limits, reliable per-platform caption acquisition, UX placement under all themes, and successful end-to-end behavior. These should remain visible in the project backlog until directly validated.

## Independent implementation and verification evidence

The inventory above describes the inspected reference artifacts. The following describes separately implemented repository code and bounded verification, and does not establish complete reference-product parity.

- `features/document-translation`: source-position Markdown replacements preserve code, complete links, reference definitions and bare URLs; JSON translates string values while preserving keys and scalar types; subtitle writers retain cue identifiers/timestamps/settings/markup, ASS controls and drawing paths, and LRC metadata. DOCX translation requests cover complete paragraphs; run/property structures survive, while target text distribution across runs is approximate and does not establish semantic emphasis alignment. EPUB follows container/package content references, retains assets and identifiers, updates language metadata, and writes an uncompressed first `mimetype` ZIP entry. These choices were checked against [CommonMark](https://spec.commonmark.org/0.31.2/), [WebVTT](https://www.w3.org/TR/webvtt1/), [ASS override documentation](https://aegisub.org/docs/latest/ass_tags/), [WordprocessingML structure](https://learn.microsoft.com/en-us/office/open-xml/word/structure-of-a-wordprocessingml-document), and [EPUB 3.3](https://www.w3.org/TR/epub-33/).
- `features/image-translation`: Tesseract.js recognizes local image pixels and returns paragraph text, confidence and bounding rectangles. Worker and core code are packaged locally; traineddata may download as data and be cached. Export supports a self-contained original-image/bilingual-text HTML view and an original-size PNG with region-constrained translated text. PNG covering estimates a flat background from surrounding pixels; it is not artwork reconstruction or deep inpainting. Text wraps and fits using measured glyph bounds, with a legibility error when it cannot fit at the minimum font size. Complex backgrounds, overlapping/rotated/vertical text and OCR error correction remain limitations. [Tesseract.js local installation](https://github.com/naptha/tesseract.js/blob/v7.0.0/docs/local-installation.md) and [API documentation](https://github.com/naptha/tesseract.js/blob/v7.0.0/docs/api.md) informed worker configuration.
- `features/pdf-translation`: PDF.js renders original pages and extracts a separate reading stream; an injected OCR callback handles pages without extracted text. The exported HTML retains original page images beside original/translated text. Native PDF export alternates original page images at their original dimensions with automatically paginated translation pages. These are rasterized reading pages, not searchable/editable text. Neither export reconstructs the original PDF text layout or preserves interactive PDF fields as fields. Multi-column reading order and complex formula semantics remain unverified. Packaged worker/font/CMap/WASM resources support local processing. [PDF.js](https://github.com/mozilla/pdf.js) provides parsing/rendering; the official legacy build is used for compatibility.

Meaningful round-trip tests are in `tests/document-translation.test.ts`; real PDF extraction/rendering and a generated source fixture are in `tests/pdf-translation.test.ts` and `tests/fixtures/reading-sample.pdf`. Image OCR tests use actual Tesseract recognition when local English traineddata is available; the local verification run executed that case successfully. PNG tests check unchanged dimensions, unchanged pixels outside translated regions, clamped boxes, transparent backgrounds, and rejection of text that cannot fit legibly. Native CJK rendering QA registers the installed CJK font when available.

`tests/e2e/image-pdf.spec.ts` is explicitly enabled with a cached-model profile. A real Chrome extension run verified an image containing HELLO WORLD through local OCR, real HY-MT2 Chinese inference and bilingual HTML export, followed by one PDF page through PDF.js extraction, real HY-MT2 inference and bilingual HTML export. A subsequent real-model UI run also downloaded a translated 900-by-180 PNG; visual review confirmed clear Chinese text covering the original English within the image. The run asserted a complete preexisting model cache and observed no page errors. A separate extension-CSP probe verified real OCR/PDF workers with deterministic injected translation, observed no remote script/worker requests, and visually inspected exported source-page views. These are small-fixture observations, not proof of arbitrary document, image, language or platform coverage.

## Representative video and meeting caption implementation

The independent `features/video-subtitles` implementation now combines ordinary browser TextTracks with hostname-constrained DOM-caption candidates for YouTube, Netflix, Udemy, Google Meet, Zoom web and Teams web. These candidates were tested using original synthetic local DOM fixtures, not authenticated production playback/calls. The 214-site reference list above remains an advertised inventory; it is not a list of implemented or production-verified Yaku adapters.

The standard-track path preserves native cue timestamps and original WebVTT text, prioritizes current/near-future loaded cues, and can explicitly pretranslate all already loaded cues. DOM capture waits briefly for changing caption text, coalesces growing utterances, rejects stale asynchronous output, caches repeated text, and merges immediate remounts of the same observed caption. It inserts plain-text translations while retaining/restoring original nodes, supports bilingual/translation-only display, keeps speaker labels when a candidate exposes them, and prefers loaded native tracks to prevent duplicate overlays. Native fonts/colors are sampled from caption text. Each injected document handles its own frame; this feature does not bypass cross-origin boundaries or fetch private player endpoints.

New public methods are `pretranslate`, `getTranscript`, and asynchronous `exportSubtitles` returning `{blob,name}` alongside existing `refresh`/`dispose`. Export formats are SRT and VTT. DOM-derived exports use `observed-captions` filenames and VTT adds an explicit approximate-timing NOTE. DOM timestamps use observed player time, or elapsed observation time for meetings; they are not source-track timing. Only loaded/observed captions are available. No microphone capture, ASR, unseen future-caption inference, missing-track generation, automatic caption-toggle clicking, or full-video download is implied.

Public DOM facts consulted include the [Advanced Profanity Filter player examples](https://github.com/FrostCo/AdvancedProfanityFilter/wiki/Audio-Muting:-Notes), [Meet caption fixture](https://github.com/chen-ye/meet-cc-transcript/blob/master/fixtures/caption-region-sample.html), [Sotto selector observations](https://github.com/leansii/sotto/blob/main/src/selectors.js), [Teams caption issue evidence](https://github.com/IsmaelMartinez/teams-for-linux/issues/1554), and [DualSubs platform description](https://github.com/Michael13Lu/DualSubs). Selectors were used as structural observations; no third-party implementation was copied. Udemy's CSS-substring candidate remains an inference until a real session can be inspected. Google Meet supports an observed locale-independent `jsname` container in addition to English accessibility-label candidates. All private CSS selectors may change without notice.

`tests/video-subtitles.test.ts` and `tests/video-subtitles-dom.test.ts` verify native timing/markup restoration, loaded-cue pretranslation/export, stale-cue rejection, the six representative DOM shapes, incremental utterances, remount deduplication, speaker preservation, translation-only restoration, honest observed export names/timing, host constraints, and preference for native tracks. Production-platform availability remains unknown until representative authenticated sessions are exercised.

Additional bounded browser evidence: a real Chrome run exercised actual VTTCue objects through the real cached HY-MT2 model and exported the original 0–5 and 65–70 second cue timings with Chinese translations. A separately intercepted YouTube-host synthetic DOM fixture translated a visible English caption into Chinese and exported an `observed-captions.vtt` file containing the approximate-timing NOTE. The synthetic fixture screenshot explicitly identifies that it is not production playback. No authenticated platform session was exercised. Unit regressions additionally verify that appearance changes retain departed meeting-caption source/history, target-language changes retranslate retained history, and refreshes preserve cue IDs without duplicates.

The page-image production route was also exercised through debugger dispatch of the existing registered context-menu event, then the real background grant, content handler, offscreen OCR and local HY-MT2 worker. The replacement PNG decoded successfully at the original 900-by-180 dimensions and visibly contained Chinese text. Restoring recovered the entire original `picture`/`source`/`img` HTML, including responsive source attributes. This verifies the registered handler and downstream pipeline, not native operating-system menu item selection. Test fixture URLs use unique nonces to avoid selecting restored tabs from earlier persistent-profile runs.
