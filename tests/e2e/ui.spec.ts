import type { Settings } from "../../frontend/src/entities/settings";
import {
  encodeSyncedSettings,
  syncPrefix,
} from "../../frontend/src/features/preferences/sync-codec";
import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { verifyBackgroundSource } from "../../scripts/experiments/background-identity.mjs";

let context: BrowserContext;
let extensionId: string;
const screenshotDir = path.resolve(".workspace/qa");

test.beforeAll(async () => {
  await mkdir(screenshotDir, { recursive: true });
  const profile =
    process.env.YAKU_MODEL_PROFILE ??
    (await mkdtemp(path.join(tmpdir(), "yaku-ui-e2e-")));
  context = await chromium.launchPersistentContext(profile, {
    channel: "chrome",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging", "--remote-debugging-port=0"],
    viewport: { width: 1180, height: 860 },
    acceptDownloads: true,
  });
  const browser = context.browser();
  if (!browser)
    throw new Error("The browser context has no browser connection.");
  const cdp = await browser.newBrowserCDPSession();
  const result = await cdp.send("Extensions.loadUnpacked", {
    path: path.resolve(".output/chrome-mv3"),
  });
  extensionId = result.id;
  const bridge = await context.newPage();
  await bridge.goto(`chrome-extension://${extensionId}/options.html`);
  const identity = await verifyBackgroundSource(
    profile,
    extensionId,
    path.resolve(".output/chrome-mv3/background.js"),
  );
  await writeFile(
    path.join(screenshotDir, "ui-background-identity.json"),
    JSON.stringify(identity, null, 2),
  );
  await bridge.close();
});

test.afterAll(async () => {
  await context?.close();
});

