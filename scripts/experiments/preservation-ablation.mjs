import {
  launchExtension,
  profileDirectory,
  requireCachedModel,
  saveResult,
} from "./harness.mjs";
const preservationInstruction =
  "Translate the entire text, sentence by sentence, into the requested target language. Preserve every sentence and all information, including passages already written in the target language. Keep those passages in the output, adapting their script to the requested target variant when necessary. Keep the original sentence order, numbers, names, and inline markers. Do not summarize, omit, or add content. Output only the complete translation.";
const markerInstruction =
  'Keep every inline <yaku-link id="0"> and </yaku-link> tag around its corresponding translated phrase. Preserve the empty <yaku-keep id="1"></yaku-keep> marker exactly once and empty. Do not add, remove, duplicate, or rename markers.';
const fixtures = [
  {
    name: "museum-mixed-regression",
    targetLanguage: "zh",
    text: "The museum opens at nine every morning. Visitors can buy tickets online. 博物馆每周一闭馆，请提前安排您的参观时间。儿童可以免费参观，但需要由成年人陪同。",
    semanticChecks: [
      "Opening at nine",
      "Online tickets",
      "Monday closure and planning ahead",
      "Free children accompanied by adults",
    ],
  },
  {
    name: "numbers-and-alternating-languages",
    targetLanguage: "zh",
    text: "Order 24 ships on Friday. 订单编号为731，地址是深圳。Keep the total at $20.",
    literalChecks: ["24", "731", "深圳", "20"],
    semanticChecks: ["Friday", "Order number", "Address", "Total"],
  },
  {
    name: "preserve-english-and-translate-chinese",
    targetLanguage: "en",
    text: "The order number is 731. 明天上午九点开门。Save $20.",
    literalChecks: ["731", "20"],
    semanticChecks: [
      "Order number",
      "Opens tomorrow at nine in the morning",
      "Save twenty dollars",
    ],
  },
  {
    name: "mixed-link-and-opaque-code",
    targetLanguage: "zh",
    text: 'Read <yaku-link id="0">the full report</yaku-link> before Friday. 订单编号是731。Run <yaku-keep id="1"></yaku-keep> now.',
    context: markerInstruction,
    literalChecks: ["731", '<yaku-keep id="1"></yaku-keep>'],
    semanticChecks: [
      "Full report link",
      "Before Friday",
      "Order number",
      "Run protected code now",
    ],
  },
  {
    name: "requested-traditional-script",
    targetLanguage: "zh-Hant",
    text: "Please note: 这座博物馆周一闭馆。Visitors need 2 tickets.",
    literalChecks: ["2"],
    semanticChecks: [
      "Monday closure",
      "Visitors need two tickets",
      "Requested Traditional script rather than preserving Simplified source",
    ],
  },
];
const result = {
  profileDirectory,
  preservationInstruction,
  usesModelStubs: false,
  fixtures: [],
};
let session;
try {
  session = await launchExtension();
  result.backgroundIdentity = session.backgroundIdentity;
  result.cache = await requireCachedModel(session.send);
  await session.context.setOffline(true);
  await session.send("prepare");
  for (const fixture of fixtures) {
    const observation = { fixture, variants: [] };
    for (const [name, context] of [
      ["official-baseline", fixture.context],
      [
        "preserve-all-content",
        [fixture.context, preservationInstruction].filter(Boolean).join("\n"),
      ],
    ]) {
      const started = performance.now();
      const output = await session.send("translate", {
        id: crypto.randomUUID(),
        text: fixture.text,
        context,
        targetLanguage: fixture.targetLanguage,
      });
      const variant = {
        name,
        context,
        output,
        elapsedMs: performance.now() - started,
        literalChecks: Object.fromEntries(
          (fixture.literalChecks ?? []).map((value) => [
            value,
            output.text.includes(value),
          ]),
        ),
      };
      observation.variants.push(variant);
      console.log(JSON.stringify({ fixture: fixture.name, ...variant }));
      result.fixtures = [
        ...result.fixtures.filter((item) => item.fixture.name !== fixture.name),
        observation,
      ];
      saveResult("preservation-ablation", result);
    }
  }
} catch (error) {
  result.error = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  saveResult("preservation-ablation", result);
  await session?.context.close();
}
