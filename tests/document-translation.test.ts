// @vitest-environment jsdom
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  prepareDocument,
  translateDocument,
} from "../frontend/src/features/document-translation";
import type {
  Translate,
  TranslationRequest,
} from "../frontend/src/entities/translation";

beforeEach(() => {
  vi.stubGlobal("Blob", NodeBlob);
});
afterEach(() => vi.unstubAllGlobals());
const file = (name: string, content: string | Uint8Array) =>
  new NodeFile(
    [typeof content === "string" ? content : new Uint8Array(content)],
    name,
  ) as unknown as File;
const translator = () =>
  vi.fn<Translate>(async (request: TranslationRequest) => ({
    id: request.id,
    text: `TR(${request.text.trim()})`,
    elapsedMs: 0,
  }));
async function roundTrip(name: string, source: string, bilingual = false) {
  const document = await prepareDocument(file(name, source));
  const translate = translator();
  const blob = await translateDocument(document, {
    translate,
    targetLanguage: "fr",
    bilingual,
  });
  return { text: await blob.text(), translate, blob };
}

describe("document format round trips", () => {
  it("keeps CommonMark code, link destinations, reference definitions and URLs untouched", async () => {
    const source =
      '# Heading\n\nRead [the guide](https://example.org/path?q=a "Title") and `code()` at https://example.org/raw.\n\n````js\nconst value = "hello";\n```\n````\n\n    indented code\n\n[ref]: https://example.org/reference\n';
    const { text, translate } = await roundTrip("notes.md", source);
    expect(text).toContain("# TR(Heading)");
    expect(text).toContain('[the guide](https://example.org/path?q=a "Title")');
    expect(text).toContain("`code()`");
    expect(text).toContain("https://example.org/raw.");
    expect(text).toContain('````js\nconst value = "hello";\n```\n````');
    expect(text).toContain("    indented code");
    expect(text).toContain("[ref]: https://example.org/reference");
    const requests = translate.mock.calls.map(
      ([request]: [TranslationRequest]) => request.text,
    );
    expect(
      requests.every(
        (request: string) =>
          !/https:|const value|code\(\)|the guide|indented code/.test(request),
      ),
    ).toBe(true);
  });

  it("preserves VTT metadata, identifiers, cue settings, tags and inline timestamps", async () => {
    const source =
      "WEBVTT\r\nKind: captions\r\n\r\nSTYLE\r\n::cue { color: lime; }\r\n\r\nNOTE untouched\r\nnot dialogue\r\n\r\nintro\r\n00:00:01.000 --> 00:00:03.000 align:start position:10%\r\n<v Narrator><b>Hello</b> <00:00:02.000>world</v>\r\n";
    const { text, translate, blob } = await roundTrip("captions.vtt", source);
    expect(blob.type).toBe("text/vtt;charset=utf-8");
    expect(text).toContain("Kind: captions\r\n");
    expect(text).toContain("::cue { color: lime; }");
    expect(text).toContain("NOTE untouched\r\nnot dialogue");
    expect(text).toContain(
      "intro\r\n00:00:01.000 --> 00:00:03.000 align:start position:10%",
    );
    expect(text).toContain(
      "<v Narrator><b>TR(Hello)</b> <00:00:02.000>TR(world)</v>",
    );
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it("keeps SRT sequence/timing and creates bilingual cue content", async () => {
    const { text } = await roundTrip(
      "captions.srt",
      "1\n00:00:01,000 --> 00:00:02,000\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld\n",
      true,
    );
    expect(text).toBe(
      "1\n00:00:01,000 --> 00:00:02,000\nHello\nTR(Hello)\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld\nTR(World)\n",
    );
  });

  it("preserves ASS overrides, hard breaks, commas, drawing commands and timing", async () => {
    const source =
      "[Script Info]\nTitle: A show\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\\b1}Hello, friend{\\b0}\\NNext line\nDialogue: 0,0:00:05.00,0:00:07.00,Default,,0,0,0,,{\\p1}m 0 0 l 20 20{\\p0}Visible\n";
    const { text, translate } = await roundTrip("captions.ass", source, true);
    expect(text).toContain("Title: A show");
    expect(text).toContain(
      "Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\\b1}Hello, friend\\NTR(Hello, friend){\\b0}\\NNext line\\NTR(Next line)",
    );
    expect(text).toContain("{\\p1}m 0 0 l 20 20{\\p0}Visible\\NTR(Visible)");
    expect(
      translate.mock.calls.map(
        ([request]: [TranslationRequest]) => request.text,
      ),
    ).toEqual(["Hello, friend", "Next line", "Visible"]);
  });

  it("preserves LRC timestamps and metadata and JSON keys, arrays and scalar types", async () => {
    const lrc = await roundTrip(
      "song.lrc",
      "[ar:Artist]\n[offset:100]\n[00:01.20][00:12.20]Hello\n",
    );
    expect(lrc.text).toBe(
      "[ar:Artist]\n[offset:100]\n[00:01.20][00:12.20]TR(Hello)\n",
    );
    const json = await roundTrip(
      "data.json",
      '{"title":"Hello","nested":{"items":["World",3,true,null]},"empty":""}',
    );
    expect(JSON.parse(json.text)).toEqual({
      title: "TR(Hello)",
      nested: { items: ["TR(World)", 3, true, null] },
      empty: "",
    });
  });

  it("translates full Word paragraphs and preserves formatting, relationships and binary parts", async () => {
    const xml =
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Hel</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>lo world</w:t></w:r></w:p></w:body></w:document>';
    const originalFiles = {
      "word/document.xml": strToU8(xml),
      "word/_rels/document.xml.rels": strToU8("<Relationships/>"),
      "word/media/image.png": new Uint8Array([1, 2, 3]),
    };
    const prepared = await prepareDocument(
      file("book.docx", zipSync(originalFiles)),
    );
    const translate = vi.fn<Translate>(async (request: TranslationRequest) => ({
      id: request.id,
      text: "Bonjour le monde",
      elapsedMs: 0,
    }));
    const blob = await translateDocument(prepared, {
      translate,
      targetLanguage: "fr",
      bilingual: false,
    });
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0]![0].text).toBe("Hello world");
    const document = new DOMParser().parseFromString(
      strFromU8(files["word/document.xml"]!),
      "application/xml",
    );
    expect(
      [...document.getElementsByTagNameNS("*", "t")]
        .map((node) => node.textContent)
        .join(""),
    ).toBe("Bonjour le monde");
    expect(document.getElementsByTagNameNS("*", "b")).toHaveLength(1);
    expect(document.getElementsByTagNameNS("*", "i")).toHaveLength(1);
    expect(
      document.getElementsByTagNameNS("*", "jc")[0]?.getAttribute("w:val"),
    ).toBe("center");
    expect(Array.from(files["word/_rels/document.xml.rels"]!)).toEqual(
      Array.from(originalFiles["word/_rels/document.xml.rels"]),
    );
    expect(Array.from(files["word/media/image.png"]!)).toEqual(
      Array.from(originalFiles["word/media/image.png"]),
    );
    const reloaded = await prepareDocument(
      file("again.docx", new Uint8Array(await blob.arrayBuffer())),
    );
    expect(reloaded.segments[0]?.source).toBe("Bonjour le monde");
  });

  it("exports EPUB with first uncompressed mimetype, valid package metadata and intact assets", async () => {
    const files = {
      mimetype: strToU8("application/epub+zip"),
      "META-INF/container.xml": strToU8(
        '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      ),
      "OEBPS/package.opf": strToU8(
        '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book">id-1</dc:identifier><dc:title>Original title</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
      ),
      "OEBPS/chapter.xhtml": strToU8(
        '<html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head><title>Chapter</title></head><body><p>Hello <a href="other.xhtml">world</a></p></body></html>',
      ),
      "OEBPS/style.css": strToU8("p { color: red; }"),
    };
    const prepared = await prepareDocument(file("book.epub", zipSync(files)));
    const blob = await translateDocument(prepared, {
      translate: translator(),
      targetLanguage: "fr",
      bilingual: false,
    });
    expect(blob.type).toBe("application/epub+zip");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const header = new DataView(bytes.buffer);
    expect(header.getUint16(8, true)).toBe(0);
    expect(strFromU8(bytes.slice(30, 38))).toBe("mimetype");
    expect(header.getUint16(28, true)).toBe(0);
    const output = unzipSync(bytes);
    expect(strFromU8(output.mimetype!)).toBe("application/epub+zip");
    expect(Array.from(output["OEBPS/style.css"]!)).toEqual(
      Array.from(files["OEBPS/style.css"]),
    );
    const metadata = new DOMParser().parseFromString(
      strFromU8(output["OEBPS/package.opf"]!),
      "application/xml",
    );
    expect(
      metadata.getElementsByTagNameNS("*", "language")[0]?.textContent,
    ).toBe("fr");
    expect(metadata.getElementsByTagNameNS("*", "title")[0]?.textContent).toBe(
      "Original title",
    );
    expect(
      metadata.getElementsByTagNameNS("*", "identifier")[0]?.textContent,
    ).toBe("id-1");
    const content = strFromU8(output["OEBPS/chapter.xhtml"]!);
    expect(content).toContain('href="other.xhtml"');
    expect(content).toContain('lang="fr"');
    expect(content).toContain("TR(Hello");
    expect(
      (await prepareDocument(file("again.epub", bytes))).segments,
    ).toHaveLength(2);
  });

  it("rejects malformed ASS without corrupting fields and cancels before exporting a partial document", async () => {
    await expect(
      prepareDocument(
        file(
          "bad.ass",
          "[Events]\nFormat: Start, Text, End\nDialogue: 0,Hello,1\n",
        ),
      ),
    ).rejects.toThrow();
    const prepared = await prepareDocument(file("input.txt", "One\nTwo"));
    const controller = new AbortController();
    const translate: Translate = async (request) => {
      controller.abort();
      return { id: request.id, text: "partial", elapsedMs: 0 };
    };
    await expect(
      translateDocument(prepared, {
        translate,
        targetLanguage: "fr",
        bilingual: false,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(prepared.preview()).toBe("One\nTwo");
  });
});
