import {
  languageName,
  type TranslationRequest,
} from "../../entities/translation";

export function terminologyPrompt(request: TranslationRequest) {
  const evidence = request.terminologyEvidence;
  if (!evidence)
    throw new TypeError(
      "Terminology extraction requires translation evidence.",
    );
  const source =
    request.sourceLanguage && request.sourceLanguage !== "auto"
      ? languageName(request.sourceLanguage)
      : "source-language";
  const target = languageName(request.targetLanguage);
  return `Return terms as a JSON object mapping exact ${source} source terms to exact ${target} phrases used in the translation. Include only recurring names or technical terms. Use an empty object if none qualify. Prefer the exact shorter form that occurs in both the current source and later passages. Ground its ${target} value in the current translation. Later passages: ${JSON.stringify(evidence.later.join("\n"))}\nSource: ${JSON.stringify(request.text)}\nTranslation: ${JSON.stringify(evidence.translation)}`;
}

export function groundedTerminology(
  output: string,
  request: TranslationRequest,
): Record<string, string> {
  const evidence = request.terminologyEvidence;
  if (!evidence) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const normalize = (value: string) =>
    value.normalize("NFKC").trim().toLowerCase();
  const manual = new Set(Object.keys(request.glossary ?? {}).map(normalize));
  return Object.fromEntries(
    Object.entries(parsed).filter(
      ([source, target]) =>
        source.trim() &&
        typeof target === "string" &&
        target.trim() &&
        !manual.has(normalize(source)) &&
        request.text.includes(source) &&
        evidence.translation.includes(target) &&
        evidence.later.some((passage) => passage.includes(source)),
    ),
  );
}
