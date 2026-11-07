import {
  launchExtension,
  profileDirectory,
  requireCachedModel,
  saveResult,
} from "./harness.mjs";
const cases = [
  {
    text: "Gift",
    sourceLanguage: "de",
    sourceName: "German",
    expectedMeaning: "poison",
  },
  {
    text: "Gift",
    sourceLanguage: "en",
    sourceName: "English",
    expectedMeaning: "present",
  },
  {
    text: "pain",
    sourceLanguage: "fr",
    sourceName: "French",
    expectedMeaning: "bread",
  },
  {
    text: "pain",
    sourceLanguage: "en",
    sourceName: "English",
    expectedMeaning: "suffering",
  },
];
const result = {
  profileDirectory,
  targetLanguage: "zh",
  usesModelStubs: false,
  cases: [],
};
let session;
try {
  session = await launchExtension();
  result.backgroundIdentity = session.backgroundIdentity;
  result.cache = await requireCachedModel(session.send);
  await session.context.setOffline(true);
  await session.send("prepare");
  for (const sample of cases) {
    const observation = { sample, variants: [] };
    for (const variant of [
      { name: "declared-source-baseline" },
      {
        name: "explicit-source-hint",
        context: `The source text is in ${sample.sourceName}. Interpret ambiguous words in that source language.`,
      },
    ]) {
      const started = performance.now();
      const output = await session.send("translate", {
        id: crypto.randomUUID(),
        text: sample.text,
        sourceLanguage: sample.sourceLanguage,
        targetLanguage: "zh",
        context: variant.context,
      });
      observation.variants.push({
        ...variant,
        output,
        elapsedMs: performance.now() - started,
      });
      console.log(JSON.stringify({ sample, ...observation.variants.at(-1) }));
      result.cases = [
        ...result.cases.filter(
          (item) =>
            item.sample.text !== sample.text ||
            item.sample.sourceLanguage !== sample.sourceLanguage,
        ),
        observation,
      ];
      saveResult("source-language-ablation", result);
    }
  }
} catch (error) {
  result.error = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  saveResult("source-language-ablation", result);
  await session?.context.close();
}
