import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const movie = await readFile(
  process.env.YAKU_VIDEO_FIXTURE ?? ".workspace/research/flower.webm",
);
const evidence = { completed: false, pageErrors: [], fetches: [] };
const server = await createServer({
  configFile: false,
  appType: "custom",
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "native-caption-fixture",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const url = new URL(request.url, "http://localhost");
          if (url.pathname === "/clip.webm") {
            response.setHeader("content-type", "video/webm");
            response.end(movie);
            return;
          }
          if (url.pathname.endsWith(".vtt")) {
            evidence.fetches.push(url.pathname);
            if (url.pathname === "/failure.vtt") {
              response.statusCode = 404;
              response.end();
              return;
            }
            response.setHeader("content-type", "text/vtt;charset=utf-8");
            response.end(
              "WEBVTT\n\n00:00:00.000 --> 00:00:05.000\n" +
                (url.pathname === "/fr.vtt" ? "Bonjour." : "Hello world.") +
                "\n",
            );
            return;
          }
          if (url.pathname !== "/fixture") {
            next();
            return;
          }
          response.setHeader("content-type", "text/html;charset=utf-8");
          response.end(
            `<!doctype html><html><body><h1>Native track acquisition fixture, deterministic translation</h1><button id="opener">Export captions</button><video id="video" controls muted preload="metadata" src="/clip.webm"><track id="en" kind="subtitles" src="/en.vtt" srclang="en-US" label="Same label"><track id="fr" kind="captions" src="/fr.vtt" srclang="fr-FR" label="Same label"></video><pre id="result"></pre><script type="module">import {installVideoSubtitles,chooseSubtitleTrack} from '/frontend/src/features/video-subtitles/index.ts';import{defaultSettings}from'/frontend/src/entities/settings/index.ts';window.settings={...defaultSettings,sourceLanguage:'fr'};window.requests=[];window.errors=[];window.controller=installVideoSubtitles({document,getSettings:()=>window.settings,translate:async request=>{window.requests.push(request);return{id:request.id,text:'TRANSLATED '+request.sourceLanguage+': '+request.text,elapsedMs:0}},onError:error=>window.errors.push(String(error)),onTrackSelectionRequired:request=>chooseSubtitleTrack(request)});window.exportTrack=async options=>{const result=await window.controller.exportSubtitles(options);return{text:await result.blob.text(),name:result.name,tracks:window.controller.getTracks()}};document.querySelector('#opener').onclick=()=>{window.lastExport=window.exportTrack().then(result=>{document.querySelector('#result').textContent=result.text;return result},error=>{window.lastError=error.name;return null})};</script></body></html>`,
          );
        });
      },
    },
  ],
});
await server.listen();
const origin = server.resolvedUrls.local[0];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
page.on("pageerror", (error) => evidence.pageErrors.push(String(error)));
try {
  await mkdir(".workspace/qa", { recursive: true });
  await page.goto(origin + "fixture");
  await page.waitForFunction(
    () => window.controller && document.querySelector("video").readyState >= 1,
  );
  if (evidence.fetches.length)
    throw Error("Disabled native tracks loaded without command");
  evidence.first = await page.evaluate(() => window.exportTrack());
  if (
    !evidence.first.text.includes("Bonjour.") ||
    evidence.first.text.includes("Hello world.") ||
    evidence.first.tracks.some((track) => track.mode !== "disabled")
  )
    throw Error("Explicit language acquisition did not isolate/restore French");
  evidence.explicit = await page.evaluate(() =>
    window.exportTrack({
      trackId: window.controller
        .getTracks()
        .find((track) => track.language === "en-US").id,
    }),
  );
  if (
    !evidence.explicit.text.includes("Hello world.") ||
    evidence.explicit.text.includes("Bonjour.")
  )
    throw Error("Explicit native track mixed languages");
  await page.evaluate(() => {
    document.querySelector("#en").track.mode = "showing";
    document.querySelector("#fr").track.mode = "showing";
  });
  await page.locator("#opener").click();
  await page.getByRole("dialog").waitFor();
  evidence.pickerFocus = await page
    .locator("[data-yaku-caption-picker]")
    .evaluate((host) => host.shadowRoot.activeElement?.tagName);
  await page.getByRole("button", { name: /Same label.*2/ }).click();
  evidence.picker = await page.evaluate(() => window.lastExport);
  if (
    !evidence.picker.text.includes("Bonjour.") ||
    evidence.picker.text.includes("Hello world.")
  )
    throw Error("Ambiguous picker did not isolate chosen track");
  await page.locator("#opener").click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.lastError === "AbortError");
  if (await page.locator("[data-yaku-caption-picker]").count())
    throw Error("Escape leaked picker");
  evidence.escapeRestoredFocus = await page
    .locator("#opener")
    .evaluate((element) => document.activeElement === element);
  await page.locator("#opener").click();
  await page.getByRole("dialog").waitFor();
  await page.evaluate(() => {
    history.pushState({}, "", "/fixture?navigation=1");
  });
  await page.waitForFunction(
    () => !document.querySelector("[data-yaku-caption-picker]"),
  );
  evidence.navigationAborted = true;
  evidence.requests = await page.evaluate(() => window.requests);
  evidence.errors = await page.evaluate(() => window.errors);
  if (evidence.pageErrors.length || evidence.errors.length)
    throw Error("Browser reported errors");
  await page.screenshot({
    path: ".workspace/qa/native-track-acquisition.png",
    fullPage: true,
  });
  evidence.completed = true;
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.failure = String(error);
  throw error;
} finally {
  await writeFile(
    ".workspace/qa/native-track-acquisition.json",
    JSON.stringify(evidence, null, 2),
  );
  await browser.close();
  await server.close();
}
