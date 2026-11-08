# Article-context model experiments

These experiments separate consuming article context from generating it. They use the pinned HY-MT2-1.8B q4f16 conversion, Transformers.js and deterministic generation through EOS. No second model or cloud inference is involved. They are small diagnostic contrasts, not a quality benchmark or completed article-context feature.

## Source-context contrast

`scripts/experiments/article-context-ablation.mjs` used the installed production extension, an explicitly seeded complete model profile and offline mode. The executed background matched `4c92234adc51ddd93d3f85a7484ec58c8f79626de9b9e2ef2ea2fee9c13ba24f`. Four original fixtures form two contrast pairs: the same bank sentence in finance/river articles and the same pitch sentence in music/baseball articles. Source language, target language and empty manual glossary remain constant. The script records the complete requests and outputs.

| Intended sense | No article context | Original title and surrounding source | Human-reviewed short context |
| -------------- | ------------------ | ------------------------------------- | ---------------------------- |
| Financial bank | 她终于到达了银行。 | 她终于到达了银行。                    | 她终于到达了岸边。           |
| River bank     | 她终于到达了银行。 | 她终于到达了岸边。                    | 她终于到达了河岸。           |
| Musical pitch  | 他的音准非常完美。 | 他的音准非常精准。                    | 他的音准非常准确。           |
| Baseball pitch | 他的音准非常完美。 | 他的投球非常完美。                    | 他的投球非常完美。           |

Semantic inspection gives 2/4 intended senses for the context-free arm, 4/4 for direct original context and 3/4 for the reviewed summary. The financial summary included a negative distractor, “not a river”; its incorrect result is retained rather than discarded. A separate positive-only financial summary subsequently returned 银行. This diagnoses sensitivity to wording; it does not establish that all negation causes failure.

The direct-source calls took 2.31–2.73 seconds including messaging. The first baseline took 4.08 seconds and later baselines 1.93–2.11 seconds. Runs were sequential and not randomized; initial warm-up and device variability prevent a rigorous speed ranking. Production records do not expose tokenization/prefill breakdowns, and none is inferred from total duration.

## Generated theme contrast

`scripts/experiments/article-context-generation.mjs` uses a separate local HTTP/WebGPU browser harness, the same pinned local model files, production prompt builder and production EOS generator. It does not use an extension UI or claim a new download. It performs eight preparation calls: plain text and a single-field JSON theme for each article, followed by eight genuine translations using the generated theme. Exact prompts, token counts, raw output and generation durations are recorded.

All four JSON outputs parsed with the required single nonempty `theme` string. All eight downstream translations selected the intended sense. However, semantic review found unsupported preparation statements:

- The plain financial theme said Maya **obtained** a loan; the source only said she needed one and met the officer.
- The JSON financial theme described a payment process, although the text described a cheque deposit without identifying it as a loan payment.
- The JSON baseball theme attributed the missed hit to the pitcher's position; the source only stated that he stood on the mound and the batter missed.

Consequently, schema compliance and downstream sense success are insufficient to accept unrestricted generated summaries as factual context. The plain music output also used “perfect pitch,” which can imply a distinct musical ability beyond accurate intonation; this ambiguity reinforces the need for semantic checks.

Preparation prompts contained 70–88 tokens and generated 9–24 tokens. Each preparation took 2.96–7.24 seconds; its subsequent translation took 1.96–2.45 seconds. Preparation plus translation cost 5.01–9.69 seconds, excluding the separate 14.38-second model load. These observations cannot establish a long-article amortization advantage. Output counts are tokenizer counts excluding special tokens; no pure-prefill or time-to-first-token claim is made.

