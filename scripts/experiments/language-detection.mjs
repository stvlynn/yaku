import { launchExtension, saveResult } from "./harness.mjs";

const fixtures = [
  {
    name: "english-paragraph",
    htmlLanguage: "en",
    target: "en",
    text: "The museum opens at nine every morning. Visitors can buy tickets online. Children under six enter for free. Please keep your ticket until you leave. The final gallery contains a map of the city.",
  },
  {
    name: "wrong-html-language",
    htmlLanguage: "en",
    target: "en",
    text: "Le musée ouvre à neuf heures chaque matin. Les visiteurs peuvent acheter leurs billets en ligne. Les enfants de moins de six ans entrent gratuitement. Veuillez conserver votre billet jusqu’à votre départ.",
  },
  {
    name: "mixed-english-chinese",
    htmlLanguage: "en",
    target: "en",
    text: "The museum opens at nine every morning. Visitors can buy tickets online. 博物馆每周一闭馆，请提前安排您的参观时间。儿童可以免费参观，但需要由成年人陪同。",
  },
  { name: "short-ambiguous", htmlLanguage: "en", target: "en", text: "Gift" },
  {
    name: "short-english",
    htmlLanguage: "en",
    target: "en",
    text: "Hello world.",
  },
  {
    name: "simplified-chinese",
    htmlLanguage: "zh",
    target: "zh-Hant",
    text: "这座博物馆每天早上九点开放。游客可以在网上购买门票。六岁以下的儿童可以免费进入，但必须由成年人陪同。请保留门票，直到离开博物馆。最后一个展厅里有一张城市地图。",
  },
  {
    name: "traditional-chinese",
    htmlLanguage: "zh-Hant",
    target: "zh",
    text: "這座博物館每天早上九點開放。遊客可以在網上購買門票。六歲以下的兒童可以免費進入，但必須由成年人陪同。請保留門票，直到離開博物館。最後一個展廳裡有一張城市地圖。",
  },
  {
    name: "traditional-same-target",
    htmlLanguage: "zh-Hant",
    target: "zh-Hant",
    text: "這座博物館每天早上九點開放。遊客可以在網上購買門票。六歲以下的兒童可以免費進入，但必須由成年人陪同。請保留門票，直到離開博物館。最後一個展廳裡有一張城市地圖。",
  },
];
let session;
const result = { fixtures: [] };
try {
  session = await launchExtension();
  result.browserVersion = session.browserVersion;
  for (const fixture of fixtures) {
    const detection = await session.page.evaluate(
      (text) => chrome.i18n.detectLanguage(text),
      fixture.text,
    );
    const observation = {
      ...fixture,
      detection,
      metadataOnlyWouldSkip:
        fixture.htmlLanguage.toLowerCase() === fixture.target.toLowerCase(),
    };
    result.fixtures.push(observation);
    console.log(JSON.stringify(observation));
  }
} catch (error) {
  result.error = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  saveResult("language-detection", result);
  await session?.context.close();
}
