import { chromium } from "@playwright/test";
import { saveResult } from "./harness.mjs";

const url =
  process.env.YAKU_PUBLIC_POST_URL ??
  "https://x.com/NASA/status/2040175881360941184";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = { url, completed: false, resourceFailures: [] };
try {
  const page = await browser.newPage();
  page.on("requestfailed", (request) =>
    evidence.resourceFailures.push({
      host: new URL(request.url()).hostname,
      error: request.failure()?.errorText,
    }),
  );
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  evidence.status = response?.status();
  try {
    await page
      .locator('article [data-testid="tweetText"]')
      .first()
      .waitFor({ timeout: 10000 });
  } catch {
    /* Record the actual landing surface below. */
  }
  evidence.dom = await page.evaluate(async () => {
    const articles = [...document.querySelectorAll("article")].map(
      (article) => ({
        hasText: Boolean(article.querySelector('[data-testid="tweetText"]')),
        permalinks: [...article.querySelectorAll("time")].map((time) =>
          time.closest("a")?.getAttribute("href"),
        ),
        media: [...article.querySelectorAll("img")]
          .map((img) => img.currentSrc || img.src)
          .filter((src) => src.startsWith("https://pbs.twimg.com/")),
      }),
    );
    const media = [
      ...new Set(articles.flatMap((article) => article.media)),
    ].slice(0, 5);
    const anonymousImages = await Promise.all(
      media.map(async (url) => {
        try {
          const response = await fetch(url, {
            mode: "cors",
            credentials: "omit",
            referrerPolicy: "no-referrer",
            signal: AbortSignal.timeout(5000),
          });
          return {
            url,
            status: response.status,
            contentType: response.headers.get("content-type"),
          };
        } catch (error) {
          return { url, error: String(error) };
        }
      }),
    );
    return {
      title: document.title,
      location: location.href,
      bodyPreview: articles.length
        ? undefined
        : document.body.innerText.slice(0, 300),
      articles,
      anonymousImages,
    };
  });
  evidence.completed = true;
} catch (error) {
  evidence.error = String(error);
} finally {
  saveResult("post-card-live-probe", evidence);
  console.log(JSON.stringify(evidence));
  await browser.close();
}
