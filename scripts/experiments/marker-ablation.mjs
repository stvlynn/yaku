import {
  launchExtension,
  profileDirectory,
  requireCachedModel,
  saveResult,
} from "./harness.mjs";

const fixtures = [
  {
    segments: ["The bank ", "raised interest rates", " after the meeting."],
    tagged:
      'The bank <yaku-link id="0">raised interest rates</yaku-link> after the meeting.',
  },
  {
    segments: [
      "She gave the project ",
      "a green light",
      " after reviewing the report.",
    ],
    tagged:
      'She gave the project <yaku-link id="0">a green light</yaku-link> after reviewing the report.',
  },
  {
    tagged:
      'Read <yaku-link id="0">the full report</yaku-link> before Friday and save <yaku-em id="1">$20</yaku-em>.',
  },
];
const markerInstruction =
  'Formatting requirements: Keep every inline <yaku-link id="0"> and </yaku-link>, <yaku-em id="1"> and </yaku-em> tag exactly unchanged. Translate the complete paragraph naturally into the target language. Preserve each tag around the corresponding translated phrase. Do not add, remove, duplicate, or rename tags. Output only the translated paragraph with its tags.';
const result = { profileDirectory, fixtures: [] };
let session;
try {
  session = await launchExtension();
  const { context, send, browserVersion } = session;
  result.browserVersion = browserVersion;
  result.cache = await requireCachedModel(send);
  await context.setOffline(true);
  await send("prepare");
  const translate = (text, context) =>
    send("translate", {
      id: crypto.randomUUID(),
      text,
      context,
      targetLanguage: "zh",
    });
  for (const fixture of fixtures) {
    const observation = { source: fixture };
    if (fixture.segments) {
      const paragraph = fixture.segments.join("");
      observation.wholeParagraph = await translate(paragraph);
      const started = performance.now();
      observation.fragmentsWithContext = [];
      for (const segment of fixture.segments)
        observation.fragmentsWithContext.push(
          await translate(segment, paragraph),
        );
      observation.fragmentsTotalMs = performance.now() - started;
    }
    observation.markers = await translate(fixture.tagged, markerInstruction);
    const expected = fixture.tagged.match(/<\/?yaku-[^>]*>/g) ?? [];
    const actual = observation.markers.text.match(/<\/?yaku-[^>]*>/g) ?? [];
    observation.markerMultisetExact =
      [...expected].sort().join("|") === [...actual].sort().join("|");
    result.fixtures.push(observation);
    console.log(JSON.stringify(observation));
    saveResult("marker-ablation", result);
  }
} catch (error) {
  result.error = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  saveResult("marker-ablation", result);
  await session?.context.close();
}