async function open(surface: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${surface}.html`);
  await page.bringToFront();
  return page;
}

async function choose(page: Page, name: string, option: string) {
  await page.bringToFront();
  await page.getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("settings persist across real extension surfaces and import/export round-trip", async () => {
  const page = await open("options");
  await expect(
    page.getByRole("heading", { name: "General", exact: true }),
  ).toBeVisible();
  await choose(page, "Translate to", "Japanese");
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get("settings")).settings as Settings)
            .targetLanguage,
      ),
    )
    .toBe("ja");
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Translate to", exact: true }),
  ).toHaveText("Japanese");

  await page
    .getByRole("button", { name: "Translation controls", exact: true })
    .click();
  const hover = page.getByRole("switch", {
    name: "Translate on hover",
    exact: true,
  });
  await expect(hover).toHaveAttribute("aria-checked", "false");
  await hover.click();
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get("settings")).settings as Settings)
            .hoverEnabled,
      ),
    )
    .toBe(true);

  await page
    .getByRole("button", { name: "Website rules", exact: true })
    .click();
  await page.getByLabel("Website hostname").fill("example.com");
  await page.getByRole("button", { name: "Add website", exact: true }).click();
  await expect(page.getByText("example.com", { exact: true })).toBeVisible();
  await page
    .getByLabel("Website hostname")
    .fill("https://invalid.example/path");
  await page.getByRole("button", { name: "Add website", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Enter a hostname");
  await page
    .getByRole("button", {
      name: "Edit website rule: example.com",
      exact: true,
    })
    .click();
  await page.getByLabel("Translate selector", { exact: true }).fill("[");
  await page.getByRole("button", { name: "Save rule", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Enter a valid CSS selector.",
  );
  await page
    .getByLabel("Translate selector", { exact: true })
    .fill("article p");
  await page
    .getByLabel("Exclude selector", { exact: true })
    .fill(".advertisement");
  await choose(page, "Preference", "Never translate");
  await page.getByRole("button", { name: "Save rule", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get("settings")).settings as Settings)
            .siteRules[0]?.selector,
      ),
    )
    .toBe("article p");

  await page.getByRole("button", { name: "Glossary", exact: true }).click();
  await page.getByLabel("Original term", { exact: true }).fill("Yaku");
  await page.getByLabel("Translation", { exact: true }).fill("Yaku");
  await page.getByRole("button", { name: "Add term", exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get("settings")).settings as Settings)
            .glossary.Yaku,
      ),
    )
    .toBe("Yaku");

  await page.getByRole("button", { name: "General", exact: true }).click();
  const invalidImport = {
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"fontSize": "huge"}'),
  };
  await page
    .getByLabel("Import settings", { exact: true })
    .setInputFiles(invalidImport);
  await expect(page.getByRole("alert")).toContainText("does not contain valid");
  const settings = await page.evaluate(
    async () =>
      (await chrome.storage.local.get("settings")).settings as Settings,
  );
  await page.getByLabel("Import settings", { exact: true }).setInputFiles({
    name: "settings.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...settings, targetLanguage: "fr" })),
  });
  await expect(
    page.getByText("Settings imported.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Translate to", exact: true }),
  ).toHaveText("French");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export settings", exact: true })
    .click();
  const download = await downloadPromise;
  const filename = await download.path();
  expect(filename).not.toBeNull();
  const exported = JSON.parse(await readFile(filename!, "utf8"));
  expect(exported.targetLanguage).toBe("fr");
  expect(exported.siteRules).toEqual([
    {
      hostname: "example.com",
      action: "never",
      selector: "article p",
      excludeSelector: ".advertisement",
    },
  ]);
  expect(exported.glossary.Yaku).toBe("Yaku");
  await page.screenshot({
    path: path.join(screenshotDir, "settings-light.png"),
    fullPage: true,
  });
  await choose(page, "Appearance", "Dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: path.join(screenshotDir, "settings-dark.png"),
    fullPage: true,
  });
  const darkPopup = await open("popup");
  await darkPopup.setViewportSize({ width: 360, height: 550 });
  await expect(
    darkPopup.getByRole("combobox", { name: "Translate to", exact: true }),
  ).toHaveText("French");
  await darkPopup.screenshot({
    path: path.join(screenshotDir, "popup-dark.png"),
    fullPage: true,
  });
  await darkPopup.close();
  const darkWorkspace = await open("workspace");
  await darkWorkspace.screenshot({
    path: path.join(screenshotDir, "workspace-dark.png"),
    fullPage: true,
  });
  await darkWorkspace.close();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.join(screenshotDir, "settings-narrow.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1180, height: 860 });
  await choose(page, "Appearance", "Light");
  await page
    .getByRole("button", { name: "Keyboard shortcuts", exact: true })
    .click();
  await expect(
    page.getByText("Translate or restore the page", { exact: true }),
  ).toBeVisible();
  const shortcutsTabPromise = context.waitForEvent("page");
  await page
    .getByRole("button", { name: "Change keyboard shortcuts", exact: true })
    .click();
  const shortcutsTab = await shortcutsTabPromise;
  await expect
    .poll(() => shortcutsTab.url())
    .toContain("chrome://extensions/shortcuts");
  await shortcutsTab.close();
  await page.bringToFront();
  await page.getByRole("button", { name: "General", exact: true }).click();
  await page
    .getByRole("button", { name: "Reset settings", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Translate to", exact: true }),
  ).toHaveText("Chinese");
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get("settings")).settings as Settings)
            .siteRules.length,
      ),
    )
    .toBe(0);
  expect(
    await page.evaluate(
      async () =>
        ((await chrome.storage.local.get("settings")).settings as Settings)
          .glossary,
    ),
  ).toEqual({});
  await page.close();
});

test("popup and workspace remain usable with keyboard, narrow layouts and reduced motion", async () => {
  const popup = await open("popup");
  await popup.setViewportSize({ width: 360, height: 550 });
  await expect(
    popup.getByRole("button", { name: "Translate this page", exact: true }),
  ).toBeVisible();
  const language = popup.getByRole("combobox", {
    name: "Translate to",
    exact: true,
  });
  await language.focus();
  await popup.keyboard.press("Enter");
  await expect(popup.getByRole("listbox")).toBeVisible();
  await popup.keyboard.press("Escape");
  await expect(language).toBeFocused();
  await popup.screenshot({
    path: path.join(screenshotDir, "popup-light.png"),
    fullPage: true,
  });
  await expect
    .poll(async () =>
      popup.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await popup.close();

  const workspace = await open("workspace");
  await expect(
    workspace.getByRole("button", { name: "Translate", exact: true }),
  ).toBeDisabled();
  await workspace
    .getByRole("textbox", { name: "Original text", exact: true })
    .fill("A sentence waiting to be translated.");
  await expect(
    workspace.getByRole("button", { name: "Translate", exact: true }),
  ).toBeEnabled();
  await workspace
    .getByRole("button", { name: "Clear text", exact: true })
    .click();
  await expect(
    workspace.getByRole("textbox", { name: "Original text", exact: true }),
  ).toHaveValue("");
  await workspace.screenshot({
    path: path.join(screenshotDir, "workspace-light.png"),
    fullPage: true,
  });
  await workspace.getByRole("button", { name: "Writing", exact: true }).click();
  await expect(
    workspace.getByRole("heading", { name: "Rewritten text", exact: true }),
  ).toBeVisible();
  await choose(workspace, "Writing style", "Make polite");
  await workspace
    .getByRole("textbox", { name: "Original text", exact: true })
    .fill("give me the book");
  await expect(
    workspace.getByRole("button", { name: "Rewrite", exact: true }),
  ).toBeEnabled();
  await expect(
    workspace.getByRole("button", { name: "Choose a file", exact: true }),
  ).toHaveCount(0);
  await workspace.screenshot({
    path: path.join(screenshotDir, "writing-light.png"),
    fullPage: true,
  });
  await workspace
    .getByRole("button", { name: "Document", exact: true })
    .click();
  await workspace.getByLabel("Choose a file", { exact: true }).setInputFiles({
    name: "reading.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# A quiet afternoon"),
  });
  await expect(
    workspace.getByText("reading.md", { exact: true }),
  ).toBeVisible();
  await expect(
    workspace.getByRole("button", { name: "Translate", exact: true }),
  ).toBeEnabled();
  await workspace.setViewportSize({ width: 390, height: 844 });
  await workspace.emulateMedia({ reducedMotion: "reduce" });
  await workspace.screenshot({
    path: path.join(screenshotDir, "workspace-narrow.png"),
    fullPage: true,
  });
  expect(
    await workspace.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    workspace.getByRole("button", { name: "Translate", exact: true }),
  ).toBeInViewport();
  await workspace.close();
});

test("popup Restore remains actionable in controlled busy states while new Translate stays disabled", async () => {
  const settings = await open("options");
  const previous = await settings.evaluate(
    async () => (await chrome.storage.session.get("modelStatus")).modelStatus,
  );
  const fixtureTabId = await settings.evaluate(async () => {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id === undefined)
      throw new Error("The fixture tab has no browser tab identity.");
    return tab.id;
  });
  const popup = await context.newPage();
  await popup.addInitScript((tabId) => {
    const actions: string[] = [];
    let translated = true;
    Object.defineProperty(globalThis, "uiFixtureActions", { value: actions });
    Object.defineProperty(chrome.tabs, "query", {
      value: async () => [{ id: tabId }],
    });
    Object.defineProperty(chrome.tabs, "sendMessage", {
      value: async (_id: number, message: { action: string }) => {
        if (message.action === "page-state")
          return { ok: true, value: translated };
        actions.push(message.action);
        if (message.action === "restore-page") translated = false;
        return { ok: true, value: undefined };
      },
    });
  }, fixtureTabId);
  try {
    await settings.evaluate(() =>
      chrome.storage.session.set({ modelStatus: { phase: "translating" } }),
    );
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.bringToFront();
    const restore = popup.getByRole("button", {
      name: "Show original",
      exact: true,
    });
    for (const phase of ["downloading", "loading", "translating"]) {
      await popup.evaluate(
        (value) =>
          chrome.storage.session.set({ modelStatus: { phase: value } }),
        phase,
      );
      await expect(restore).toBeEnabled();
    }
    await restore.click();
    expect(
      await popup.evaluate(
        () =>
          (globalThis as unknown as { uiFixtureActions: string[] })
            .uiFixtureActions,
      ),
    ).toEqual(["restore-page"]);
    await expect(
      popup.getByRole("button", { name: "Translate this page", exact: true }),
    ).toBeDisabled();
  } finally {
    await settings.evaluate(async (value) => {
      if (value === undefined)
        await chrome.storage.session.remove("modelStatus");
      else await chrome.storage.session.set({ modelStatus: value });
    }, previous);
    await popup.close();
    await settings.close();
  }
});

test("TXT and SRT translate and export through the real cached local model", async () => {
  test.skip(
    !process.env.YAKU_MODEL_PROFILE,
    "Requires an explicitly supplied profile with the real local model cache.",
  );
  test.setTimeout(300_000);
  const page = await open("workspace");
  const cache = await page.evaluate(async () =>
    chrome.runtime.sendMessage({
      destination: "background",
      action: "cache-info",
    }),
  );
  expect(cache.ok).toBe(true);
  expect(cache.value.complete).toBe(true);
  await choose(page, "Translate to", "Chinese");
  const cases = [
    {
      mode: "Document",
      name: "reading.txt",
      text: "Hello.",
      mime: "text/plain",
    },
    {
      mode: "Subtitles",
      name: "captions.srt",
      text: "1\n00:00:01,000 --> 00:00:02,000\nHello.\n\n2\n00:00:03,000 --> 00:00:04,000\nThank you.\n",
      mime: "text/plain",
    },
  ];
  for (const item of cases) {
    await page.getByRole("button", { name: item.mode, exact: true }).click();
    await page.getByLabel("Choose a file", { exact: true }).setInputFiles({
      name: item.name,
      mimeType: item.mime,
      buffer: Buffer.from(item.text),
    });
    await page.getByRole("button", { name: "Translate", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Download translation", exact: true }),
    ).toBeVisible({ timeout: 240_000 });
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download translation", exact: true })
      .click();
    const download = await pending;
    const filename = await download.path();
    const text = await readFile(filename!, "utf8");
    expect(text).toMatch(/[\u3400-\u9fff]/);
    expect(text).toContain("Hello.");
    if (item.mode === "Subtitles") {
      expect(text).toContain("00:00:01,000 --> 00:00:02,000");
      expect(text).toContain("00:00:03,000 --> 00:00:04,000");
      expect(text).toContain("Thank you.");
    }
    await download.saveAs(
      path.join(screenshotDir, download.suggestedFilename()),
    );
    await page.screenshot({
      path: path.join(
        screenshotDir,
        `${item.mode.toLowerCase()}-real-model.png`,
      ),
      fullPage: true,
    });
  }
  await page.close();
});

test("in-page controls support keyboard movement, persistence and selection dismissal", async () => {
  await context.route("https://yaku-ui.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="en"><head><title>Reading fixture</title></head><body><main style="max-width:640px;margin:80px auto;font:20px/1.8 system-ui"><h1>Reading fixture</h1><p id="sample">A small page for checking the translation controls.</p></main></body></html>',
    }),
  );
  const page = await context.newPage();
  await page.goto("https://yaku-ui.test/reading");
  const host = page.locator('[data-yaku-floating="true"]');
  const move = host.getByRole("button", { name: "Move control", exact: true });
  await expect(move).toBeVisible();
  const before = await host.boundingBox();
  const lightSurface = await host.evaluate(
    (element) =>
      getComputedStyle(element.shadowRoot!.querySelector(".control")!)
        .backgroundColor,
  );
  await move.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(async () => Math.round((await host.boundingBox())!.x))
    .toBe(Math.round(before!.x - 10));
  const options = await open("options");
  await expect
    .poll(async () =>
      options.evaluate(async () => {
        const value = (
          await chrome.storage.local.get("floatingControlPosition")
        ).floatingControlPosition as { x: number; y: number } | undefined;
        return value?.x;
      }),
    )
    .toBeCloseTo(before!.x - 10, 0);
  await page.reload();
  await expect(move).toBeVisible();
  await expect
    .poll(async () => Math.round((await host.boundingBox())!.x))
    .toBe(Math.round(before!.x - 10));
  await page.locator("#sample").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.screenshot({
    path: path.join(screenshotDir, "in-page-selection-light.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await options
    .getByRole("button", { name: "Translation controls", exact: true })
    .click();
  await options
    .getByRole("switch", { name: "Floating page control", exact: true })
    .click();
  await expect(host).toBeHidden();
  await options
    .getByRole("switch", { name: "Floating page control", exact: true })
    .click();
  await expect(host).toBeVisible();
  await options.getByRole("button", { name: "General", exact: true }).click();
  await choose(options, "Appearance", "Dark");
  await expect(host).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(() =>
      host.evaluate(
        (element) =>
          getComputedStyle(element.shadowRoot!.querySelector(".control")!)
            .backgroundColor,
      ),
    )
    .not.toBe(lightSurface);
  await page.screenshot({
    path: path.join(screenshotDir, "in-page-dark.png"),
    fullPage: true,
  });
  await choose(options, "Appearance", "Light");
  await options
    .getByRole("button", { name: "Translation controls", exact: true })
    .click();
  await options
    .getByRole("switch", { name: "Floating page control", exact: true })
    .click();
  await expect(host).toBeHidden();
  await options.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "https://yaku-ui.test/*" });
    if (!tab?.id) throw new Error("The reading fixture tab is missing.");
    await chrome.tabs.sendMessage(
      tab.id,
      {
        destination: "content",
        action: "show-error",
        payload: "The translation could not be completed.",
      },
      { frameId: 0 },
    );
  });
  await expect(host.getByRole("alert")).toContainText(
    "The translation could not be completed.",
  );
  await expect(host.locator(".control")).toBeHidden();
  await host.getByRole("button", { name: "Close", exact: true }).click();
  await expect(host).toBeHidden();
  await options
    .getByRole("switch", { name: "Floating page control", exact: true })
    .click();
  await options.close();
  await page.close();
});

test("browser sync round-trips chunked Unicode preferences and applies real storage events", async () => {
  const page = await open("options");
  const toggle = page.getByRole("switch", {
    name: "Sync preferences with Chrome",
    exact: true,
  });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(
    page.getByText("Preferences saved for browser sync.", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  const settings = await page.evaluate(
    async () =>
      (await chrome.storage.local.get("settings")).settings as Settings,
  );
  const large: Settings = {
    ...settings,
    glossary: { sample: "世界".repeat(3000) },
    translationPosition: "before",
    fontFamily: "serif",
    textColor: "#244466",
    alwaysSourceLanguages: ["en"],
    neverSourceLanguages: ["ja"],
    temporaryDomainMinutes: 15,
    glossaries: [
      {
        id: "sync-library",
        name: "Synced terminology",
        targetLanguage: "fr",
        urlPatterns: ["https://example.com/docs/*"],
        terms: { reader: "lecteur" },
      },
    ],
  };
  await page.getByLabel("Import settings", { exact: true }).setInputFiles({
    name: "unicode-settings.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(large)),
  });
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const values = await chrome.storage.sync.get(null);
          return Object.keys(values).filter((key) =>
            key.startsWith("yaku.preferences.v1.chunk."),
          ).length;
        }),
      { timeout: 15000 },
    )
    .toBeGreaterThan(1);
  const synced = await page.evaluate(async () => {
    const values = await chrome.storage.sync.get(null);
    const manifest = values["yaku.preferences.v1.manifest"] as {
      revision: string;
      count: number;
    };
    let encoded = "";
    for (let index = 0; index < manifest.count; index++) {
      const chunk = values[`yaku.preferences.v1.chunk.${index}`] as {
        revision: string;
        data: string;
      };
      if (chunk.revision !== manifest.revision)
        throw new Error("Mismatched sync revision");
      encoded += chunk.data;
    }
    return JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)),
      ),
    ) as Settings;
  });
  expect(synced.glossary.sample).toBe("世界".repeat(3000));
  expect(synced).toMatchObject({
    translationPosition: "before",
    fontFamily: "serif",
    textColor: "#244466",
    alwaysSourceLanguages: ["en"],
    neverSourceLanguages: ["ja"],
    temporaryDomainMinutes: 15,
    glossaries: large.glossaries,
  });
  expect(synced).not.toHaveProperty("syncPreferences");
  await page.evaluate(
    (update) => chrome.storage.sync.set(update),
    encodeSyncedSettings(
      {
        ...large,
        targetLanguage: "fr",
        fontFamily: "monospace",
        glossaries: [{ ...large.glossaries[0]!, name: "Remote terminology" }],
      },
      "browser-roundtrip",
    ),
  );
  await expect(
    page.getByRole("combobox", { name: "Translate to", exact: true }),
  ).toHaveText("French");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get("settings")).settings as Settings)
            .fontFamily,
      ),
    )
    .toBe("monospace");
  expect(
    await page.evaluate(
      async () =>
        ((await chrome.storage.local.get("settings")).settings as Settings)
          .glossaries[0]?.name,
    ),
  ).toBe("Remote terminology");
  await page.screenshot({
    path: path.join(screenshotDir, "browser-sync.png"),
    fullPage: true,
  });
  await toggle.click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get("settings")).settings as Settings)
            .syncPreferences,
      ),
    )
    .toBe(false);
  await page.evaluate(async (prefix) => {
    const values = await chrome.storage.sync.get(null);
    await chrome.storage.sync.remove(
      Object.keys(values).filter((key) => key.startsWith(prefix)),
    );
  }, syncPrefix);
  await page
    .getByRole("button", { name: "Reset settings", exact: true })
    .click();
  await page.close();
});

test("glossary CSV imports and exports quoted Unicode records without partial duplicate writes", async () => {
  const page = await open("options");
  await page.getByRole("button", { name: "Glossary", exact: true }).click();
  const csv =
    '\uFEFFsource,translation\r\n"term, one","译文, 一"\r\n"quoted ""name""","两行\n译文"\r\n';
  const upload = {
    name: "glossary.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  };
  await page.getByLabel("Import CSV", { exact: true }).setInputFiles(upload);
  await expect(
    page.getByText("CSV terms imported.", { exact: true }),
  ).toBeVisible();
  const expected = { "term, one": "译文, 一", 'quoted "name"': "两行\n译文" };
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get("settings")).settings as Settings)
            .glossary,
      ),
    )
    .toEqual(expected);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("yaku-glossary.csv");
  const text = await readFile((await download.path())!, "utf8");
  expect(text.startsWith("\uFEFFsource,translation\r\n")).toBe(true);
  expect(text).toContain('"term, one","译文, 一"');
  expect(text).toContain('"quoted ""name""","两行\n译文"');
  await page.getByLabel("Import CSV", { exact: true }).setInputFiles(upload);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(
    await page.evaluate(
      async () =>
        ((await chrome.storage.local.get("settings")).settings as Settings)
          .glossary,
    ),
  ).toEqual(expected);
  await page.getByLabel("Import CSV", { exact: true }).setInputFiles({
    name: "update.csv",
    mimeType: "text/csv",
    buffer: Buffer.from('source,translation\n"term, one","更新后的译文"'),
  });
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get("settings")).settings as Settings)
            .glossary["term, one"],
      ),
    )
    .toBe("更新后的译文");
  await page.getByLabel("Import CSV", { exact: true }).setInputFiles({
    name: "conflict.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "source,translation\nnew term,new value\nconflict,one\nconflict,two",
    ),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Conflicting translations in CSV",
  );
  expect(
    await page.evaluate(
      async () =>
        ((await chrome.storage.local.get("settings")).settings as Settings)
          .glossary,
    ),
  ).toEqual({ ...expected, "term, one": "更新后的译文" });
  await page.getByLabel("Import CSV", { exact: true }).setInputFiles({
    name: "invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from('source,translation\n"not closed,value'),
  });
  await expect(page.getByRole("alert")).toContainText(
    "unclosed or misplaced quote",
  );
  await page.screenshot({
    path: path.join(screenshotDir, "glossary-csv.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "General", exact: true }).click();
  await page
    .getByRole("button", { name: "Reset settings", exact: true })
    .click();
  await page.close();
});

test("appearance controls persist and clear explicit typography and colors", async () => {
  const page = await open("options");
  await choose(page, "Translation position", "Before original");
  await page.getByText("Typography & colors", { exact: true }).click();
  await choose(page, "Translation font", "Serif");
  await choose(page, "Font weight", "Semibold");
  await choose(page, "Line spacing", "1.8");
  await choose(page, "Text color preset", "Ink");
  await choose(page, "Background color preset", "Soft yellow");
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get("settings")).settings as Settings)
            .backgroundColor,
      ),
    )
    .toBe("#fff3c2");
  const color = page.getByRole("textbox", { name: "Text color", exact: true });
  await color.fill("#244466");
  await color.press("Tab");
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get("settings")).settings as Settings)
            .textColor,
      ),
    )
    .toBe("#244466");
  await color.fill("red;display:none");
  await color.press("Tab");
  await expect(page.getByRole("alert")).toContainText("six-digit hex");
  expect(
    await page.evaluate(
      async () =>
        ((await chrome.storage.local.get("settings")).settings as Settings)
          .textColor,
    ),
  ).toBe("#244466");
  await page
    .getByRole("button", { name: "Use page color: Text color", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get("settings")).settings as Settings)
            .textColor,
      ),
    )
    .toBe("");
  await page.reload();
  await page.getByText("Typography & colors", { exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Translation position", exact: true }),
  ).toHaveText("Before original");
  await expect(
    page.getByRole("combobox", { name: "Translation font", exact: true }),
  ).toHaveText("Serif");
  await expect(
    page.getByRole("combobox", { name: "Font weight", exact: true }),
  ).toHaveText("Semibold");
  await page.screenshot({
    path: path.join(screenshotDir, "appearance-settings.png"),
    fullPage: true,
  });
  await page
    .getByRole("textbox", { name: "Background color", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(screenshotDir, "appearance-colors-light.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("textbox", { name: "Background color", exact: true })
    .scrollIntoViewIfNeeded();
  expect(
    await page
      .locator(".settings-main")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: path.join(screenshotDir, "appearance-narrow.png"),
  });
  await choose(page, "Appearance", "Dark");
  await page
    .getByRole("textbox", { name: "Background color", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(screenshotDir, "appearance-colors-dark.png"),
  });
  await page.setViewportSize({ width: 1180, height: 860 });
  await choose(page, "Translation font", "Use page font");
  await choose(page, "Font weight", "Use page weight");
  await choose(page, "Line spacing", "Use page spacing");
  await choose(page, "Background color preset", "Use page color");
  await page
    .getByRole("button", { name: "Reset settings", exact: true })
    .click();
  await page.close();
});

test("named glossaries retain independent term editors, CSV data and URL/language scopes", async () => {
  const page = await open("options");
  await page.getByRole("button", { name: "Glossary", exact: true }).click();
  await page.getByLabel("Original term", { exact: true }).fill("project");
  await page.getByLabel("Translation", { exact: true }).fill("全局");
  await page.getByRole("button", { name: "Add term", exact: true }).click();
  await page.getByRole("button", { name: "New glossary", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Documentation");
  await choose(page, "Glossary language", "Chinese");
  await page
    .getByLabel("Website URL patterns", { exact: true })
    .fill("not-a-url");
  await page
    .getByRole("button", { name: "Save glossary", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("valid URL pattern");
  await page
    .getByLabel("Website URL patterns", { exact: true })
    .fill("https://example.com/docs/*");
  await page
    .getByRole("button", { name: "Save glossary", exact: true })
    .click();
  await page.getByLabel("Original term", { exact: true }).fill("project");
  await page.getByLabel("Translation", { exact: true }).fill("项目");
  await page.getByRole("button", { name: "Add term", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit term: project", exact: true })
    .click();
  await page.getByLabel("Translation", { exact: true }).fill("文档项目");
  await page.getByRole("button", { name: "Save term", exact: true }).click();
  await page.getByLabel("Import CSV", { exact: true }).setInputFiles({
    name: "scoped.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("source,translation\nreader,读者"),
  });
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get("settings")).settings as Settings)
            .glossaries[0]?.terms.reader,
      ),
    )
    .toBe("读者");
  const snapshot = await page.evaluate(
    async () =>
      (await chrome.storage.local.get("settings")).settings as Settings,
  );
  expect(snapshot.glossary).toEqual({ project: "全局" });
  expect(snapshot.glossaries[0]).toMatchObject({
    name: "Documentation",
    targetLanguage: "zh",
    urlPatterns: ["https://example.com/docs/*"],
    terms: { project: "文档项目", reader: "读者" },
  });
  await page
    .getByRole("button", { name: "Edit glossary", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Japanese documentation");
  await choose(page, "Glossary language", "Japanese");
  await page
    .getByRole("button", { name: "Save glossary", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Glossary", exact: true }),
  ).toHaveText("Japanese documentation");
  await page.screenshot({
    path: path.join(screenshotDir, "scoped-glossary.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Edit glossary", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .locator(".settings-main")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: path.join(screenshotDir, "scoped-glossary-narrow.png"),
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 1180, height: 860 });
  await choose(page, "Glossary", "General glossary");
  await expect(page.getByText("全局", { exact: true })).toBeVisible();
  await expect(page.getByText("读者", { exact: true })).toHaveCount(0);
  await choose(page, "Glossary", "Japanese documentation");
  await page
    .getByRole("button", { name: "Delete glossary", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Glossary", exact: true }),
  ).toHaveText("General glossary");
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get("settings")).settings as Settings)
            .glossaries.length,
      ),
    )
    .toBe(0);
  await page.getByRole("button", { name: "General", exact: true }).click();
  await page
    .getByRole("button", { name: "Reset settings", exact: true })
    .click();
  await page.close();
});

test("source-language rules and temporary website duration persist, export and reset", async () => {
  const page = await open("options");
  await choose(page, "Always translate", "English");
  await page
    .getByRole("button", {
      name: "Add language: Always translate",
      exact: true,
    })
    .click();
  await choose(page, "Never translate", "English");
  await page
    .getByRole("button", { name: "Add language: Never translate", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Never translate", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "Traditional Chinese", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("option", { name: "Chinese", exact: true }).click();
  await page
    .getByRole("button", { name: "Add language: Never translate", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get("settings")).settings as Settings)
            .neverSourceLanguages,
      ),
    )
    .toEqual(["en", "zh"]);
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Remove language: English · Always translate",
      exact: true,
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("combobox", { name: "Never translate", exact: true })
    .scrollIntoViewIfNeeded();
  expect(
    await page
      .locator(".settings-main")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: path.join(screenshotDir, "language-policy-narrow.png"),
  });
  await page.setViewportSize({ width: 1180, height: 860 });
  await page
    .getByRole("button", { name: "Website rules", exact: true })
    .click();
  await choose(page, "Temporary website translation", "15 minutes");
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get("settings")).settings as Settings)
            .temporaryDomainMinutes,
      ),
    )
    .toBe(15);
  await page.reload();
  await page
    .getByRole("button", { name: "Website rules", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", {
      name: "Temporary website translation",
      exact: true,
    }),
  ).toHaveText("15 minutes");
  await page.screenshot({
    path: path.join(screenshotDir, "temporary-domain-settings.png"),
  });
  await page.getByRole("button", { name: "General", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export settings", exact: true })
    .click();
  const download = await pending;
  const exported = JSON.parse(
    await readFile((await download.path())!, "utf8"),
  ) as Settings;
  expect(exported).toMatchObject({
    alwaysSourceLanguages: ["en"],
    neverSourceLanguages: ["en", "zh"],
    temporaryDomainMinutes: 15,
  });
  await page
    .getByRole("button", {
      name: "Remove language: English · Always translate",
      exact: true,
    })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get("settings")).settings as Settings)
            .alwaysSourceLanguages,
      ),
    )
    .toEqual([]);
  await page
    .getByRole("button", { name: "Reset settings", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await chrome.storage.local.get("settings")).settings as Settings,
      ),
    )
    .toMatchObject({
      alwaysSourceLanguages: [],
      neverSourceLanguages: [],
      temporaryDomainMinutes: 0,
    });
  await page.close();
});

test("writing styles and selected-text explanation use the real local model", async () => {
  test.skip(
    !process.env.YAKU_MODEL_PROFILE,
    "Requires an explicitly supplied profile with the real local model cache.",
  );
  test.setTimeout(300_000);
  const page = await open("workspace");
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await choose(page, "Output language", "English");
  const samples = [
    { style: "Correct grammar", source: "She go to school yesterday." },
    { style: "Make polite", source: "Give me the report now." },
  ];
  const observed: Record<string, string> = {};
  for (const sample of samples) {
    await choose(page, "Writing style", sample.style);
    await page
      .getByRole("textbox", { name: "Original text", exact: true })
      .fill(sample.source);
    await page.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect
      .poll(() => page.locator(".editor-result").innerText(), {
        timeout: 180000,
      })
      .not.toBe("");
    await expect(
      page.getByRole("button", { name: "Rewrite", exact: true }),
    ).toBeVisible({ timeout: 180000 });
    const result = await page.locator(".editor-result").innerText();
    expect(result).not.toBe(sample.source);
    expect(result.length).toBeGreaterThan(5);
    if (sample.style === "Correct grammar")
      expect(result).toMatch(/went|gone/iu);
    else expect(result).toMatch(/please|could|would|kindly/iu);
    observed[sample.style] = result;
    await page.screenshot({
      path: path.join(
        screenshotDir,
        `writing-${sample.style === "Correct grammar" ? "grammar" : "polite"}-real-model.png`,
      ),
      fullPage: true,
    });
  }
  await page.close();
  await context.route("https://yaku-explain.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="en"><head><title>Phrase fixture</title></head><body><main style="max-width:640px;margin:80px auto;font:20px/1.8 system-ui"><p>The committee decided to <span id="phrase">break the ice</span> before the meeting.</p></main></body></html>',
    }),
  );
  const reading = await context.newPage();
  await reading.goto("https://yaku-explain.test/reading");
  await expect(reading.locator('[data-yaku-floating="true"]')).toBeVisible();
  await reading.locator("#phrase").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  const cdp = await context.newCDPSession(reading);
  const tree = await cdp.send("Accessibility.getFullAXTree");
  const explain = tree.nodes.find(
    (node) => node.role?.value === "button" && node.name?.value === "Explain",
  );
  expect(explain?.backendDOMNodeId).toBeDefined();
  const box = await cdp.send("DOM.getBoxModel", {
    backendNodeId: explain!.backendDOMNodeId,
  });
  await reading.mouse.click(
    (box.model.content[0]! + box.model.content[2]!) / 2,
    (box.model.content[1]! + box.model.content[5]!) / 2,
  );
  async function explanation() {
    const current = await cdp.send("Accessibility.getFullAXTree");
    const region = current.nodes.find(
      (node) =>
        node.role?.value === "region" && node.name?.value === "Translation",
    );
    if (!region?.backendDOMNodeId) return "";
    const resolved = await cdp.send("DOM.resolveNode", {
      backendNodeId: region.backendDOMNodeId,
    });
    const value = await cdp.send("Runtime.callFunctionOn", {
      objectId: resolved.object.objectId,
      functionDeclaration:
        'function(){return this.querySelector("p")?.textContent || ""}',
      returnByValue: true,
    });
    return String(value.result.value ?? "");
  }
  await expect
    .poll(explanation, { timeout: 180000 })
    .toMatch(/idiom|conversation|tension|awkward|comfortable/iu);
  observed.explanation = await explanation();
  await reading.screenshot({
    path: path.join(screenshotDir, "explanation-real-model.png"),
    fullPage: true,
  });
  await writeFile(
    path.join(screenshotDir, "writing-explanation-real-model.json"),
    JSON.stringify(observed, null, 2),
  );
  await reading.close();
});

test("password-protected PDF rejects wrong passwords and exports a real translated PDF after unlock", async () => {
  test.skip(
    !process.env.YAKU_MODEL_PROFILE,
    "Requires the actual local model cache.",
  );
  test.setTimeout(240000);
  const page = await open("workspace");
  await choose(page, "Translate to", "Chinese");
  await page.getByRole("button", { name: "Document", exact: true }).click();
  await page
    .getByLabel("Choose a file", { exact: true })
    .setInputFiles(path.resolve("tests/fixtures/reading-protected.pdf"));
  await page.getByRole("button", { name: "Translate", exact: true }).click();
  const password = page.getByLabel("PDF password", { exact: true });
  await expect(password).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Enter the password to open this PDF.",
  );
  await password.fill("wrong");
  await page.getByRole("button", { name: "Translate", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "That password did not open this PDF. Try again.",
  );
  await password.fill("yaku-test-only");
  await page.getByRole("button", { name: "Translate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Download reading PDF", exact: true }),
  ).toBeVisible({ timeout: 180000 });
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download reading PDF", exact: true })
    .click();
  const download = await pending;
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(2);
  expect(pdf.getPage(0).getSize()).toEqual({ width: 400, height: 300 });
  await download.saveAs(path.join(screenshotDir, "protected.translated.pdf"));
  const persisted = await page.evaluate(async () =>
    JSON.stringify(await chrome.storage.local.get(null)),
  );
  expect(persisted).not.toContain("yaku-test-only");
  await page.screenshot({
    path: path.join(screenshotDir, "password-pdf-real-model.png"),
    fullPage: true,
  });
  await page.close();
});
