import { test, expect, chromium, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Settings } from "../../frontend/src/entities/settings";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { verifyBackgroundSource } from "../../scripts/experiments/background-identity.mjs";

async function sendFixture(
  bridge: Page,
  page: Page,
  action: string,
  payload?: unknown,
) {
  return bridge.evaluate(
    async ({ url, action, payload }) => {
      const tabs = await chrome.tabs.query({ url });
      if (tabs.length !== 1 || tabs[0]?.id === undefined)
        throw new Error("The unique fixture tab was not found.");
      return chrome.tabs.sendMessage(tabs[0].id, {
        destination: "content",
        action,
        payload,
      });
    },
    { url: page.url(), action, payload },
  );
}

async function panelText(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const tree = await cdp.send("Accessibility.getFullAXTree");
    const panel = tree.nodes.find(
      (node) =>
        node.role?.value === "region" && node.name?.value === "Translation",
    );
    if (!panel?.backendDOMNodeId) return "";
    const object = await cdp.send("DOM.resolveNode", {
      backendNodeId: panel.backendDOMNodeId,
    });
    const value = await cdp.send("Runtime.callFunctionOn", {
      objectId: object.object.objectId,
      functionDeclaration:
        'function(){return this.querySelector("p")?.textContent || ""}',
      returnByValue: true,
    });
    return String(value.result.value ?? "");
  } finally {
    await cdp.detach();
  }
}

async function clickContextButton(page: Page, name: string) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const tree = await cdp.send("Accessibility.getFullAXTree");
    const matches = tree.nodes.filter(
      (node) => node.role?.value === "button" && node.name?.value === name,
    );
    expect(matches).toHaveLength(1);
    const box = await cdp.send("DOM.getBoxModel", {
      backendNodeId: matches[0]!.backendDOMNodeId!,
    });
    await page.mouse.click(
      (box.model.content[0]! + box.model.content[2]!) / 2,
      (box.model.content[1]! + box.model.content[5]!) / 2,
    );
  } finally {
    await cdp.detach();
  }
}

