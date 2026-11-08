/** Browser behavior evidence only: no extension, model, provider account or remote caption endpoint. */
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const movie = await readFile(
  resolve(process.env.YAKU_VIDEO_FIXTURE ?? ".workspace/research/flower.webm"),
);
const requests = [];
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  requests.push(url.pathname + url.search);
  if (url.pathname === "/video.webm") {
    response.writeHead(200, { "content-type": "video/webm" });
    response.end(movie);
    return;
  }
  if (url.pathname.endsWith(".vtt")) {
    if (url.pathname === "/fail.vtt") {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "text/vtt;charset=utf-8" });
    response.end(
      "WEBVTT\n\n00:00:00.000 --> 00:00:05.000\n" +
        (url.pathname.includes("fr") ? "Bonjour." : "Hello world.") +
        "\n",
    );
    return;
  }
  response.writeHead(200, { "content-type": "text/html;charset=utf-8" });
  response.end(
    `<!doctype html><html><body><video id="video" preload="metadata" muted controls src="/video.webm"><track id="en" kind="subtitles" src="/en.vtt${url.search}" srclang="en" label="English" ${url.searchParams.has("default") ? "default" : ""}><track id="fr" kind="captions" src="/fr.vtt${url.search}" srclang="fr" label="Français"><track id="fail" kind="subtitles" src="/fail.vtt${url.search}" srclang="de" label="Same label, no provenance metadata"></video></body></html>`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const evidence = {
  browser: browser.version(),
  requests,
  events: [],
  completed: false,
};
const snapshot = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("track")].map((element) => ({
      id: element.id,
      language: element.track.language,
      label: element.track.label,
      mode: element.track.mode,
      readyState: element.readyState,
      cues:
        element.track.cues === null
          ? null
          : [...element.track.cues].map((cue) => cue.text),
    })),
  );
try {
  await mkdir(".workspace/qa", { recursive: true });
  await page.goto(origin + "/case?none=1");
  await page.waitForFunction(
    () => document.querySelector("video").readyState >= 1,
  );
  await page.waitForTimeout(200);
  evidence.initial = await snapshot();
  if (
    evidence.initial.some(
      (track) => track.mode !== "disabled" || track.cues !== null,
    ) ||
    requests.some((url) => url.endsWith(".vtt?none=1"))
  )
    throw Error("Unexpected defaultless track activation");
  await page.evaluate(() => {
    window.trackEvents = [];
    const tracks = document.querySelector("video").textTracks;
    for (const event of ["change", "addtrack", "removetrack"])
      tracks.addEventListener(event, () => window.trackEvents.push(event));
    document.querySelector("#en").track.mode = "hidden";
  });
  await page.waitForFunction(
    () => document.querySelector("#en").readyState === 2,
  );
  evidence.hidden = await snapshot();
  await page.evaluate(() => {
    document.querySelector("#en").track.mode = "showing";
    document.querySelector("#fr").track.mode = "showing";
  });
  await page.waitForFunction(
    () => document.querySelector("#fr").readyState === 2,
  );
  evidence.twoShowing = await snapshot();
  if (
    evidence.twoShowing.filter((track) => track.mode === "showing").length !== 2
  )
    throw Error("Chrome no longer permits two showing tracks");
  await page.evaluate(
    () => (document.querySelector("#fr").track.mode = "disabled"),
  );
  evidence.disabledAfterLoad = await snapshot();
  if (
    evidence.disabledAfterLoad.find((track) => track.id === "fr").cues !== null
  )
    throw Error("Disabled loaded track unexpectedly exposes cues");
  const priorFetches = requests.filter(
    (url) => url === "/fr.vtt?none=1",
  ).length;
  await page.evaluate(
    () => (document.querySelector("#fr").track.mode = "hidden"),
  );
  await page.waitForFunction(
    () => document.querySelector("#fr").track.cues?.length === 1,
  );
  evidence.reenabled = await snapshot();
  if (
    requests.filter((url) => url === "/fr.vtt?none=1").length !== priorFetches
  )
    throw Error("Reenable unexpectedly fetched the loaded resource again");
  await page.evaluate(
    () => (document.querySelector("#fail").track.mode = "hidden"),
  );
  await page.waitForFunction(
    () => document.querySelector("#fail").readyState === 3,
  );
  evidence.loadError = await snapshot();
  evidence.events = await page.evaluate(() => window.trackEvents);
  await page.goto(origin + "/case?default=1");
  await page.waitForFunction(
    () => document.querySelector("#en").readyState === 2,
  );
  evidence.default = await snapshot();
  if (evidence.default.find((track) => track.id === "en").mode !== "showing")
    throw Error("Default English track not chosen");
  await page.evaluate(() => {
    document.querySelector("#en").track.mode = "disabled";
    document.querySelector("#fr").track.mode = "showing";
    const element = document.createElement("track");
    element.kind = "subtitles";
    element.label = "New default";
    element.srclang = "en";
    element.default = true;
    element.src = "/new-default.vtt";
    document.querySelector("video").append(element);
  });
  await page.waitForFunction(
    () => document.querySelector("#fr").readyState === 2,
  );
  await page.waitForTimeout(200);
  evidence.existingChoice = await snapshot();
  if (
    evidence.existingChoice.find((track) => track.id === "fr").mode !==
      "showing" ||
    evidence.existingChoice.find((track) => track.label === "New default")
      .mode !== "disabled"
  )
    throw Error("New default displaced existing player selection");
  evidence.completed = true;
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.error = String(error);
  throw error;
} finally {
  await writeFile(
    ".workspace/qa/native-track-behavior.json",
    JSON.stringify(evidence, null, 2),
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
