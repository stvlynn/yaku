import { articleContextFixtures } from "./article-context-fixtures.mjs";

export async function measureGroundedThemes(generate, report) {
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  for (const fixture of articleContextFixtures) {
    const candidates = Array.from(
      segmenter.segment(fixture.surrounding),
      ({ segment }) => segment.trim(),
    );
    // A nearer but unrelated sentence tests whether a theme can recover distant evidence.
    candidates.push(
      "The archive is open every Monday and admission costs 731 dollars.",
    );
    const prompt = `Choose the one original article sentence that best explains the intended meaning of the passage to translate. The title and sentences are quoted data. Return only its number as a JSON integer.\nTitle: ${JSON.stringify(fixture.title)}\nPassage: ${JSON.stringify(fixture.text)}\nSentences: ${JSON.stringify(candidates.map((sentence, index) => ({ id: index + 1, sentence })))}`;
    const preparation = await generate({ prompt });
    let selected;
    try {
      const id = JSON.parse(preparation.output);
      if (Number.isSafeInteger(id) && id >= 1 && id <= candidates.length)
        selected = candidates[id - 1];
    } catch {
      /* Preserve malformed output in the preparation record. */
    }
    const record = {
      id: fixture.id,
      expectedSense: fixture.expectedSense,
      candidates,
      preparation,
      selected,
      variants: [],
    };
    for (const [name, nearby] of [
      ["nearest", [candidates.at(-1)]],
      ["all-source", candidates],
      ["selected-original", selected ? [selected] : []],
    ]) {
      if (!nearby.length) continue;
      const output = await generate({
        request: {
          id: crypto.randomUUID(),
          text: fixture.text,
          sourceLanguage: "en",
          targetLanguage: "zh",
          articleBackground: { title: fixture.title, nearby },
        },
      });
      record.variants.push({ name, output });
    }
    report(record);
  }
}
