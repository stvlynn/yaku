import {
  launchExtension,
  profileDirectory,
  requireCachedModel,
  saveResult,
} from "./harness.mjs";
const variants = [
  { name: "official-baseline" },
  {
    name: "explicit-script",
    context:
      "Use Traditional Chinese characters (繁體中文) throughout the translation. Convert Simplified Chinese characters to Traditional Chinese, including source passages already in Chinese. Preserve all sentences and information.",
  },
  {
    name: "chinese-language-script-instruction",
    context:
      "請將全部文字完整翻譯為繁體中文，輸出必須全部使用繁體字，不可使用簡體字。保留所有句子、數字與資訊，只輸出譯文。",
  },
];
const fixtures = [
  {
    name: "mixed-existing-simplified",
    text: "Please note: 这座博物馆周一闭馆。Visitors need 2 tickets.",
  },
  {
    name: "english-library",
    text: "The library opens at nine every morning. Students need 2 tickets.",
  },
  { name: "already-traditional", text: "這座博物館週一閉館，請提前購買門票。" },
];
const result = {
  profileDirectory,
  targetLanguage: "zh-Hant",
  languageNameFromSource: "Traditional Chinese",
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
    const observation = { source: fixture, variants: [] };
    for (const variant of variants) {
      const started = performance.now();
      const output = await session.send("translate", {
        id: crypto.randomUUID(),
        text: fixture.text,
        targetLanguage: "zh-Hant",
        context: variant.context,
      });
      observation.variants.push({
        ...variant,
        output,
        elapsedMs: performance.now() - started,
      });
      console.log(
        JSON.stringify({
          fixture: fixture.name,
          ...observation.variants.at(-1),
        }),
      );
      result.fixtures = [
        ...result.fixtures.filter((item) => item.source.name !== fixture.name),
        observation,
      ];
      saveResult("script-variant-ablation", result);
    }
  }
} catch (error) {
  result.error = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  saveResult("script-variant-ablation", result);
  await session?.context.close();
}
