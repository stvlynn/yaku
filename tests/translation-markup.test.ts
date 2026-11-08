// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createInlineCodec } from "../frontend/src/shared/translation-markup";
const htmlNs = "http://www.w3.org/1999/xhtml";
const xml = (body: string) =>
  new DOMParser().parseFromString(
    `<html xmlns="${htmlNs}" xmlns:epub="http://www.idpf.org/2007/ops"><body>${body}</body></html>`,
    "application/xhtml+xml",
  );
function selected(block: Element) {
  const nodes: Text[] = [];
  const walker = block.ownerDocument.createTreeWalker(block, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    if (
      !node.parentElement?.closest(
        "code,math,img,picture,video,audio,[data-nested]",
      )
    )
      nodes.push(node as Text);
  return nodes;
}
const policy = {
  documentPreservation: { baseUrl: "https://book.invalid/OPS/chapter.xhtml" },
};
describe("document marker preservation", () => {
  it("keeps an invalid document base configuration distinct from a malformed original href", () => {
    const doc = xml('<p>Read <a href="../report.xhtml">the report</a>.</p>');
    const block = doc.querySelector("p")!;
    expect(() =>
      createInlineCodec(doc, block, selected(block), {
        documentPreservation: { baseUrl: "not an absolute base" },
      }),
    ).toThrow();
  });
  it.each(["default", "document"])(
    "drops a malformed original link URL without rejecting valid translated markers in %s projection",
    (mode) => {
      const doc = xml('<p>Read <a href="http://[invalid">the report</a>.</p>');
      const block = doc.querySelector("p")!;
      const codec = createInlineCodec(
        doc,
        block,
        selected(block),
        mode === "document" ? policy : undefined,
      );
      const fragment = codec.decode(
        '閱讀<yaku-link id="0">報告</yaku-link>。',
        mode === "document" ? { mode: "bilingual" } : undefined,
      );
      expect(fragment.querySelector("a")?.getAttribute("href")).toBeNull();
      expect(fragment.textContent).toBe("閱讀報告。");
      expect(doc.querySelector("a")?.getAttribute("href")).toBe(
        "http://[invalid",
      );
    },
  );
  it("snapshots inherited and explicit protected source language/direction before target metadata changes", () => {
    const doc = xml(
      '<section xml:lang="en" dir="ltr"><p>Run <code lang="de" dir="rtl">Gift</code> with <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>.</p></section>',
    );
    const block = doc.querySelector("p")!;
    const codec = createInlineCodec(doc, block, selected(block), policy);
    doc
      .querySelector("section")!
      .setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:lang", "zh");
    doc.querySelector("section")!.setAttribute("dir", "rtl");
    const fragment = codec.decode(
      '執行<yaku-keep id="0"></yaku-keep>並計算<yaku-keep id="1"></yaku-keep>。',
      { mode: "bilingual" },
    );
    expect(fragment.querySelector("code")?.getAttribute("lang")).toBe("de");
    expect(
      fragment
        .querySelector("code")
        ?.getAttributeNS("http://www.w3.org/XML/1998/namespace", "lang"),
    ).toBe("de");
    expect(fragment.querySelector("code")?.getAttribute("dir")).toBe("rtl");
    expect(fragment.querySelector("math")?.getAttribute("lang")).toBe("en");
    expect(fragment.querySelector("math")?.getAttribute("dir")).toBe("ltr");
  });
  it("preserves an explicitly unknown protected language without inventing metadata for default page copies", () => {
    const doc = xml(
      '<p xml:lang="en">Run <code lang="">npm install</code>.</p>',
    );
    const block = doc.querySelector("p")!;
    const codec = createInlineCodec(doc, block, selected(block), policy);
    const fragment = codec.decode('執行<yaku-keep id="0"></yaku-keep>。', {
      mode: "bilingual",
    });
    expect(fragment.querySelector("code")?.getAttribute("lang")).toBe("");
    const pageCodec = createInlineCodec(doc, block, selected(block), {
      preserveProtected: true,
    });
    expect(
      pageCodec
        .decode('Run <yaku-keep id="0"></yaku-keep>.')
        .querySelector("code")
        ?.hasAttribute("lang"),
    ).toBe(false);
  });
  it("keeps hidden source code in the document without revealing it in bilingual output", () => {
    const doc = xml(
      '<p>Hello <code hidden="hidden" id="hidden-command">not for display</code>world.</p>',
    );
    const block = doc.querySelector("p")!,
      before = block.innerHTML;
    const codec = createInlineCodec(doc, block, selected(block), policy);
    const fragment = codec.decode('你好<yaku-keep id="0"></yaku-keep>世界。', {
      mode: "bilingual",
    });
    expect(block.innerHTML).toBe(before);
    expect(fragment.textContent).toBe("你好世界。");
    expect(doc.querySelector("#hidden-command")).not.toBeNull();
  });
  it("keeps a hidden text subtree opaque even when its text is accidentally selected", () => {
    const doc = xml(
      '<p>Read <span hidden="hidden">hidden words</span>the guide.</p>',
    );
    const block = doc.querySelector("p")!,
      before = block.innerHTML;
    const codec = createInlineCodec(doc, block, selected(block), policy);
    expect(codec.text).not.toContain("hidden words");
    const fragment = codec.decode('閱讀<yaku-keep id="0"></yaku-keep>指南。', {
      mode: "bilingual",
    });
    expect(fragment.textContent).toBe("閱讀指南。");
    expect(block.innerHTML).toBe(before);
  });

  it("retains semantic code and MathML through unselected inline wrappers without copying media", () => {
    const doc = xml(
      '<p>Run <a href="#cmd" lang="en" dir="ltr"><span id="wrap"><code>npm install</code></span></a> with <span><math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math><img src="a.png"/></span>.</p>',
    );
    const block = doc.querySelector("p")!,
      before = block.innerHTML;
    const codec = createInlineCodec(doc, block, selected(block), policy);
    const fragment = codec.decode(
      '執行<yaku-link id="0"><yaku-inline id="1"><yaku-keep id="2"></yaku-keep></yaku-inline></yaku-link>並計算<yaku-inline id="3"><yaku-keep id="4"></yaku-keep><yaku-keep id="5"></yaku-keep></yaku-inline>。',
      { mode: "bilingual" },
    );
    expect(block.innerHTML).toBe(before);
    expect(fragment.querySelector("a code")?.textContent).toBe("npm install");
    expect(fragment.querySelector("math mi")?.textContent).toBe("x");
    expect(fragment.querySelector("img,[src],[id]")).toBeNull();
    expect(fragment.querySelector("a")?.hasAttribute("lang")).toBe(false);
    expect(fragment.querySelector("a")?.hasAttribute("dir")).toBe(false);
    expect(fragment.querySelector("code")?.getAttribute("lang")).toBe("en");
    expect(fragment.querySelector("code")?.getAttribute("dir")).toBe("ltr");
    expect(fragment.querySelector("a")?.getAttribute("href")).toBe("#cmd");
  });

  it("keeps standalone preformatted/display formula blocks original-only in bilingual mode", () => {
    const doc = xml(
      '<div>Hello <pre><code>untouched code block</code></pre><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mi>x</mi></math>world.</div>',
    );
    const block = doc.querySelector("div")!;
    const codec = createInlineCodec(doc, block, selected(block), policy);
    const fragment = codec.decode(
      '你好<yaku-keep id="0"></yaku-keep><yaku-keep id="1"></yaku-keep>世界。',
      { mode: "bilingual" },
    );
    expect(fragment.querySelector("pre,math,code")).toBeNull();
    expect(doc.querySelectorAll("pre")).toHaveLength(1);
    expect(doc.querySelectorAll("math")).toHaveLength(1);
  });

  it("recognizes XML inline names and preserves their namespace in safe default projections", () => {
    const doc = xml(
      '<p>Hello <a href="https://example.com/report">world</a>.</p>',
    );
    const block = doc.querySelector("p")!;
    const codec = createInlineCodec(doc, block, selected(block));
    expect(codec.text).toContain('<yaku-link id="0">world</yaku-link>');
    const target = codec.decode('你好<yaku-link id="0">世界</yaku-link>。');
    expect(target.querySelector("a")?.namespaceURI).toBe(htmlNs);
  });
  it("reconciles original XHTML elements and opaque media without losing source-owned attributes", () => {
    const doc = xml(
      '<p>Read <a id="link" class="term" style="color:red" xml:lang="en" epub:type="noteref" href="../notes.xhtml#n1">the report</a>. Run <code id="cmd">npm install</code><img id="art" src="images/a.png" alt="A"/> now.</p>',
    );
    const block = doc.querySelector("p")!;
    const link = doc.querySelector("a")!,
      code = doc.querySelector("code")!,
      image = doc.querySelector("img")!;
    const originalAttributes = [...link.attributes].map((a) => [
      a.namespaceURI,
      a.name,
      a.value,
    ]);
    const codec = createInlineCodec(doc, block, selected(block), policy);
    expect(codec.text).not.toContain("npm install");
    expect(codec.text).not.toContain("images/a.png");
    const target = codec.decode(
      '<yaku-keep id="2"></yaku-keep>請讀<yaku-link id="0">報告</yaku-link>，再執行<yaku-keep id="1"></yaku-keep>。',
      { mode: "replace" },
    );
    block.replaceChildren(target);
    expect(doc.querySelector("a")).toBe(link);
    expect(doc.querySelector("code")).toBe(code);
    expect(doc.querySelector("img")).toBe(image);
    expect(block.firstChild).toBe(image);
    expect(
      [...link.attributes].map((a) => [a.namespaceURI, a.name, a.value]),
    ).toEqual(originalAttributes);
    expect(link.namespaceURI).toBe(htmlNs);
    expect(code.textContent).toBe("npm install");
    expect(doc.querySelectorAll('[id="art"]')).toHaveLength(1);
  });
  it("projects bilingual semantic code and MathML while keeping resources and document IDs singular", () => {
    const doc = xml(
      '<p>Run <code id="cmd" style="background:url(secret.png)">npm install</code> with <math xmlns="http://www.w3.org/1998/Math/MathML" id="formula"><mi>x</mi></math><img id="art" src="a.png"/>. Read <a id="link" class="term" style="background:url(bg.png)" href="#note">the note</a>.</p>',
    );
    const block = doc.querySelector("p")!,
      original = block.innerHTML;
    const codec = createInlineCodec(doc, block, selected(block), policy);
    const fragment = codec.decode(
      '執行<yaku-keep id="0"></yaku-keep>並計算<yaku-keep id="1"></yaku-keep><yaku-keep id="2"></yaku-keep>。閱讀<yaku-link id="3">註解</yaku-link>。',
      { mode: "bilingual" },
    );
    expect(block.innerHTML).toBe(original);
    const wrapper = doc.createElementNS(htmlNs, "p");
    wrapper.append(fragment);
    block.after(wrapper);
    expect(doc.querySelectorAll("img")).toHaveLength(1);
    expect(doc.querySelectorAll("code")).toHaveLength(2);
    expect(doc.querySelectorAll("math")).toHaveLength(2);
    expect(wrapper.querySelector("code")?.textContent).toBe("npm install");
    expect(wrapper.querySelector("math mi")?.namespaceURI).toBe(
      "http://www.w3.org/1998/Math/MathML",
    );
    expect(wrapper.querySelector("[id],[class],[style],[src]")).toBeNull();
    expect(wrapper.querySelector("a")?.getAttribute("href")).toBe("#note");
    expect(doc.querySelectorAll('[id="cmd"]')).toHaveLength(1);
  });
  it("preserves unselected nested blocks and comments once without exposing them to translation", () => {
    const doc = xml(
      '<div>Hello <!--source note--><p data-nested="true" id="nested">Untouched paragraph</p>world.</div>',
    );
    const block = doc.querySelector("div")!,
      nested = doc.querySelector("p")!,
      comment = block.childNodes[1]!;
    const codec = createInlineCodec(doc, block, selected(block), policy);
    expect(codec.text).not.toContain("Untouched");
    expect(codec.text).not.toContain("source note");
    const target = codec.decode(
      '你好<yaku-keep id="0"></yaku-keep>世界<yaku-keep id="1"></yaku-keep>。',
      { mode: "replace" },
    );
    block.replaceChildren(target);
    expect(doc.querySelector("#nested")).toBe(nested);
    expect([...block.childNodes]).toContain(comment);
  });
  it.each([
    '<yaku-link id="0" onclick="bad()">譯文</yaku-link>',
    '<yaku-link id="0">譯文</yaku-link><img src="bad"/>',
    "missing marker",
  ])(
    "validates the complete result before changing source nodes: %s",
    (output) => {
      const doc = xml('<p>Read <a id="link" href="#note">the note</a>.</p>');
      const block = doc.querySelector("p")!,
        before = block.outerHTML,
        link = doc.querySelector("a");
      const codec = createInlineCodec(doc, block, selected(block), policy);
      expect(() => codec.decode(output, { mode: "replace" })).toThrow();
      expect(block.outerHTML).toBe(before);
      expect(doc.querySelector("a")).toBe(link);
    },
  );
});
