// @vitest-environment jsdom
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  prepareDocument,
  translateDocument,
} from "../frontend/src/features/document-translation";
import type { Translate } from "../frontend/src/entities/translation";

beforeEach(() => vi.stubGlobal("Blob", NodeBlob));
afterEach(() => vi.unstubAllGlobals());
const file = (name: string, data: string | Uint8Array) =>
  new NodeFile(
    [typeof data === "string" ? data : new Uint8Array(data)],
    name,
  ) as unknown as File;
const translate = () =>
  vi.fn<Translate>(async (request) => ({
    id: request.id,
    text: request.text
      .replace(/Read/g, "Lire")
      .replace(/complete/g, "complet")
      .replace(/then run/g, "puis exécuter")
      .replace(/with/g, "avec"),
    elapsedMs: 0,
  }));
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Original title</title><link rel="stylesheet" href="https://assets.invalid/style.css"><script>globalThis.documentImportSentinel = 1</script></head><body><p id="lead" class="reading" style="font-weight:600">Read the <a id="guide" href="../chapters/two.xhtml#start" class="chapter-link" style="color:blue" xml:lang="en" epub:type="noteref">complete <em id="emphasis">guide</em></a>, then run <span id="code-holder"><code id="command">npm install</code></span> with <math xmlns="http://www.w3.org/1998/Math/MathML" id="formula"><mi>x</mi></math>.<img id="illustration" src="../images/figure.png"><video id="movie" poster="../images/poster.png"><source src="../video/clip.mp4"><track src="../video/captions.vtt"></video></p><pre id="sample"><code>const value = 1;</code></pre></body></html>`;
const parseHtml = (value: string) =>
  new DOMParser().parseFromString(value, "text/html");
const uniqueIds = (document: Document) => {
  const ids = [...document.querySelectorAll("[id]")].map(
    (element) => element.id,
  );
  expect(new Set(ids).size).toBe(ids.length);
  return ids;
};

function epub(chapter: Uint8Array) {
  const files: Record<string, Uint8Array> = {
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(
      '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
    "OEBPS/package.opf": strToU8(
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:original-fixture</dc:identifier><dc:title>Original book</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2020-01-01T00:00:00Z</meta></metadata><manifest><item id="one" href="text/first.xhtml" media-type="application/xhtml+xml"/><item id="two" href="text/second.xhtml" media-type="application/xhtml+xml"/><item id="css" href="styles/book.css" media-type="text/css"/><item id="image" href="images/figure.png" media-type="image/png"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>',
    ),
    "OEBPS/text/first.xhtml": chapter,
    "OEBPS/text/second.xhtml": new Uint8Array(
      Buffer.from(
        '\ufeff<?xml version="1.0" encoding="UTF-16"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en"><head><title>Second</title></head><body><p id="start">Read the second chapter.</p></body></html>',
        "utf16le",
      ),
    ),
    "OEBPS/styles/book.css": strToU8(".chapter-link { color: blue; }"),
    "OEBPS/images/figure.png": new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]),
  };
  files["OEBPS/nav.xhtml"] = strToU8(
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body translate="no"><nav epub:type="toc"><ol><li><a href="text/first.xhtml">First</a></li><li><a href="text/second.xhtml">Second</a></li></ol></nav></body></html>',
  );
  return files;
}

describe("whole-paragraph HTML and EPUB preservation", () => {
  it("translates one rich paragraph while retaining source attributes, resources and protected semantics", async () => {
    const prepared = await prepareDocument(file("rich.html", html));
    const translator = translate();
    expect(prepared.segments).toHaveLength(1);
    expect(prepared.segments[0]!.source).toContain("Read the <yaku-link");
    expect(prepared.segments[0]!.source).not.toMatch(
      /npm install|figure\.png|color:blue|<mi>|chapter-link/,
    );
    const blob = await translateDocument(prepared, {
      translate: translator,
      targetLanguage: "fr",
      bilingual: false,
    });
    const document = parseHtml(await blob.text());
    expect(translator).toHaveBeenCalledTimes(1);
    expect(prepared.translationPreview!()).not.toContain("yaku-");
    expect(prepared.translationPreview!()).toContain("npm install");
    expect(document.querySelector("#lead")!.textContent).toContain(
      "Lire the complet guide, puis exécuter npm install avec x.",
    );
    const anchor = document.querySelector("#guide")!;
    expect(anchor.getAttribute("href")).toBe("../chapters/two.xhtml#start");
    expect(anchor.getAttribute("class")).toBe("chapter-link");
    expect(anchor.getAttribute("style")).toBe("color:blue");
    expect(anchor.getAttribute("xml:lang")).toBe("fr");
    expect(anchor.getAttribute("epub:type")).toBe("noteref");
    expect(document.querySelectorAll("img")).toHaveLength(1);
    expect(document.querySelectorAll("video source")).toHaveLength(1);
    expect(document.querySelectorAll("video track")).toHaveLength(1);
    expect(document.querySelectorAll("math")).toHaveLength(1);
    expect(document.querySelectorAll("code")).toHaveLength(2);
    expect(document.querySelector("#sample")!.textContent).toBe(
      "const value = 1;",
    );
    expect(document.querySelector("script")!.textContent).toBe(
      "globalThis.documentImportSentinel = 1",
    );
    expect(document.querySelector("#lead")!.getAttribute("style")).toBe(
      "font-weight:600",
    );
    uniqueIds(document);
  });
  it("bilingual output keeps the original paragraph and creates no duplicate IDs or media, even after replace", async () => {
    const prepared = await prepareDocument(file("again.html", html));
    await translateDocument(prepared, {
      translate: translate(),
      targetLanguage: "fr",
      bilingual: false,
    });
    const blob = await translateDocument(prepared, {
      translate: translate(),
      targetLanguage: "fr",
      bilingual: true,
    });
    const document = parseHtml(await blob.text());
    const original = parseHtml(html).querySelector("#lead")!;
    const target = document.querySelector("[data-yaku-document-translation]")!;
    expect(target.textContent).toContain("npm install");
    expect(target.querySelector("math")!.textContent).toBe("x");
    expect(target.querySelector("img,video,source,track")).toBeNull();
    expect(target.querySelectorAll("[id],[class],[style]")).toHaveLength(0);
    expect(target.getAttribute("lang")).toBe("fr");
    const source = document.querySelector("#lead")!.cloneNode(true) as Element;
    source.querySelector("[data-yaku-document-translation]")!.remove();
    source.lastElementChild!.remove();
    expect(source.outerHTML).toBe(original.outerHTML);
    expect(document.querySelectorAll("img")).toHaveLength(1);
    expect(document.querySelectorAll("video")).toHaveLength(1);
    expect(document.querySelectorAll("math")).toHaveLength(2);
    expect(document.querySelectorAll("code")).toHaveLength(3);
    expect(uniqueIds(document)).toEqual(uniqueIds(parseHtml(html)));
  });
  it("keeps nested list/table/parent ownership separate and replays changes without undoing children", async () => {
    const source =
      '<div id="parent"><p id="child">Child <strong>sentence</strong>.<img id="one-image" src="figure.png"></p>Parent tail.</div><ul><li id="item">First <em>entry</em><ul><li id="nested">Nested item.</li></ul></li></ul><table><tbody><tr><td id="cell"><p id="cell-p">Cell paragraph.</p>Cell tail.</td></tr></tbody></table>';
    const prepared = await prepareDocument(file("nested.html", source));
    const translator = vi.fn<Translate>(async (request) => ({
      id: request.id,
      text: `TR(${request.text})`,
      elapsedMs: 0,
    }));
    expect(prepared.segments).toHaveLength(6);
    expect(
      prepared.segments.find((segment) =>
        segment.source.includes("Parent tail"),
      )!.source,
    ).not.toContain("Child");
    expect(
      prepared.segments.find((segment) => segment.source.includes("First"))!
        .source,
    ).not.toContain("Nested item");
    await translateDocument(prepared, {
      translate: translator,
      targetLanguage: "fr",
      bilingual: false,
    });
    const translated = parseHtml(prepared.preview());
    expect(translated.querySelector("#child")!.textContent).toBe(
      "TR(Child sentence.)",
    );
    expect(translated.querySelector("#cell-p")!.textContent).toBe(
      "TR(Cell paragraph.)",
    );
    const blob = await translateDocument(prepared, {
      translate: translator,
      targetLanguage: "fr",
      bilingual: true,
    });
    const bilingual = parseHtml(await blob.text());
    expect(
      bilingual.querySelectorAll("[data-yaku-document-translation]"),
    ).toHaveLength(6);
    expect(bilingual.querySelectorAll("li")).toHaveLength(2);
    expect(bilingual.querySelectorAll("td")).toHaveLength(1);
    expect(bilingual.querySelectorAll("img")).toHaveLength(1);
    expect(uniqueIds(bilingual)).toEqual(uniqueIds(parseHtml(source)));
  });
  it("rejects changed formatting markers without replacing an already rendered document", async () => {
    const prepared = await prepareDocument(file("transaction.html", html));
    await translateDocument(prepared, {
      translate: translate(),
      targetLanguage: "fr",
      bilingual: false,
    });
    const before = prepared.preview();
    expect(() =>
      prepared.segments[0]!.write(
        prepared.segments[0]!.source.replace('id="0"', 'id="999"'),
        true,
      ),
    ).toThrow("inline markers");
    expect(prepared.preview()).toBe(before);
    await translateDocument(prepared, {
      translate: translate(),
      targetLanguage: "fr",
      bilingual: true,
    });
    expect(parseHtml(prepared.preview()).querySelectorAll("img")).toHaveLength(
      1,
    );
    expect(
      parseHtml(prepared.preview()).querySelectorAll(
        "[data-yaku-document-translation]",
      ),
    ).toHaveLength(1);
  });
  it("keeps explicitly hidden source text out of visible bilingual projections", async () => {
    const source =
      '<p>Read <span hidden>hidden words</span><span aria-hidden="true">accessibility secret</span><span style="display:none">display secret</span><span style="visibility:hidden"><code>hidden-command</code></span>the guide.</p><p hidden>Hidden paragraph</p>';
    const prepared = await prepareDocument(file("hidden.html", source));
    expect(prepared.segments).toHaveLength(1);
    expect(prepared.segments[0]!.source).not.toMatch(
      /secret|hidden words|hidden-command|Hidden paragraph/,
    );
    const blob = await translateDocument(prepared, {
      translate: translate(),
      targetLanguage: "fr",
      bilingual: true,
    });
    const document = parseHtml(await blob.text());
    expect(
      document.querySelector("[data-yaku-document-translation]")!.textContent,
    ).toBe("Lire the guide.");
    expect(document.querySelector("[hidden]")!.textContent).toBe(
      "hidden words",
    );
  });
  it.each([false, true])(
    "marks translated language/direction without relabeling protected source or bilingual originals (%s)",
    async (bilingual) => {
      const source =
        '<html lang="en" dir="ltr"><body><p id="sentence" lang="en" dir="ltr">Read <span lang="en" dir="ltr">the guide</span>, then run <code id="source-code" lang="en">npm install</code>.</p></body></html>';
      const prepared = await prepareDocument(file("language.html", source));
      const blob = await translateDocument(prepared, {
        translate: translate(),
        targetLanguage: "ar",
        bilingual,
      });
      const document = parseHtml(await blob.text());
      expect(document.querySelector("#source-code")!.getAttribute("lang")).toBe(
        "en",
      );
      if (bilingual) {
        expect(document.documentElement.getAttribute("lang")).toBe("en");
        expect(document.querySelector("#sentence")!.getAttribute("dir")).toBe(
          "ltr",
        );
        const target = document.querySelector(
          "[data-yaku-document-translation]",
        )!;
        expect(target.getAttribute("lang")).toBe("ar");
        expect(target.getAttribute("dir")).toBe("auto");
        expect(target.querySelector("code")!.getAttribute("lang")).toBe("en");
      } else {
        expect(document.documentElement.getAttribute("lang")).toBe("ar");
        expect(document.documentElement.getAttribute("dir")).toBe("auto");
        expect(document.querySelector("#sentence")!.getAttribute("lang")).toBe(
          "ar",
        );
        expect(
          document.querySelector("#sentence span")!.getAttribute("lang"),
        ).toBe("ar");
        expect(
          document.querySelector("#sentence span")!.getAttribute("dir"),
        ).toBe("auto");
      }
    },
  );
  it.each([false, true])(
    "retains XHTML namespaces, relative/fragment links, spine and archive assets with bilingual=%s",
    async (bilingual) => {
      const chapter = strToU8(
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en"><head><title>First</title><link href="../styles/book.css" rel="stylesheet"/></head><body><p id="first" class="chapter" style="color:blue"><a id="next" xml:lang="en" epub:type="noteref" href="second.xhtml#start">Read the <em>complete guide</em></a>.<a href="#first">Read again</a><img src="../images/figure.png"/></p></body></html>',
      );
      const original = epub(chapter);
      const prepared = await prepareDocument(
        file(
          "book.epub",
          zipSync({
            ...original,
            mimetype: [original.mimetype!, { level: 0 }],
          }),
        ),
      );
      expect(prepared.segments).toHaveLength(2);
      const blob = await translateDocument(prepared, {
        translate: translate(),
        targetLanguage: "fr",
        bilingual,
      });
      const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
      const document = new DOMParser().parseFromString(
        strFromU8(files["OEBPS/text/first.xhtml"]!),
        "application/xml",
      );
      expect(document.querySelector("parsererror")).toBeNull();
      expect(document.documentElement.namespaceURI).toBe(
        "http://www.w3.org/1999/xhtml",
      );
      const anchor = document.getElementById("next")!;
      expect(anchor.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
      expect(
        anchor.getAttributeNS("http://www.w3.org/XML/1998/namespace", "lang"),
      ).toBe(bilingual ? "en" : "fr");
      expect(
        anchor.getAttributeNS("http://www.idpf.org/2007/ops", "type"),
      ).toBe("noteref");
      expect(anchor.getAttribute("href")).toBe("second.xhtml#start");
      expect(document.querySelector('a[href="#first"]')).not.toBeNull();
      expect(document.querySelectorAll("img")).toHaveLength(1);
      uniqueIds(document);
      const second = new DOMParser().parseFromString(
        strFromU8(files["OEBPS/text/second.xhtml"]!),
        "application/xml",
      );
      expect(second.querySelector("parsererror")).toBeNull();
      expect(second.getElementById("start")).not.toBeNull();
      const packageDocument = new DOMParser().parseFromString(
        strFromU8(files["OEBPS/package.opf"]!),
        "application/xml",
      );
      expect(
        [...packageDocument.getElementsByTagNameNS("*", "itemref")].map(
          (item) => item.getAttribute("idref"),
        ),
      ).toEqual(["one", "two"]);
      expect(
        packageDocument.getElementsByTagNameNS("*", "title")[0]!.textContent,
      ).toBe("Original book");
      expect(Array.from(files["OEBPS/styles/book.css"]!)).toEqual(
        Array.from(original["OEBPS/styles/book.css"]!),
      );
      expect(Array.from(files["OEBPS/images/figure.png"]!)).toEqual(
        Array.from(original["OEBPS/images/figure.png"]!),
      );
      expect(
        (
          await prepareDocument(
            file("reload.epub", new Uint8Array(await blob.arrayBuffer())),
          )
        ).segments,
      ).toHaveLength(2);
      expect(document.documentElement.getAttribute("xml:lang")).toBe(
        bilingual ? "en" : "fr",
      );
      if (bilingual)
        expect(
          document
            .querySelector("[data-yaku-document-translation]")!
            .getAttribute("xml:lang"),
        ).toBe("fr");
    },
  );
  it("decodes explicit HTML legacy encodings and UTF-16 BOMs, then exports UTF-8 metadata", async () => {
    const legacy = await prepareDocument(
      file(
        "legacy.html",
        new Uint8Array(
          Buffer.from(
            '<html><head><meta charset="windows-1252"></head><body><p>Read café.</p></body></html>',
            "latin1",
          ),
        ),
      ),
    );
    expect(legacy.segments[0]!.source).toBe("Read café.");
    const blob = await translateDocument(legacy, {
      translate: translate(),
      targetLanguage: "fr",
      bilingual: false,
    });
    expect(await blob.text()).toContain('charset="utf-8"');
    expect(await blob.text()).toContain("Lire café.");
    const utf16 = await prepareDocument(
      file(
        "unicode.html",
        new Uint8Array(
          Buffer.from(
            "\ufeff<!doctype html><html><body><p>Read 中文.</p></body></html>",
            "utf16le",
          ),
        ),
      ),
    );
    expect(utf16.segments[0]!.source).toBe("Read 中文.");
    const invalid = new Uint8Array([0xff, 0x61]);
    await expect(prepareDocument(file("bad.html", invalid))).rejects.toThrow(
      "encoding is invalid",
    );
    const unsupported = epub(
      strToU8(
        '<?xml version="1.0" encoding="ISO-8859-1"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Read.</p></body></html>',
      ),
    );
    await expect(
      prepareDocument(
        file(
          "unsupported.epub",
          zipSync({
            ...unsupported,
            mimetype: [unsupported.mimetype!, { level: 0 }],
          }),
        ),
      ),
    ).rejects.toThrow("Unsupported document encoding");
  });
});
