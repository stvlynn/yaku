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

export async function measureArticleTerminology(
  generate,
  report,
  ambiguity = false,
  guided = false,
) {
  const sourcePassages = ambiguity
    ? [
        "The dentist prepared the molar for a ceramic crown. The crown will protect the damaged tooth.",
        "The crown arrived on Monday.",
        "The crown cost 731 dollars.",
      ]
    : passages;
  const manualTerms = ambiguity ? { molar: "臼齿" } : manual;
  for (const arm of guided
    ? ["recurrence-guided"]
    : ["baseline", "post-translation", "combined"]) {
    const accepted = new Map();
    const batches = [];
    for (const [index, text] of sourcePassages.entries()) {
      const glossary = Object.fromEntries([
        ...[...accepted].filter(([term]) => text.includes(term)),
        ...Object.entries(manualTerms),
      ]);
      const request = {
        id: crypto.randomUUID(),
        text,
        sourceLanguage: "en",
        targetLanguage: "zh",
        glossary,
      };
      let input = { request };
      if (arm === "combined" && ambiguity) {
        input = {
          prompt: `Translate the quoted English source into Chinese. Return a single JSON object with two keys: "translation" contains the complete Chinese translation, and "terms" contains mappings from exact English terms in the source to exact Chinese phrases in the translation. Include recurring names and technical terms. Follow these glossary mappings when present: ${JSON.stringify(glossary)}.\nSource: ${JSON.stringify(text)}`,
        };
      } else if (arm === "combined") {
        input = {
          request: {
            ...request,
            context: `Return only JSON with keys "translation" and "terms". Put the complete Chinese translation in "translation". ${protocol} Put that terminology object in "terms".`,
          },
        };
      }
      const generation = await generate(input);
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
        } else if (
          arm === "post-translation" ||
          (guided && index < sourcePassages.length - 1)
        ) {
          const later = sourcePassages.slice(index + 1).join("\n");
          batch.extraction = await generate({
            prompt: `${protocol}${guided ? ` Prefer the exact shorter form that occurs in both the current source and later passages. Ground its Chinese value in the current translation. Later passages: ${JSON.stringify(later)}` : ""}\nSource: ${JSON.stringify(text)}\nTranslation: ${JSON.stringify(batch.translation)}`,
          });
          candidate = JSON.parse(batch.extraction.output);
        }
        if (candidate !== undefined || arm === "combined") {
          batch.candidates = groundedTerms(candidate, text, batch.translation);
          for (const { term, target, grounded } of batch.candidates)
            if (
              grounded &&
              (!guided ||
                sourcePassages
                  .slice(index + 1)
                  .some((passage) => passage.includes(term))) &&
              !Object.hasOwn(manualTerms, term) &&
              !accepted.has(term)
            )
              accepted.set(term, target);
        }
      } catch (error) {
        batch.protocolError = String(error);
      }
      report({ arm, batches });
    }
  }
}
