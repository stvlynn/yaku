import {
  launchExtension,
  profileDirectory,
  requireCachedModel,
  saveResult,
} from "./harness.mjs";

import { articleContextFixtures as fixtures } from "./article-context-fixtures.mjs";
const result = {
  completed: false,
  profileDirectory,
  usesModelStubs: false,
  scope:
    "Context use only: direct source versus human-reviewed context; no generated context or AI preparation claim.",
  fixtures: [],
  errors: [],
};
let session;
try {
  session = await launchExtension();
  result.identity = session.backgroundIdentity;
  result.cache = await requireCachedModel(session.send);
  await session.context.setOffline(true);
  const preparationStarted = performance.now();
  await session.send("prepare");
  result.modelPreparationMs = performance.now() - preparationStarted;
  for (const sample of fixtures) {
    const record = { ...sample, variants: [] };
    result.fixtures.push(record);
    for (const variant of [
      { name: "baseline" },
      {
        name: "original-title-and-surrounding-source",
        context: `Use the following article background only to resolve the meaning of the segment. Translate only the segment. Article title: ${JSON.stringify(sample.title)}\nSurrounding original text: ${JSON.stringify(sample.surrounding)}`,
      },
      { name: "reviewed-context", context: sample.reviewed },
    ]) {
      const request = {
        id: crypto.randomUUID(),
        text: sample.text,
        sourceLanguage: "en",
        targetLanguage: "zh",
        glossary: {},
        context: variant.context,
      };
      const started = performance.now();
      const output = await session.send("translate", request);
      const observation = {
        ...variant,
        request,
        output,
        roundTripMs: performance.now() - started,
      };
      record.variants.push(observation);
      saveResult("article-context-ablation", result);
      console.log(JSON.stringify({ id: sample.id, ...observation }));
    }
  }
  result.completed = true;
} catch (error) {
  result.errors.push(String(error));
  process.exitCode = 1;
} finally {
  saveResult("article-context-ablation", result);
  await session?.context.close();
}
