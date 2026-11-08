import type { Settings } from "./index";

export interface GlossaryContext {
  targetLanguage: string;
  url?: string;
}

export function validGlossaryUrlPattern(pattern: string): boolean {
  if (!pattern.trim() || !/^(?:https?|\*|file):\/\//i.test(pattern))
    return false;
  try {
    new URLPattern(pattern);
    return true;
  } catch {
    return false;
  }
}

/** URL scopes outrank language-only scopes; later collections break equal-specificity ties. */
export function resolveGlossary(
  settings: Pick<Settings, "glossary" | "glossaries">,
  context: GlossaryContext,
): Record<string, string> {
  let url: URL | undefined;
  if (context.url) {
    try {
      const parsed = new URL(context.url);
      if (["http:", "https:", "file:"].includes(parsed.protocol)) url = parsed;
    } catch {
      url = undefined;
    }
  }
  const selected = settings.glossaries
    .filter((collection) => {
      if (
        collection.targetLanguage &&
        collection.targetLanguage !== context.targetLanguage
      )
        return false;
      if (!collection.urlPatterns.length) return true;
      return (
        !!url &&
        collection.urlPatterns.some((pattern) =>
          new URLPattern(pattern).test(url!.href),
        )
      );
    })
    .map((collection, index) => ({
      collection,
      index,
      priority:
        (collection.urlPatterns.length ? 2 : 0) +
        (collection.targetLanguage ? 1 : 0),
    }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index);
  return Object.fromEntries([
    ...Object.entries(settings.glossary),
    ...selected.flatMap(({ collection }) => Object.entries(collection.terms)),
  ]);
}
