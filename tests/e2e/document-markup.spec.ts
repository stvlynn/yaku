import { test, expect, chromium, type Page } from "@playwright/test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  createDefaultSettings,
  type Settings,
} from "../../frontend/src/entities/settings";
import { verifyBackgroundSource } from "../../scripts/experiments/background-identity.mjs";

const assetsOrigin = "https://source-assets.invalid";
const paragraph =
  'Read the <a id="guide" class="guide" style="font-weight:600" href="second.xhtml#intro">complete guide</a>, then run <span><code id="command">npm install</code></span> to install the package. The value is <math xmlns="http://www.w3.org/1998/Math/MathML" id="formula"><mi>x</mi><mo>+</mo><mn>1</mn></math>.<img id="image" src="https://source-assets.invalid/image.png"/>';
function html(protectedBody: boolean) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Original title</title><link rel="stylesheet" href="${assetsOrigin}/style.css"><script src="${assetsOrigin}/script.js"></script><script>globalThis.documentImportSentinel=99</script></head><body${protectedBody ? ' translate="no"' : ""}><p id="paragraph">${paragraph}</p><iframe src="${assetsOrigin}/frame"></iframe></body></html>`;
}
function epub(protectedBody: boolean) {
  return zipSync({
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(
      '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
    "OPS/package.opf": strToU8(
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:markup-fixture</dc:identifier><dc:title>Markup fixture</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2020-01-01T00:00:00Z</meta></metadata><manifest><item id="chapter" href="first.xhtml" media-type="application/xhtml+xml" properties="scripted"/><item id="second" href="second.xhtml" media-type="application/xhtml+xml"/><item id="css" href="book.css" media-type="text/css"/><item id="image" href="images/figure.png" media-type="image/png"/><item id="script" href="scripts/source.js" media-type="application/javascript"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="chapter"/><itemref idref="second"/></spine></package>',
    ),
    "OPS/first.xhtml": strToU8(
      `<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en"><head><title>Chapter</title><link rel="stylesheet" href="book.css"/><script src="scripts/source.js"></script></head><body${protectedBody ? ' translate="no"' : ""}><p id="paragraph">${paragraph.replace(`${assetsOrigin}/image.png`, "images/figure.png")}</p></body></html>`,
    ),
    "OPS/second.xhtml": strToU8(
      '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en"><head><title>Destination</title></head><body><p id="intro" translate="no">Unchanged destination.</p></body></html>',
    ),
    "OPS/book.css": strToU8(
      ".guide { background-image:url('images/figure.png'); }",
    ),
    "OPS/images/figure.png": new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJkcAAAAASUVORK5CYII=",
        "base64",
      ),
    ),
    "OPS/scripts/source.js": strToU8("globalThis.documentImportSentinel=77"),
    "OPS/nav.xhtml": strToU8(
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body translate="no"><nav epub:type="toc"><ol><li><a href="first.xhtml">First</a></li><li><a href="second.xhtml">Second</a></li></ol></nav></body></html>',
    ),
  });
}
async function launch(profile?: string) {
  const directory =
    profile ?? (await mkdtemp(path.join(tmpdir(), "yaku-document-markup-")));
  const context = await chromium.launchPersistentContext(directory, {
    channel: "chrome",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging", "--remote-debugging-port=0"],
    acceptDownloads: true,
    viewport: { width: 1180, height: 860 },
  });
  const cdp = await context.browser()!.newBrowserCDPSession();
  const { id } = await cdp.send("Extensions.loadUnpacked", {
    path: path.resolve(".output/chrome-mv3"),
  });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/workspace.html`);
  await page.bringToFront();
  const identity = await verifyBackgroundSource(
    directory,
    id,
    path.resolve(".output/chrome-mv3/background.js"),
  );
  await page.evaluate(
    (value) => chrome.storage.local.set({ settings: value }),
    {
      ...createDefaultSettings(),
      sourceLanguage: "en",
      targetLanguage: "zh",
      mode: "bilingual",
    },
  );
  const requests: string[] = [];
  context.on("request", (request) => {
    if (
      request.url().startsWith(assetsOrigin) ||
      /\/(?:book\.css|images\/figure\.png|scripts\/source\.js)(?:[?#]|$)/.test(
        request.url(),
      )
    )
      requests.push(request.url());
  });
  await context.route(`${assetsOrigin}/**`, (route) => route.abort());
  await page.getByRole("button", { name: "Document", exact: true }).click();
  return { context, page, identity, requests };
}
async function runFile(page: Page, name: string, buffer: Buffer) {
  await page.getByLabel("Choose a file", { exact: true }).setInputFiles({
    name,
    mimeType: name.endsWith("epub") ? "application/epub+zip" : "text/html",
    buffer,
  });
  await page.getByRole("button", { name: "Translate", exact: true }).click();
  const button = page.getByRole("button", {
    name: "Download translation",
    exact: true,
  });
  await expect(button).toBeVisible({ timeout: 180_000 });
  const pending = page.waitForEvent("download");
  await button.click();
  const download = await pending;
  return { download, bytes: await readFile((await download.path())!) };
}
async function noActiveContent(page: Page, requests: string[]) {
  expect(
    await page.evaluate(
      () =>
        (globalThis as unknown as { documentImportSentinel?: number })
          .documentImportSentinel,
    ),
  ).toBeUndefined();
  expect(requests).toEqual([]);
}

test("actual HTML and EPUB import/export keeps scripts and external resources inert without model inference", async () => {
  const { context, page, identity, requests } = await launch();
  try {
    const htmlResult = await runFile(
      page,
      "inert.html",
      Buffer.from(html(true)),
    );
    expect(htmlResult.bytes.toString()).toContain("documentImportSentinel=99");
    const epubResult = await runFile(
      page,
      "inert.epub",
      Buffer.from(epub(true)),
    );
    const files = unzipSync(epubResult.bytes);
    expect(strFromU8(files["OPS/first.xhtml"]!)).toContain("scripts/source.js");
    await noActiveContent(page, requests);
    const cache = await page.evaluate(() =>
      chrome.runtime.sendMessage({
        destination: "background",
        action: "cache-info",
      }),
    );
    expect(cache.value).toMatchObject({ bytes: 0, complete: false });
    await mkdir(".workspace/qa", { recursive: true });
    await writeFile(
      ".workspace/qa/document-import-inert.json",
      JSON.stringify(
        {
          identity,
          sourceRequests: requests,
          sentinelExecuted: false,
          cache: cache.value,
          scope:
            "Actual production document preparation and export; all source text protected, no model inference.",
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
  }
});

test("rich HTML and EPUB paragraphs translate through the real local model and preserve exported resources and anchors", async () => {
  test.skip(
    !process.env.YAKU_MODEL_PROFILE,
    "Requires an explicitly supplied real cached-model profile.",
  );
  test.setTimeout(300_000);
  const { context, page, identity, requests } = await launch(
    process.env.YAKU_MODEL_PROFILE,
  );
  try {
    const cache = await page.evaluate(() =>
      chrome.runtime.sendMessage({
        destination: "background",
        action: "cache-info",
      }),
    );
    expect(cache.value.complete).toBe(true);
    await mkdir(".workspace/qa", { recursive: true });
    const observations: Record<string, unknown> = {};
    for (const kind of ["html", "epub"] as const)
      for (const bilingual of [false, true]) {
        await page.evaluate(async (bilingual) => {
          const settings = (await chrome.storage.local.get("settings"))
            .settings as Settings;
          await chrome.storage.local.set({
            settings: {
              ...settings,
              mode: bilingual ? "bilingual" : "translation",
            },
          });
        }, bilingual);
        const name = `rich-${bilingual ? "bilingual" : "replacement"}.${kind}`;
        const result = await runFile(
          page,
          name,
          kind === "html" ? Buffer.from(html(false)) : Buffer.from(epub(false)),
        );
        await result.download.saveAs(`.workspace/qa/${name}`);
        let content: string;
        if (kind === "epub") {
          const files = unzipSync(result.bytes);
          content = strFromU8(files["OPS/first.xhtml"]!);
          expect(strFromU8(files["OPS/book.css"]!)).toBe(
            ".guide { background-image:url('images/figure.png'); }",
          );
          expect(files["OPS/images/figure.png"]).toBeDefined();
          expect(files["OPS/nav.xhtml"]).toBeDefined();
        } else content = result.bytes.toString();
        const observed = await page.evaluate(
          ({ source, kind, bilingual }) => {
            const document = new DOMParser().parseFromString(
              source,
              kind === "html" ? "text/html" : "application/xml",
            );
            const target = bilingual
              ? document.querySelector("[data-yaku-document-translation]")
              : document.querySelector("#paragraph");
            const ids = [...document.querySelectorAll("[id]")].map(
              (element) => element.id,
            );
            return {
              valid: !document.querySelector("parsererror"),
              namespace: document.documentElement.namespaceURI,
              target: target?.textContent,
              lang: target?.getAttribute("lang"),
              direction: target?.getAttribute("dir"),
              code: target?.querySelector("code")?.textContent,
              math: target?.querySelector("math")?.textContent,
              images: document.querySelectorAll("img").length,
              codes: document.querySelectorAll("code").length,
              formulas: document.querySelectorAll("math").length,
              uniqueIds: new Set(ids).size === ids.length,
              href: document.querySelector("#guide")?.getAttribute("href"),
            };
          },
          { source: content, kind, bilingual },
        );
        expect(observed.target).toMatch(/[\u3400-\u9fff]/u);
        expect(observed).toMatchObject({
          valid: true,
          namespace: "http://www.w3.org/1999/xhtml",
          code: "npm install",
          math: "x+1",
          images: 1,
          codes: bilingual ? 2 : 1,
          formulas: bilingual ? 2 : 1,
          uniqueIds: true,
          href: "second.xhtml#intro",
          lang: "zh",
          direction: "auto",
        });
        await expect(page.locator(".editor-result")).not.toContainText("yaku-");
        await expect(page.locator(".editor-result")).toContainText(
          "npm install",
        );
        observations[name] = observed;
        await page.screenshot({
          path: `.workspace/qa/${kind}-${bilingual ? "bilingual" : "replacement"}-real-model.png`,
        });
      }
    await noActiveContent(page, requests);
    await page.screenshot({
      path: ".workspace/qa/document-markup-real-model.png",
    });
    await writeFile(
      ".workspace/qa/document-markup-real-model.json",
      JSON.stringify(
        {
          identity,
          observations,
          sourceRequests: requests,
          usesModelStubs: false,
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
  }
});
