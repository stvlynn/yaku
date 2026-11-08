import assert from "node:assert/strict";
import { launchExtension, requireCachedModel, saveResult } from "./harness.mjs";

const result = { completed: false };
let session;
try {
  session = await launchExtension();
  result.identity = session.backgroundIdentity;
  result.cache = await requireCachedModel(session.send);
  await session.context.setOffline(true);
  await session.send("prepare");
  const glossary = { molar: "臼齿" };
  const request = { sourceLanguage: "en", targetLanguage: "zh", glossary };
  const translate = (text, overrides = {}) =>
    session.send("translate", {
      ...request,
      ...overrides,
      id: crypto.randomUUID(),
      text,
    });
  const source =
    "The dentist prepared the molar for a ceramic crown. The crown will protect the damaged tooth.";
  const later = ["The crown arrived on Monday.", "The crown cost 731 dollars."];
  result.initial = await translate(source);
  result.extraction = await translate(source, {
    task: "extract-terminology",
    terminologyEvidence: { translation: result.initial.text, later },
  });
  assert.deepEqual(result.extraction.terms, { crown: "陶瓷冠" });
  result.later = [];
  for (const text of later) {
    const output = await translate(text, {
      glossary: { ...result.extraction.terms, ...glossary },
    });
    assert.match(output.text, /陶瓷冠/u);
    result.later.push(output.text);
  }
  assert.match(result.later[1], /731/u);
  result.completed = true;
} catch (error) {
  result.error = String(error);
  process.exitCode = 1;
} finally {
  saveResult("article-terminology-runtime", result);
  console.log(JSON.stringify(result));
  await session?.context.close();
}
