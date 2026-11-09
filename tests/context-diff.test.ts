import { expect, it } from "vitest";
import { contextualChanges } from "../frontend/src/features/page-translation/model/context-diff";

it("highlights whole changed words in Chinese and preserves intervening text across separate edits", () => {
  for (const [before, after, changed] of [
    ["她终于到达了银行。", "她终于到达了河岸。", ["河岸"]],
    [
      "Run npm install and record 731 boats.",
      "Run npm ci and record 732 boats.",
      ["ci", "732"],
    ],
    ["原文不变。", "原文不变。", []],
  ] as const) {
    const runs = contextualChanges(before, after);
    expect(runs.map((run) => run.text).join("")).toBe(after);
    expect(runs.filter((run) => run.changed).map((run) => run.text)).toEqual(
      changed,
    );
  }
});
