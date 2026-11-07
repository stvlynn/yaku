// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPageTranslator } from "../frontend/src/features/page-translation";
import {
  defaultSettings,
  type Settings,
} from "../frontend/src/entities/settings";
import type {
  Translate,
  TranslationRequest,
} from "../frontend/src/entities/translation";

const controllers: ReturnType<typeof createPageTranslator>[] = [];
const settle = async () => {
  for (let i = 0; i < 12; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
};
function setup(
  html: string,
  translate?: Translate,
  detectLanguage?: import("../frontend/src/features/page-translation").PageTranslatorOptions["detectLanguage"],
) {
  document.body.innerHTML = html;
  const settings: Settings = {
    ...defaultSettings,
    siteRules: [],
    glossary: {},
  };
  const run = vi.fn<Translate>(
    translate ??
      (async (request: TranslationRequest) => ({
        id: request.id,
        text: `translated:${request.text}`,
        elapsedMs: 0,
      })),
  );
  const errors = vi.fn();
  const controller = createPageTranslator({
    document,
    translate: run,
    getSettings: () => settings,
    onError: errors,
    detectLanguage,
  });
  controllers.push(controller);
  return { controller, run, settings, errors };
}
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  vi.unstubAllGlobals();
});

describe("page translation", () => {
  it("preserves inline links, original node identity and nested paragraph ownership", async () => {
    const { controller, run } = setup(
      '<main><div><p>Read <a href="/guide"><strong>the guide</strong></a> today.</p><p>Another paragraph</p></div></main>',
    );
    const link = document.querySelector("a")!;
    const click = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener("click", click);
    const original = document.body.innerHTML;
    await controller.translatePage({ wholePage: true });
    const targets = document.querySelectorAll(
      '[data-yaku-owned="translation"]',
    );
    expect(targets).toHaveLength(2);
    expect(targets[0]!.querySelector("a")?.getAttribute("href")).toBe("/guide");
    expect(targets[0]!.querySelector("strong")?.textContent).toBe("the guide");
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0]![0].context).toContain("Keep every inline marker");
    expect(run.mock.calls[0]![0].text).toContain(
      '<yaku-link id="0"><yaku-em id="1">the guide</yaku-em></yaku-link>',
    );
    controller.restore();
    expect(document.body.innerHTML).toBe(original);
    expect(document.querySelector("a")).toBe(link);
    link.dispatchEvent(new MouseEvent("click", { cancelable: true }));
    expect(click).toHaveBeenCalledOnce();
  });

  it("excludes hidden, editable, code and explicitly untranslated content", async () => {
    const { controller, run } = setup(
      '<main><p>Visible</p><pre>code</pre><p hidden>secret</p><div style="display:none"><p>hidden parent</p></div><p style="visibility:hidden">hidden style</p><div contenteditable="true">editor</div><p translate="no">untouched</p><p><code>inline code</code> prose</p><textarea>input</textarea></main>',
    );
    await controller.translatePage({ wholePage: true });
    expect(
      run.mock.calls.map(([request]: [TranslationRequest]) => request.text),
    ).toEqual(["Visible", '<yaku-keep id="0"></yaku-keep> prose']);
    expect(document.querySelector("code")?.textContent).toBe("inline code");
  });

  it("restores original content after translation-only mode and styles translations", async () => {
    const { controller, settings } = setup(
      "<main><p>Hello <em>friend</em></p></main>",
    );
    const original = document.body.innerHTML;
    settings.mode = "translation";
    settings.style = "quote";
    await controller.translatePage();
    expect(document.querySelector("p")!.firstChild!.textContent).toBe("");
    expect(document.querySelector("p > em")?.hasAttribute("hidden")).toBe(true);
    expect(document.querySelector('[data-yaku-owned="source"]')).toBeNull();
    const target = document.querySelector<HTMLElement>(
      '[data-yaku-owned="translation"]',
    )!;
    expect(target.style.borderInlineStart).toContain("solid");
    controller.setMode("bilingual");
    expect(document.querySelector("p")!.firstChild!.textContent).toBe("Hello ");
    expect(document.querySelector("p > em")?.hasAttribute("hidden")).toBe(
      false,
    );
    settings.style = "blur";
    controller.setMode();
    expect(target.style.filter).toContain("blur");
    target.dispatchEvent(new Event("pointerenter"));
    expect(target.style.filter).toBe("none");
    controller.restore();
    expect(document.body.innerHTML).toBe(original);
  });

  it("rejects stale translation results after restore and after disposal", async () => {
    let complete!: (result: {
      id: string;
      text: string;
      elapsedMs: number;
    }) => void;
    const { controller } = setup(
      "<p>Hello</p>",
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = controller.translatePage({ wholePage: true });
    controller.restore();
    complete({ id: "old", text: "stale", elapsedMs: 0 });
    await pending;
    expect(document.body.innerHTML).toBe("<p>Hello</p>");
    controller.dispose();
    await controller.translatePage();
    expect(document.body.innerHTML).toBe("<p>Hello</p>");
  });

  it("translates inserted paragraphs and replaces stale output after source changes", async () => {
    const { controller } = setup("<main><p>First</p></main>");
    await controller.translatePage();
    const paragraph = document.createElement("p");
    paragraph.textContent = "Second";
    document.querySelector("main")!.append(paragraph);
    await settle();
    expect(
      paragraph.querySelector('[data-yaku-owned="translation"]')?.textContent,
    ).toBe("translated:Second");
    const originalText = paragraph.firstChild!;
    originalText.textContent = "Updated";
    await settle();
    expect(
      paragraph.querySelectorAll('[data-yaku-owned="translation"]'),
    ).toHaveLength(1);
    expect(
      paragraph.querySelector('[data-yaku-owned="translation"]')?.textContent,
    ).toBe("translated:Updated");
    paragraph.append(document.createTextNode(" additional"));
    await settle();
    expect(
      paragraph.querySelector('[data-yaku-owned="translation"]')?.textContent,
    ).toBe("translated:Updated additional");
    controller.restore();
    expect(paragraph.textContent).toBe("Updated additional");
  });

  it("uses intersection visibility for incremental work and limits the default scope", async () => {
    let intersect!: IntersectionObserverCallback;
    const observe = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersect = callback;
        }
        observe = observe;
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    const { controller, run } = setup(
      "<nav><p>Menu</p></nav><main><p>Article</p></main>",
    );
    await controller.translatePage();
    expect(run).not.toHaveBeenCalled();
    const paragraph = document.querySelector("main p")!;
    expect(observe).toHaveBeenCalledWith(paragraph);
    intersect(
      [
        {
          isIntersecting: true,
          target: paragraph,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    await settle();
    expect(
      run.mock.calls.map(([request]: [TranslationRequest]) => request.text),
    ).toEqual(["Article"]);
  });

  it("reports model failures and leaves source content intact", async () => {
    const error = new Error("model unavailable");
    const { controller, errors } = setup("<p>Original</p>", async () => {
      throw error;
    });
    await controller.translatePage({ wholePage: true });
    expect(errors).toHaveBeenCalledWith(error);
    expect(document.body.innerHTML).toBe("<p>Original</p>");
  });

  it("retains protected commands and MathML without sending their contents to the model", async () => {
    const { controller, run, settings } = setup(
      '<p>Run <code onclick="alert(1)">npm install</code> and evaluate <math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>a</mi><mi>b</mi></mfrac></math> now.</p>',
      async (request) => ({
        id: request.id,
        text: '现在运行<yaku-keep id="0"></yaku-keep>并计算<yaku-keep id="1"></yaku-keep>。',
        elapsedMs: 0,
      }),
    );
    settings.mode = "translation";
    const command = document.querySelector("code")!;
    const formula = document.querySelector("math")!;
    await controller.translatePage();
    const target = document.querySelector('[data-yaku-owned="translation"]')!;
    expect(run.mock.calls[0]![0].text).not.toContain("npm install");
    expect(run.mock.calls[0]![0].text).not.toContain("<mfrac>");
    expect(target.querySelector("code")?.textContent).toBe("npm install");
    expect(target.querySelector("code")?.hasAttribute("onclick")).toBe(false);
    expect(target.querySelector("math mfrac")?.namespaceURI).toBe(
      "http://www.w3.org/1998/Math/MathML",
    );
    expect(command.hasAttribute("hidden")).toBe(true);
    expect(formula.hasAttribute("hidden")).toBe(true);
    controller.restore();
    expect(command.hasAttribute("hidden")).toBe(false);
    expect(document.querySelector("code")).toBe(command);
    expect(formula.textContent).toBe("ab");
  });

  it("rejects protected marker edits without dropping source content", async () => {
    const html = "<p>Run <code>npm install</code> now.</p>";
    const { controller, errors } = setup(html, async (request) => ({
      id: request.id,
      text: '运行<yaku-keep id="0">changed</yaku-keep>',
      elapsedMs: 0,
    }));
    await controller.translatePage();
    expect(errors).toHaveBeenCalledOnce();
    expect(document.body.innerHTML).toBe(html);
  });

  it("preserves host edits, including empty values, while restoring owned text masks", async () => {
    const { controller, settings } = setup(
      "<p>Hello <strong>world</strong></p>",
    );
    settings.mode = "translation";
    const text = document.querySelector("p")!.firstChild as Text;
    await controller.translatePage();
    expect(text.parentNode).toBe(document.querySelector("p"));
    text.data = "";
    await settle();
    controller.restore();
    expect(document.querySelector("p")?.textContent).toBe("world");
  });

  it("retains host-authored hidden attributes while restoring a translated paragraph", async () => {
    const { controller, settings } = setup(
      "<p>Hello <strong>world</strong></p>",
    );
    settings.mode = "translation";
    await controller.translatePage();
    const strong = document.querySelector("p > strong")!;
    strong.setAttribute("hidden", "");
    await settle();
    controller.restore();
    expect(strong.hasAttribute("hidden")).toBe(true);
    expect(strong.textContent).toBe("world");
  });

  it("does not blank pending source text when switching mode during language detection", async () => {
    let finish!: (result: {
      isReliable: boolean;
      languages: { language: string; percentage: number }[];
    }) => void;
    const { controller, settings, run } = setup(
      "<p>Hello world</p>",
      undefined,
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = controller.translatePage();
    settings.mode = "translation";
    controller.setMode("translation");
    expect(document.querySelector("p")!.firstChild!.textContent).toBe(
      "Hello world",
    );
    finish({ isReliable: false, languages: [] });
    await pending;
    expect(run.mock.calls[0]![0].text).toBe("Hello world");
  });

  it("skips only reliably detected same-language paragraphs and invalidates the skip on source changes", async () => {
    const detection = vi.fn(async () => ({
      isReliable: true,
      languages: [{ language: "en", percentage: 100 }],
    }));
    const { controller, run, settings } = setup(
      '<main lang="fr"><p>Reliable English paragraph</p></main>',
      undefined,
      detection,
    );
    settings.targetLanguage = "en";
    await controller.translatePage();
    expect(run).not.toHaveBeenCalled();
    document.querySelector("main")!.append(document.createComment("unrelated"));
    await settle();
    expect(detection).toHaveBeenCalledOnce();
    detection.mockResolvedValue({
      isReliable: true,
      languages: [{ language: "fr", percentage: 100 }],
    });
    document.querySelector("p")!.firstChild!.textContent = "French paragraph";
    await settle();
    expect(run).toHaveBeenCalledOnce();
  });

  it.each([
    { isReliable: false, languages: [{ language: "en", percentage: 100 }] },
    {
      isReliable: true,
      languages: [
        { language: "en", percentage: 61 },
        { language: "fr", percentage: 38 },
      ],
    },
    { isReliable: true, languages: [{ language: "und", percentage: 100 }] },
    { isReliable: true, languages: [{ language: "fr", percentage: 100 }] },
  ])(
    "translates uncertain, mixed, unknown or mismatched language content despite html.lang: %j",
    async (result) => {
      const { controller, run, settings } = setup(
        '<main lang="en"><p>Content requiring translation</p></main>',
        undefined,
        async () => result,
      );
      settings.targetLanguage = "en";
      await controller.translatePage();
      expect(run).toHaveBeenCalledOnce();
    },
  );

  it.each(["zh", "zh-Hant"])(
    "does not merge ambiguous Chinese-script detection into target %s",
    async (target) => {
      const { controller, run, settings } = setup(
        '<main lang="zh-Hant"><p>中國文字與中国文字</p></main>',
        undefined,
        async () => ({
          isReliable: true,
          languages: [{ language: "zh", percentage: 100 }],
        }),
      );
      settings.targetLanguage = target;
      await controller.translatePage();
      expect(run).toHaveBeenCalledOnce();
    },
  );

  it("retranslates language/glossary changes but keeps appearance-only updates local", async () => {
    const { controller, run, settings } = setup(
      "<main><p>Hello</p></main>",
      async (request) => ({
        id: request.id,
        text: `${request.targetLanguage}:${request.glossary?.Hello ?? request.text}`,
        elapsedMs: 0,
      }),
    );
    await controller.translatePage();
    settings.targetLanguage = "ja";
    controller.setMode("bilingual");
    await settle();
    expect(
      document.querySelector('[data-yaku-owned="translation"]')?.textContent,
    ).toBe("ja:Hello");
    settings.glossary = { Hello: "glossary result" };
    controller.setMode("bilingual");
    await settle();
    expect(
      document.querySelector('[data-yaku-owned="translation"]')?.textContent,
    ).toBe("ja:glossary result");
    settings.style = "highlight";
    controller.setMode("translation");
    await settle();
    expect(run).toHaveBeenCalledTimes(3);
    expect(
      document
        .querySelector('[data-yaku-owned="translation"]')
        ?.getAttribute("data-yaku-style"),
    ).toBe("highlight");
  });

  it("follows SPA replacement of the main scope without duplicate translations", async () => {
    const { controller, run } = setup("<main><p>Old route</p></main>");
    await controller.translatePage();
    const next = document.createElement("main");
    next.innerHTML = "<p>New route</p>";
    document.querySelector("main")!.replaceWith(next);
    await settle();
    expect(
      next.querySelector('[data-yaku-owned="translation"]')?.textContent,
    ).toBe("translated:New route");
    expect(run).toHaveBeenCalledTimes(2);
    next.append(document.createComment("unrelated framework update"));
    await settle();
    expect(run).toHaveBeenCalledTimes(2);
    controller.restore();
    expect(next.innerHTML).toBe(
      "<p>New route</p><!--unrelated framework update-->",
    );
  });

  it("restores and retranslates one time per SPA URL change and stays restored afterward", async () => {
    const { controller, run } = setup("<main><p>Reusable view</p></main>");
    await controller.translatePage();
    const previous = location.href;
    history.pushState({}, "", "/new-route");
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle();
    expect(run).toHaveBeenCalledTimes(2);
    expect(
      document.querySelectorAll('[data-yaku-owned="translation"]'),
    ).toHaveLength(1);
    controller.restore();
    history.replaceState({}, "", previous);
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle();
    expect(run).toHaveBeenCalledTimes(2);
    expect(
      document.querySelector('[data-yaku-owned="translation"]'),
    ).toBeNull();
  });

  it("reorders a whole paragraph while retaining the mapped inline link and safe attributes", async () => {
    const { controller, run } = setup(
      '<p>The bank <a href="/rates" title="Rate details" onclick="alert(1)">raised rates</a> yesterday.</p>',
      async (request) => ({
        id: request.id,
        text: '昨日，银行<yaku-link id="0">提高了利率</yaku-link>。',
        elapsedMs: 0,
      }),
    );
    await controller.translatePage({ wholePage: true });
    const target = document.querySelector('[data-yaku-owned="translation"]')!;
    expect(target.textContent).toBe("昨日，银行提高了利率。");
    expect(target.querySelector("a")?.getAttribute("href")).toBe("/rates");
    expect(target.querySelector("a")?.getAttribute("title")).toBe(
      "Rate details",
    );
    expect(target.querySelector("a")?.hasAttribute("onclick")).toBe(false);
    expect(run).toHaveBeenCalledOnce();
  });

  it.each([
    "Unmarked translation",
    '<yaku-link id="99">Unknown</yaku-link>',
    '<yaku-link id="0">Missing close',
    '<yaku-link id="0">One</yaku-link><yaku-link id="0">Twice</yaku-link>',
    '<yaku-link id="0" href="https://attacker.example">Changed</yaku-link>',
    '<yaku-link id="0">Safe</yaku-link><img src="x" onerror="alert(1)">',
  ])(
    "rejects damaged or injected model markup without changing the source: %s",
    async (output) => {
      const html = '<p>Read <a href="/guide">the guide</a>.</p>';
      const { controller, errors } = setup(html, async (request) => ({
        id: request.id,
        text: output,
        elapsedMs: 0,
      }));
      await controller.translatePage({ wholePage: true });
      expect(errors).toHaveBeenCalledOnce();
      expect(document.body.innerHTML).toBe(html);
      expect(document.querySelector("img")).toBeNull();
    },
  );

  it("rejects balanced markers that alter the original nesting", async () => {
    const html = '<p>Read <a href="/guide"><strong>the guide</strong></a>.</p>';
    const { controller, errors } = setup(html, async (request) => ({
      id: request.id,
      text: '<yaku-em id="1"><yaku-link id="0">指南</yaku-link></yaku-em>',
      elapsedMs: 0,
    }));
    await controller.translatePage({ wholePage: true });
    expect(errors).toHaveBeenCalledOnce();
    expect(document.body.innerHTML).toBe(html);
  });

  it("renders escaped model text literally and omits unsafe source URLs", async () => {
    const { controller } = setup(
      '<p><a href="javascript:alert(1)" target="_blank">label</a></p>',
      async (request) => ({
        id: request.id,
        text: '<yaku-link id="0">&lt;script&gt;alert(1)&lt;/script&gt;</yaku-link>',
        elapsedMs: 0,
      }),
    );
    await controller.translatePage({ wholePage: true });
    const target = document.querySelector('[data-yaku-owned="translation"]')!;
    expect(target.textContent).toBe("<script>alert(1)</script>");
    expect(target.querySelector("script")).toBeNull();
    expect(target.querySelector("a")?.hasAttribute("href")).toBe(false);
    expect(target.querySelector("a")?.getAttribute("rel")).toContain(
      "noopener",
    );
  });

  it("translates nested open shadow roots and direct shadow text while preserving restoration and links", async () => {
    const { controller, run } = setup(
      '<main><section id="host"></section></main>',
    );
    const root = document
      .querySelector("#host")!
      .attachShadow({ mode: "open" });
    root.innerHTML =
      '<p>Read <a href="/guide">the guide</a>.</p><section id="nested"></section>Direct root text';
    const nested = root
      .querySelector("#nested")!
      .attachShadow({ mode: "open" });
    nested.innerHTML = "<p>Nested paragraph</p>";
    const original = root.innerHTML;
    const nestedOriginal = nested.innerHTML;
    const link = root.querySelector("a");
    await controller.translatePage({ wholePage: true });
    expect(run).toHaveBeenCalledTimes(3);
    expect(
      root
        .querySelector('p [data-yaku-owned="translation"] a')
        ?.getAttribute("href"),
    ).toBe("/guide");
    expect(
      [...root.children].find(
        (element) => element.getAttribute("data-yaku-owned") === "translation",
      )?.textContent,
    ).toBe("translated:Direct root text");
    expect(
      nested.querySelector('[data-yaku-owned="translation"]')?.textContent,
    ).toBe("translated:Nested paragraph");
    controller.restore();
    expect(root.innerHTML).toBe(original);
    expect(nested.innerHTML).toBe(nestedOriginal);
    expect(root.querySelector("a")).toBe(link);
  });

  it("observes new shadow paragraphs and newly inserted open hosts without revisiting translations", async () => {
    const { controller, run } = setup(
      '<main><section id="host"></section></main>',
    );
    const root = document
      .querySelector("#host")!
      .attachShadow({ mode: "open" });
    root.innerHTML = "<p>First shadow paragraph</p>";
    await controller.translatePage({ wholePage: true });
    const extra = document.createElement("p");
    extra.textContent = "Added shadow paragraph";
    root.append(extra);
    const host = document.createElement("section");
    const addedRoot = host.attachShadow({ mode: "open" });
    addedRoot.innerHTML = "<p>New component</p>";
    document.querySelector("main")!.append(host);
    await settle();
    expect(
      extra.querySelector('[data-yaku-owned="translation"]')?.textContent,
    ).toBe("translated:Added shadow paragraph");
    expect(
      addedRoot.querySelector('[data-yaku-owned="translation"]')?.textContent,
    ).toBe("translated:New component");
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("respects host-level hidden, editable and site exclusions across open shadow boundaries", async () => {
    const { controller, run, settings } = setup(
      '<main><section hidden></section><section contenteditable="true"></section><section class="excluded"></section><section id="allowed"></section></main>',
    );
    for (const host of document.querySelectorAll("section"))
      host.attachShadow({ mode: "open" }).innerHTML = "<p>Component text</p>";
    settings.siteRules = [
      {
        hostname: location.hostname,
        action: "always",
        excludeSelector: ".excluded",
      },
    ];
    await controller.translatePage({ wholePage: true });
    expect(run).toHaveBeenCalledOnce();
    expect(
      document
        .querySelector("#allowed")!
        .shadowRoot!.querySelector('[data-yaku-owned="translation"]'),
    ).not.toBeNull();
  });
});
