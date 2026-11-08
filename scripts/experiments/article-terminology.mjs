const passages = [
  "The Northwater Observatory installed a tidal flux sensor beside the eastern inlet. The instrument measured changes in the water every 15 minutes.",
  "Technicians from the Northwater Observatory inspected the tidal flux sensor after the storm. They replaced its battery and recorded 731 readings.",
  "The Northwater Observatory published the tidal flux sensor measurements on Monday. The report also covered the western inlet.",
];
const protocol =
  "Return terms as a JSON object mapping exact English source terms to exact Chinese phrases used in the translation. Include only recurring names or technical terms. Use an empty object if none qualify.";
const manual = { "eastern inlet": "东侧水道" };

function groundedTerms(candidate, source, translation) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    throw new TypeError("Expected a terminology object");
  return Object.entries(candidate).map(([term, target]) => ({
    term,
    target,
    grounded: Boolean(
      term.trim() &&
      typeof target === "string" &&
      target.trim() &&
      source.includes(term) &&
      translation.includes(target),
    ),
  }));
}

export async function measureArticleTerminology(generate, report) {
  for (const arm of ["baseline", "post-translation", "combined"]) {
    const accepted = new Map();
    const batches = [];
    for (const text of passages) {
      const glossary = Object.fromEntries([
        ...[...accepted].filter(([term]) => text.includes(term)),
        ...Object.entries(manual),
      ]);
      const request = {
        id: crypto.randomUUID(),
        text,
        sourceLanguage: "en",
        targetLanguage: "zh",
        glossary,
      };
      const generation =
        arm === "combined"
          ? await generate({
              request: {
                ...request,
                context: `Return only JSON with keys "translation" and "terms". Put the complete Chinese translation in "translation". ${protocol} Put that terminology object in "terms".`,
              },
            })
          : await generate({ request });
      const batch = { request, generation, translation: generation.output };
      batches.push(batch);
      try {
        let candidate;
        if (arm === "combined") {
          const pair = JSON.parse(generation.output);
          if (typeof pair.translation !== "string" || !pair.translation.trim())
            throw new Error("Missing translated text");
          batch.translation = pair.translation;
          candidate = pair.terms;
        } else if (arm === "post-translation") {
          batch.extraction = await generate({
            prompt: `${protocol}\nSource: ${JSON.stringify(text)}\nTranslation: ${JSON.stringify(batch.translation)}`,
          });
          candidate = JSON.parse(batch.extraction.output);
        }
        if (arm !== "baseline") {
          batch.candidates = groundedTerms(candidate, text, batch.translation);
          for (const { term, target, grounded } of batch.candidates)
            if (grounded && !Object.hasOwn(manual, term) && !accepted.has(term))
              accepted.set(term, target);
        }
      } catch (error) {
        batch.protocolError = String(error);
      }
      report({ arm, batches });
    }
  }
}
