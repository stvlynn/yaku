const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });

export function contextualChanges(baseline: string, contextual: string) {
  if (baseline === contextual) return [{ text: contextual, changed: false }];
  const before = Array.from(
    segmenter.segment(baseline),
    ({ segment }) => segment,
  );
  const after = Array.from(
    segmenter.segment(contextual),
    ({ segment }) => segment,
  );
  const width = after.length + 1;
  const cells = (before.length + 1) * width;
  // Keep the reading dialog responsive even for unusually long passages.
  if (cells > 250_000) return [{ text: contextual, changed: false }];
  const lengths = new Uint32Array(cells);
  for (let row = before.length - 1; row >= 0; row--) {
    for (let col = after.length - 1; col >= 0; col--) {
      const index = row * width + col;
      lengths[index] =
        before[row] === after[col]
          ? 1 + lengths[index + width + 1]!
          : Math.max(lengths[index + width]!, lengths[index + 1]!);
    }
  }
  const retained = new Set<number>();
  let row = 0;
  let col = 0;
  while (row < before.length && col < after.length) {
    const index = row * width + col;
    if (before[row] === after[col]) {
      retained.add(col++);
      row++;
    } else if (lengths[index + width]! >= lengths[index + 1]!) row++;
    else col++;
  }
  const runs: { text: string; changed: boolean }[] = [];
  for (const [index, text] of after.entries()) {
    const changed = !retained.has(index);
    const last = runs.at(-1);
    if (last?.changed === changed) last.text += text;
    else runs.push({ text, changed });
  }
  return runs;
}