test("real Chrome IME, rich editors, frames, hover, RTL, exclusions and SPA preserve user content", async () => {
  test.skip(
    !process.env.YAKU_MODEL_PROFILE,
    "Requires an explicitly supplied real cached-model profile.",
  );
  test.setTimeout(600000);
  console.log("context-page: launching Chrome");
  const context = await chromium.launchPersistentContext(
    process.env.YAKU_MODEL_PROFILE!,
    {
      channel: "chrome",
      headless: true,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [
        "--enable-unsafe-extension-debugging",
        "--remote-debugging-port=0",
      ],
      viewport: { width: 1280, height: 900 },
    },
  );
  context.setDefaultTimeout(20000);
  context.setDefaultNavigationTimeout(30000);
  console.log("context-page: Chrome launched");
  let bridge: Page | undefined;
  let fixture: Page | undefined;
  let diagnosticTimer: ReturnType<typeof setInterval> | undefined;
  let originalSettings: Settings | undefined;
  const evidence: Record<string, unknown> = new Proxy(
    {
      usesModelStubs: false,
      usesClosedShadowInstrumentation: false,
    } as Record<string, unknown>,
    {
      set(target, key, value) {
        console.log("context-page:", String(key), JSON.stringify(value));
        return Reflect.set(target, key, value);
      },
    },
  );
  const nonce = crypto.randomUUID();
  const fixtureUrl = `https://context-fixture.test/reading?run=${nonce}`;
  const policyFixtures = {
    english:
      "The museum opens at nine every morning. Visitors can buy tickets online. Children under six enter for free. Please keep your ticket until you leave. The final gallery contains a map of the city.",
    french:
      "Le musée ouvre à neuf heures chaque matin. Les visiteurs peuvent acheter leurs billets en ligne. Les enfants de moins de six ans entrent gratuitement. Veuillez conserver votre billet jusqu’à votre départ.",
    mixed:
      "The museum opens at nine every morning. Visitors can buy tickets online. 博物馆每周一闭馆，请提前安排您的参观时间。儿童可以免费参观，但需要由成年人陪同。",
  };
  const errors: string[] = [];
  try {
    const require = createRequire(import.meta.url);
    const wxtRequire = createRequire(require.resolve("wxt"));
    const esbuild = (await import(
      pathToFileURL(wxtRequire.resolve("esbuild")).href
    )) as {
      build(
        options: Record<string, unknown>,
      ): Promise<{ outputFiles: { text: string }[] }>;
    };
    const bundled = await esbuild.build({
      entryPoints: [path.resolve("tests/fixtures/react-reading.ts")],
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      define: { "process.env.NODE_ENV": '"development"' },
      logLevel: "error",
    });
    const cdp = await context.browser()!.newBrowserCDPSession();
    console.log("context-page: loading extension");
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: path.resolve(".output/chrome-mv3"),
    });
    bridge = await context.newPage();
    console.log("context-page: opening bridge");
    await bridge.goto(`chrome-extension://${id}/options.html`);
    const cache = await bridge.evaluate(() =>
      chrome.runtime.sendMessage({
        destination: "background",
        action: "cache-info",
      }),
    );
    expect(cache.ok).toBe(true);
    expect(cache.value.complete).toBe(true);
    evidence.backgroundIdentity = await verifyBackgroundSource(
      process.env.YAKU_MODEL_PROFILE!,
      id,
      path.resolve(".output/chrome-mv3/background.js"),
    );
    console.log("context-page: cached model confirmed");
    originalSettings = await bridge.evaluate(
      async () =>
        (await chrome.storage.local.get("settings")).settings as Settings,
    );
    await bridge.evaluate(
      (settings) =>
        chrome.storage.local.set({
          settings: {
            ...settings,
            targetLanguage: "zh",
            sourceLanguage: "auto",
            hoverEnabled: true,
            selectionEnabled: true,
            inputEnabled: true,
            inputTargetLanguage: "zh",
            autoTranslate: false,
            mode: "bilingual",
            glossary: {},
            siteRules: [
              {
                hostname: "context-fixture.test",
                action: "always",
                excludeSelector: ".skip",
              },
            ],
          },
        }),
      originalSettings,
    );
    await context.route("https://context-fixture.test/**", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/react.js")
        return route.fulfill({
          contentType: "text/javascript",
          body: bundled.outputFiles[0]!.text,
        });
      if (url.pathname === "/react")
        return route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `<!doctype html><html lang="en"><head><title>React reading fixture</title><style>body{font:20px/28px sans-serif;margin:40px}p{width:500px}</style></head><body><div id="root"></div><script src="/react.js?run=${nonce}"></script></body></html>`,
        });
      if (url.pathname === "/policy")
        return route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `<!doctype html><html lang="en"><title>Source policy fixture</title><main>${Object.entries(
            policyFixtures,
          )
            .map(([name, text]) => `<p id="${name}">${text}</p>`)
            .join("")}</main></html>`,
        });
      if (url.pathname.startsWith("/frame"))
        return route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `<!doctype html><html lang="en"><main><p id="frame-reading">Good morning.</p></main><textarea id="frame-input">Hello friend.</textarea></html>`,
        });
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><html lang="en"><head><title>Context fixture</title></head><body style="font:18px/1.5 sans-serif;margin:30px"><h1 id="focus" tabindex="0" translate="no">Interaction fixture</h1><main><p id="reading">The bank <a href="https://example.com/rates">raised interest rates</a> after the meeting.</p><table><tr><td id="cell">Good morning.</td></tr></table><p class="skip">Excluded English text.</p></main><p id="hover">Good morning.</p><p id="pick">A friendly greeting.</p><textarea id="ime">Hello friend.</textarea><div id="rich" contenteditable="true" tabindex="0"><p>Hello <strong>friend</strong>.</p><p>Good morning.</p></div><iframe id="inactive" src="/frame-inactive?run=${nonce}" title="Inactive frame"></iframe><iframe id="active" src="/frame-active?run=${nonce}" title="Active frame"></iframe></body></html>`,
      });
    });
    const page = await context.newPage();
    fixture = page;
    diagnosticTimer = setInterval(() => {
      void Promise.all([
        page.evaluate(() => ({
          url: location.href,
          targets: document.querySelectorAll('[data-yaku-owned="translation"]')
            .length,
          reading: document.querySelector("#reading")?.outerHTML,
          floating: document
            .querySelector("[data-yaku-floating]")
            ?.shadowRoot?.querySelector("[role=alert]")?.textContent,
        })),
        bridge!.evaluate(() => chrome.storage.session.get("modelStatus")),
      ]).then(
        ([dom, status]) =>
          console.log(
            "context-page: diagnostic",
            JSON.stringify({ dom, status }),
          ),
        (error) =>
          console.log("context-page: diagnostic unavailable", String(error)),
      );
    }, 15000);
    console.log("context-page: opening unique fixture");
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(fixtureUrl);
    await expect(page.locator("[data-yaku-floating]")).toBeVisible();
    async function send(action: string, payload?: unknown) {
      return sendFixture(bridge!, page, action, payload);
    }
    await send("restore-page");
    if (!process.env.YAKU_PAGE_ONLY) {
      console.log("context-page: starting IME composition");
      const input = page.locator("#ime");
      await input.fill("");
      await input.focus();
      await input.evaluate((element) => {
        const trace: {
          type: string;
          composing?: boolean;
          trusted: boolean;
          inputType?: string;
        }[] = [];
        Object.assign(window, { imeTrace: trace });
        for (const type of ["compositionstart", "compositionend", "input"])
          element.addEventListener(type, (event) =>
            trace.push({
              type,
              composing: (event as InputEvent).isComposing,
              trusted: event.isTrusted,
              inputType: (event as InputEvent).inputType,
            }),
          );
      });
      const inputCdp = await context.newCDPSession(page);
      await inputCdp.send("Input.imeSetComposition", {
        text: "正在输入",
        selectionStart: 4,
        selectionEnd: 4,
      });
      const composingText = await input.inputValue();
      console.log("context-page: requesting translation during composition");
      await send("translate-input");
      expect(await input.inputValue()).toBe(composingText);
      await inputCdp.send("Input.imeSetComposition", {
        text: "",
        selectionStart: 0,
        selectionEnd: 0,
      });
      evidence.ime = await page.evaluate(
        () => (window as unknown as { imeTrace: unknown[] }).imeTrace,
      );
      expect(
        (evidence.ime as { type: string; trusted: boolean }[]).some(
          (event) => event.type === "compositionstart" && event.trusted,
        ),
      ).toBe(true);
      await input.fill("Hello friend.");
      await send("translate-input");
      await expect(input).toHaveValue(/[\u3400-\u9fff]/u, { timeout: 180000 });
      evidence.inputTranslation = await input.inputValue();
      const inputToolbar = page
        .locator('[data-yaku-owned="true"][style*="inset"]')
        .first();
      await expect(inputToolbar).toBeVisible();
      await expect
        .poll(async () => {
          const editor = await input.boundingBox();
          const toolbar = await inputToolbar.boundingBox();
          return editor && toolbar
            ? Math.round(editor.y - toolbar.y - toolbar.height)
            : null;
        })
        .toBe(6);
      const beforeScroll = (await inputToolbar.boundingBox())!.y;
      await page.evaluate(() => {
        document.body.style.minHeight = "200vh";
        window.scrollTo(0, 30);
      });
      await expect
        .poll(async () => {
          const toolbar = await inputToolbar.boundingBox();
          return toolbar && Math.round(beforeScroll - toolbar.y);
        })
        .toBe(30);
      await clickContextButton(page, "Undo translation");
      expect(await input.inputValue()).toBe("Hello friend.");
      const suffixSource = "Keep https://example.test/info. /ja Good morning.";
      await input.fill(suffixSource);
      await send("translate-input");
      await expect(input).toHaveValue(
        /^Keep https:\/\/example\.test\/info\. .*おはよう/u,
        { timeout: 180000 },
      );
      evidence.inputSuffix = await input.inputValue();
      await clickContextButton(page, "Undo translation");
      await expect(input).toHaveValue(suffixSource);
      await input.fill("Hello friend.");
      await page.keyboard.down("Space");
      await page.keyboard.down("Space");
      await page.keyboard.down("Space");
      await page.keyboard.up("Space");
      await expect(input).toHaveValue("Hello friend.   ");
      expect(await panelText(page)).toBe("");
      await input.fill("Hello friend.");
      await page.keyboard.press("Home");
      await page.keyboard.type("   ");
      await expect(input).toHaveValue("   Hello friend.");
      expect(await panelText(page)).toBe("");
      await input.evaluate((element) => {
        element.style.cssText = "position:fixed;top:2px;right:0";
      });
      await input.fill("Hello friend.");
      await page.keyboard.type("   ");
      await expect(input).toHaveValue(/[\u3400-\u9fff]/u, { timeout: 180000 });
      evidence.inputSpaceTrigger = await input.inputValue();
      await expect(inputToolbar).toBeVisible();
      await expect
        .poll(async () => {
          const editor = await input.boundingBox();
          const toolbar = await inputToolbar.boundingBox();
          return editor && toolbar
            ? Math.round(toolbar.y - editor.y - editor.height)
            : null;
        })
        .toBe(6);
      const toolbar = (await inputToolbar.boundingBox())!;
      expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(
        (await page.evaluate(() => document.documentElement.clientWidth)) - 5,
      );
      await clickContextButton(page, "Undo translation");
      await expect(input).toHaveValue("Hello friend.   ");
      await input.evaluate((element) => element.removeAttribute("style"));
      await input.fill("Keep // Good morning.");
      await send("translate-input");
      await expect(input).toHaveValue(/^Keep .*早/u, { timeout: 180000 });
      const inputTree = await inputCdp.send("Accessibility.getFullAXTree");
      const inputLanguage = inputTree.nodes.find(
        (node) => node.name?.value === "Input translation language",
      );
      expect(inputLanguage?.backendDOMNodeId).toBeDefined();
      await inputCdp.send("DOM.focus", {
        backendNodeId: inputLanguage!.backendDOMNodeId!,
      });
      await page.keyboard.press("j");
      await expect(input).toHaveValue(/^Keep .*おはよう/u, { timeout: 180000 });
      await expect
        .poll(() =>
          bridge!.evaluate(async () => {
            const stored = await chrome.storage.local.get("settings");
            return (stored.settings as Settings).inputTargetLanguage;
          }),
        )
        .toBe("ja");
      await clickContextButton(page, "Undo translation");
      await expect(input).toHaveValue("Keep // Good morning.");
      await bridge.evaluate(async () => {
        const stored = await chrome.storage.local.get("settings");
        await chrome.storage.local.set({
          settings: {
            ...(stored.settings as Settings),
            inputTargetLanguage: "zh",
          },
        });
      });
      const selectedInput = "Keep Good morning. Keep this too.";
      await input.fill(selectedInput);
      await input.evaluate((element: HTMLInputElement) =>
        element.setSelectionRange(5, 18, "backward"),
      );
      await send("translate-input");
      await expect(input).toHaveValue(/^Keep .*早.* Keep this too\.$/u, {
        timeout: 180000,
      });
      evidence.selectedInput = await input.inputValue();
      await clickContextButton(page, "Undo translation");
      await expect(input).toHaveValue(selectedInput);
      expect(
        await input.evaluate((element: HTMLInputElement) => [
          element.selectionStart,
          element.selectionEnd,
          element.selectionDirection,
        ]),
      ).toEqual([5, 18, "backward"]);
      await inputCdp.detach();
      const rich = page.locator("#rich");
      const originalRich = await rich.innerHTML();
      await rich.focus();
      await send("translate-input");
      await expect(rich.locator("strong")).toContainText(/[\u3400-\u9fff]/u, {
        timeout: 180000,
      });
      expect(await rich.locator("p").count()).toBe(2);
      evidence.richTranslation = await rich.innerHTML();
      await clickContextButton(page, "Undo translation");
      expect(await rich.innerHTML()).toBe(originalRich);
      await rich.locator("strong").evaluate((element) => {
        const text = element.firstChild!;
        getSelection()!.setBaseAndExtent(
          text,
          text.textContent!.length,
          text,
          0,
        );
      });
      await send("translate-input");
      await expect(rich.locator("strong")).toContainText(/[\u3400-\u9fff]/u, {
        timeout: 180000,
      });
      await expect(rich.locator("p").last()).toHaveText("Good morning.");
      await clickContextButton(page, "Undo translation");
      expect(await rich.innerHTML()).toBe(originalRich);
      expect(await page.evaluate(() => getSelection()?.toString())).toBe(
        "friend",
      );
      const conversationUrl = `https://www.youtube.com/watch?yakuFixture=${nonce}`;
      const japaneseComment =
        "この動画はとても分かりやすかったです。詳しい説明をありがとうございます。次の動画も楽しみにしています。";
      const englishDescription =
        "The video shows how to care for plants. It includes advice about soil, watering and sunlight. Please subscribe for more videos.";
      await context.route(conversationUrl, (route) =>
        route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `<!doctype html><html lang="en"><main><div id="description-inline-expander">${englishDescription}</div><div id="comment"><yt-attributed-string id="content-text">${japaneseComment}<span data-yaku-owned="translation">${englishDescription}</span></yt-attributed-string><textarea></textarea></div></main></html>`,
        }),
      );
      const conversation = await context.newPage();
      await conversation.goto(conversationUrl);
      await expect(conversation.locator("[data-yaku-floating]")).toBeVisible();
      const reply = conversation.locator("textarea");
      await reply.fill("Good morning.");
      await sendFixture(bridge, conversation, "translate-input");
      await expect(reply).toHaveValue(/おはよう/u, { timeout: 180000 });
      evidence.conversationInput = await reply.inputValue();
      evidence.conversationDetection = await bridge.evaluate(
        async ([nearby, description]) => ({
          nearby: await chrome.i18n.detectLanguage(nearby!),
          description: await chrome.i18n.detectLanguage(description!),
        }),
        [japaneseComment, englishDescription],
      );
      await clickContextButton(conversation, "Undo translation");
      await expect(reply).toHaveValue("Good morning.");
      await reply.fill("// Good morning.");
      await sendFixture(bridge, conversation, "translate-input");
      await expect(reply).toHaveValue(/早/u, { timeout: 180000 });
      await conversation.close();
      await page.bringToFront();
      await page.locator("#pick").evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(range);
        element.dispatchEvent(
          new MouseEvent("mouseup", { bubbles: true, composed: true }),
        );
      });
      await clickContextButton(page, "Translate selection");
      await expect
        .poll(() => panelText(page), { timeout: 180000 })
        .toMatch(/[\u3400-\u9fff]/u);
      evidence.selection = await panelText(page);
      await page.keyboard.press("Escape");
      await page.locator("#focus").click();
      await page.locator("#hover").hover();
      await page.keyboard.press("Alt");
      await expect
        .poll(() => panelText(page), { timeout: 180000 })
        .toMatch(/[\u3400-\u9fff]/u);
      evidence.hover = await panelText(page);
      await page.keyboard.press("Alt");
      await expect.poll(() => panelText(page)).toBe("");
      const inactive = page.frameLocator("#inactive").locator("#frame-input");
      const active = page.frameLocator("#active").locator("#frame-input");
      await inactive.focus();
      await active.focus();
      await send("translate-input");
      await expect(active).toHaveValue(/[\u3400-\u9fff]/u, { timeout: 180000 });
      expect(await inactive.inputValue()).toBe("Hello friend.");
      evidence.focusedFrameInput = await active.inputValue();
    }
    await page.locator("#focus").click();
    await page
      .getByRole("button", { name: "Translate this page", exact: true })
      .click();
    console.log("context-page: floating page translation requested");
    await expect(
      page.locator('#reading [data-yaku-owned="translation"]'),
    ).toContainText(/[\u3400-\u9fff]/u, { timeout: 180000 });
    await expect(
      page
        .frameLocator("#active")
        .locator('#frame-reading [data-yaku-owned="translation"]'),
    ).toContainText(/[\u3400-\u9fff]/u, { timeout: 180000 });
    await expect(
      page
        .frameLocator("#inactive")
        .locator('#frame-reading [data-yaku-owned="translation"]'),
    ).toContainText(/[\u3400-\u9fff]/u, { timeout: 180000 });
    await expect(
      page.locator('#cell [data-yaku-owned="translation"]'),
    ).toContainText(/[\u3400-\u9fff]/u, { timeout: 180000 });
    expect(await page.locator(".skip [data-yaku-owned]").count()).toBe(0);
    evidence.framesAndTables = {
      top: await page
        .locator('#reading [data-yaku-owned="translation"]')
        .innerText(),
      table: await page
        .locator('#cell [data-yaku-owned="translation"]')
        .innerText(),
    };
    await bridge.evaluate(async () => {
      const settings = (await chrome.storage.local.get("settings"))
        .settings as Settings;
      await chrome.storage.local.set({
        settings: { ...settings, targetLanguage: "ar" },
      });
    });
    await expect(
      page.locator('#reading [data-yaku-owned="translation"]'),
    ).toContainText(/[\u0600-\u06ff]/u, { timeout: 180000 });
    expect(
      await page
        .locator('#reading [data-yaku-owned="translation"]')
        .getAttribute("dir"),
    ).toBe("auto");
    evidence.rtl = await page
      .locator('#reading [data-yaku-owned="translation"]')
      .innerText();
    await page.evaluate((nonce) => {
      history.pushState({}, "", `/spa?run=${nonce}`);
      const main = document.querySelector("main")!;
      const next = document.createElement("main");
      next.innerHTML = '<p id="spa">Good evening.</p>';
      main.replaceWith(next);
    }, nonce);
    await expect(
      page.locator('#spa [data-yaku-owned="translation"]'),
    ).toContainText(/[\u0600-\u06ff]/u, { timeout: 180000 });
    expect(
      await page.locator('#spa [data-yaku-owned="translation"]').count(),
    ).toBe(1);
    evidence.spa = await page
      .locator('#spa [data-yaku-owned="translation"]')
      .innerText();
    await send("restore-page");
    expect(await page.locator("#spa").innerHTML()).toBe("Good evening.");
    evidence.speechVoices = await page.evaluate(() =>
      speechSynthesis
        .getVoices()
        .map((voice) => ({ language: voice.lang, local: voice.localService })),
    );
    const localEnglish = (
      evidence.speechVoices as { language: string; local: boolean }[]
    ).some(
      (voice) => voice.local && voice.language.toLowerCase().startsWith("en"),
    );
    if (localEnglish) {
      await page.locator("#hover").evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(range);
        element.dispatchEvent(
          new MouseEvent("mouseup", { bubbles: true, composed: true }),
        );
      });
      await clickContextButton(page, "Listen to original");
      evidence.localSpeechAttempt = await page.evaluate(() => ({
        speaking: speechSynthesis.speaking,
        pending: speechSynthesis.pending,
        paused: speechSynthesis.paused,
        headlessAudioNotAudited: true,
      }));
      await page.keyboard.press("Escape");
    } else
      evidence.localSpeechAttempt = {
        availableMatchingLocalVoice: false,
        pronunciationNotClaimed: true,
      };
    await bridge.evaluate(async () => {
      const settings = (await chrome.storage.local.get("settings"))
        .settings as Settings;
      await chrome.storage.local.set({
        settings: {
          ...settings,
          targetLanguage: "zh",
          mode: "bilingual",
          translationPosition: "after",
        },
      });
    });
    const react = await context.newPage();
    react.on("pageerror", (error) => errors.push(String(error)));
    await react.goto(`https://context-fixture.test/react?run=${nonce}`);
    await react.waitForFunction(
      () => (window as unknown as { reactReady: boolean }).reactReady,
    );
    await sendFixture(bridge, react, "restore-page");
    await sendFixture(bridge, react, "translate-page");
    await expect(
      react.locator('#react-reading [data-yaku-owned="translation"]'),
    ).toContainText(/[\u3400-\u9fff]/u, { timeout: 180000 });
    await expect(
      react.locator('#protected-code [data-yaku-owned="translation"] code'),
    ).toHaveText("npm install", { timeout: 180000 });
    await expect(
      react.locator(
        '#protected-math [data-yaku-owned="translation"] math mfrac',
      ),
    ).toBeVisible({ timeout: 180000 });
    evidence.protectedRendering = await react.evaluate(() => ({
      code: document.querySelector(
        '#protected-code [data-yaku-owned="translation"]',
      )?.innerHTML,
      math: document.querySelector(
        '#protected-math [data-yaku-owned="translation"]',
      )?.innerHTML,
    }));
    await react.locator("#react-toggle").click();
    await expect
      .poll(() =>
        react.evaluate(
          () => (window as unknown as { reactErrors: string[] }).reactErrors,
        ),
      )
      .toEqual([]);
    await bridge.evaluate(async () => {
      const settings = (await chrome.storage.local.get("settings"))
        .settings as Settings;
      await chrome.storage.local.set({
        settings: {
          ...settings,
          mode: "translation",
          translationPosition: "before",
        },
      });
    });
    await react.locator("#react-toggle").click();
    await react.waitForFunction(() => {
      const paragraph = document.querySelector("#react-reading");
      return (
        paragraph &&
        [...paragraph.childNodes]
          .filter((node) => node.nodeType === 3)
          .every((node) => node.textContent === "")
      );
    });
    await expect(
      react.locator('#react-reading [data-yaku-owned="translation"]'),
    ).toContainText(/[\u3400-\u9fff]/u, { timeout: 180000 });
    const layout = await react
      .locator("#react-reading")
      .evaluate((element) => ({
        paragraph: element.getBoundingClientRect().height,
        target: element
          .querySelector('[data-yaku-owned="translation"]')!
          .getBoundingClientRect().height,
        sourceParents: [...element.childNodes]
          .filter((node) => node.nodeType === 3)
          .every((node) => node.parentNode === element),
      }));
    expect(layout.paragraph).toBeLessThanOrEqual(layout.target + 2);
    expect(layout.sourceParents).toBe(true);
    evidence.reactLayout = layout;
    evidence.reactErrors = await react.evaluate(
      () => (window as unknown as { reactErrors: string[] }).reactErrors,
    );
    expect(evidence.reactErrors).toEqual([]);
    await sendFixture(bridge, react, "restore-page");
    expect(await react.locator("#react-reading").textContent()).toBe(
      "Hello world",
    );
    expect(errors).toEqual([]);
    evidence.pageErrors = errors;
    evidence.policyDetections = await bridge.evaluate(
      async (fixtures) =>
        Object.fromEntries(
          await Promise.all(
            Object.entries(fixtures).map(async ([name, text]) => [
              name,
              await chrome.i18n.detectLanguage(text),
            ]),
          ),
        ),
      policyFixtures,
    );
    await bridge.evaluate(async () => {
      const settings = (await chrome.storage.local.get("settings"))
        .settings as Settings;
      await chrome.storage.local.set({
        settings: {
          ...settings,
          mode: "bilingual",
          sourceLanguage: "auto",
          targetLanguage: "zh",
          alwaysSourceLanguages: ["en"],
          neverSourceLanguages: ["en", "zh"],
        },
      });
    });
    const policy = await context.newPage();
    await policy.goto(`https://context-fixture.test/policy?run=${nonce}`);
    expect(await policy.locator("#mixed").textContent()).toBe(
      policyFixtures.mixed,
    );
    evidence.policyCharacterSet = await policy.evaluate(
      () => document.characterSet,
    );
    await expect(policy.locator("[data-yaku-floating]")).toBeVisible();
    await sendFixture(bridge, policy, "translate-page");
    await expect(
      policy.locator('#french [data-yaku-owned="translation"]'),
    ).toContainText(/[\u3400-\u9fff]/u, { timeout: 180000 });
    await expect(
      policy.locator('#mixed [data-yaku-owned="translation"]'),
    ).toContainText(/[\u3400-\u9fff]/u, { timeout: 180000 });
    expect(
      await policy.locator('#english [data-yaku-owned="translation"]').count(),
    ).toBe(0);
    expect(await policy.locator("#english").textContent()).toBe(
      policyFixtures.english,
    );
    expect(await sendFixture(bridge, policy, "page-state")).toEqual({
      ok: true,
      value: true,
    });
    evidence.sourcePolicy = {
      excludedEnglish: await policy.locator("#english").textContent(),
      unmatchedFrench: await policy
        .locator('#french [data-yaku-owned="translation"]')
        .innerText(),
      mixed: await policy
        .locator('#mixed [data-yaku-owned="translation"]')
        .innerText(),
    };
    await bridge.evaluate(async () => {
      const settings = (await chrome.storage.local.get("settings"))
        .settings as Settings;
      await chrome.storage.local.set({
        settings: { ...settings, neverSourceLanguages: [] },
      });
    });
    await expect(
      policy.locator('#english [data-yaku-owned="translation"]'),
    ).toContainText(/[\u3400-\u9fff]/u, { timeout: 180000 });
    evidence.removedSourceExclusion = await policy
      .locator('#english [data-yaku-owned="translation"]')
      .innerText();
    await sendFixture(bridge, policy, "restore-page");
    expect(await policy.locator("#english").textContent()).toBe(
      policyFixtures.english,
    );
    expect(await sendFixture(bridge, policy, "page-state")).toEqual({
      ok: true,
      value: false,
    });
    const unload = await bridge.evaluate(() =>
      chrome.runtime.sendMessage({
        destination: "background",
        action: "unload-model",
      }),
    );
    expect(unload.ok, JSON.stringify(unload)).toBe(true);
    await context.setOffline(true);
    const offline = await bridge.evaluate(() =>
      chrome.runtime.sendMessage({
        destination: "background",
        action: "prepare",
      }),
    );
    expect(offline.ok, JSON.stringify(offline)).toBe(true);
    const offlineTranslation = await bridge.evaluate(() =>
      chrome.runtime.sendMessage({
        destination: "background",
        action: "translate",
        payload: {
          id: crypto.randomUUID(),
          text: "Good evening.",
          targetLanguage: "zh",
        },
      }),
    );
    expect(offlineTranslation.ok).toBe(true);
    expect(offlineTranslation.value.text).toMatch(/[\u3400-\u9fff]/u);
    evidence.offlineCurrentBuild = offlineTranslation.value;
  } finally {
    clearInterval(diagnosticTimer);
    if (fixture && !fixture.isClosed()) {
      evidence.finalFixture = await fixture.evaluate(() => ({
        url: location.href,
        text: document.body.innerText,
        reading: document.querySelector("#reading")?.outerHTML,
        floating: document
          .querySelector("[data-yaku-floating]")
          ?.shadowRoot?.querySelector("[role=alert]")?.textContent,
      }));
    }
    if (bridge && originalSettings)
      await bridge.evaluate(
        (settings) => chrome.storage.local.set({ settings }),
        originalSettings,
      );
    await mkdir(path.resolve(".workspace/qa"), { recursive: true });
    await writeFile(
      path.resolve(".workspace/qa/context-page-real-model.json"),
      JSON.stringify(evidence, null, 2),
    );
    await context.close();
  }
});