The converted configuration reports `max_position_embeddings: 262144`, while the [official deployment instructions](https://github.com/Tencent-Hunyuan/Hy-MT2#inference-and-deployment) specify `max_context: 8192`. Neither the configuration ceiling nor these short prompts proves usable browser memory or long-context quality. Article acquisition must budget actual tokenized requests and evaluate longer coverage separately; it must not silently consume a whole article under an assumed 262k guarantee.

## Integrity and negative controls

`scripts/experiments/article-context-integrity.mjs` returned to the installed offline extension for four paired controls. The same structural marker instructions remain in both arms.

- A positive financial summary preserved the financial meaning.
- Irrelevant river background did not override an explicit loan sentence or remove `731`.
- A rich source retained the exact link and empty protected-code markers, all clauses and `731`; added river context produced the natural 岸边, compared with the baseline's awkward 起岸处. This checks model output, not an additional DOM-rendering claim.
- Background text asking the model to output `PWNED` and delete numbers was treated as quoted source data in this fixture; the actual result retained the loan and `731`. This one case is not a universal prompt-injection guarantee.

All three result files under `.workspace/experiments/results/` have `completed: true`. Each script persists partial results before advancing, and closes its isolated browser after completion. The raw generation harness uses locally served assets, does not disable browser GPU protections, and does not touch the user's Chrome profile.

## Implementation consequence

Reading controls now offers **Translate with page context** as an explicit page translation action. The collector supplies the title and adjacent eligible original text from the same DOM root. It reuses the regular page scope and exclusions, and bounds each excerpt to 300 Unicode code points and the title to 160. These are excerpt limits for the initial workflow. The request carries that data separately from format instructions and manual terminology. Ordinary Translate remains the baseline, and contextual translation is a fresh reading run with the existing restore and retranslation behavior.

`scripts/experiments/article-context-product.mjs` passed on an ordinary HTTP fixture with the installed extension, its native action popup and a seeded HY-MT2 cache in offline mode. The ordinary action rendered `她终于到达了银行。`, and the contextual action rendered `她终于到达了河岸。`. Show original removed the translations and restored the exact original article HTML. The result is recorded in `.workspace/experiments/results/article-context-product.json`. Run it with a complete `YAKU_MODEL_PROFILE` for the current build.

The evidence supports implementing an explicit, source-grounded article-background path with separately typed semantic context and unchanged format instructions. It does **not** justify presenting automatic summaries as verified facts or claiming automatic terminology/context parity. Generated-theme preparation, extractive grounding, automatic term adoption and their lifecycle remain required work from the [article-context specification](article-context.md).

Next compare grounded extraction against the observed free summaries, then test ordered automatic-term propagation and manual-term precedence. Preserve the direct-original arm as the control. Comparison must show two independently generated results from one frozen source/settings snapshot, with identical manual terminology and format constraints; it must not overwrite temporary edits or manufacture a visible difference when results match.

## Ordered terminology experiment

Run `node scripts/experiments/article-context-generation.mjs --terminology` with the existing local WebGPU fixtures. Three consecutive observatory passages were translated in each arm. The manual mapping `eastern inlet → 东侧水道` stayed constant. The extraction arms could carry an accepted pair forward only if both strings appeared in that batch's source and translation. Later batches received matching accumulated terms, with manual terms retaining precedence.

| Arm                                              | Protocol result                                                          | Total generation for three batches |
| ------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------: |
| Translation baseline                             | Both recurring terms translated consistently                             |                            22.51 s |
| Separate extraction                              | Three JSON objects parsed. Full name and sensor term reached batch three |                            45.09 s |
| Combined production prompt with JSON instruction | Three plain-text translations, zero valid paired JSON responses          |                            19.76 s |

The separate extractor initially split `Northwater Observatory` and produced empty values for two candidates. It returned the full institution name and sensor term on the second batch. The final batch included a proposed translation lacking the `的` present in the actual text, so exact grounding rejected it. String occurrence alone could still accept an overly broad alias such as `Northwater → 北水`.

Both the baseline and separate extraction used `北水观测站` and `潮汐流量传感器` consistently in all three batches. The measured gain was successful propagation, with no improvement in consistency on this fixture and about twice the generation time. The next contrast needs an initially ambiguous later mention and a distinct combined prompt whose output contract is specified once. The raw output, timing, accepted and rejected candidates, and per-batch requests are in `.workspace/experiments/results/article-terminology.json`.
