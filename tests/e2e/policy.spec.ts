import { test, expect, chromium, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createDefaultSettings,
  type Settings,
} from "../../frontend/src/entities/settings";
import { verifyBackgroundSource } from "../../scripts/experiments/background-identity.mjs";

const english =
  "The community library provides a quiet place for people to read, learn and share ideas. Every morning the librarian opens the doors and welcomes visitors from the neighborhood. Students use the reading room to prepare their assignments, while other readers choose books about history, science and the natural world. Volunteers organize the shelves and help visitors find the information they need. In the afternoon a small group meets to discuss a novel and exchange thoughtful opinions about its characters. The library also offers practical workshops about gardening, cooking and writing. These activities encourage people to work together and learn from one another. At the end of the day the staff carefully returns each book to its proper place and prepares the library for tomorrow.";

test("real content/background route source-language policy and fixed-expiry host grants without model inference", async () => {
  test.setTimeout(90_000);
  const profile = await mkdtemp(path.join(tmpdir(), "yaku-policy-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chrome",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging", "--remote-debugging-port=0"],
  });
  const output = path.resolve(".workspace/qa");
  await mkdir(output, { recursive: true });
  const modelRequests: string[] = [];
  context.on("request", (request) => {
    if (/huggingface\.co|hf\.co|hf\.space|xethub\.hf\.co/.test(request.url()))
      modelRequests.push(request.url());
  });
  const nonce = crypto.randomUUID();
  const evidence: Record<string, unknown> = {
    scope:
      "Policy routing only; every fixture text block has translate=no. No translation-quality claim.",
    usesModelStubs: false,
  };
  try {
    const cdp = await context.browser()!.newBrowserCDPSession();
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: path.resolve(".output/chrome-mv3"),
    });
    const bridge = await context.newPage();
    await bridge.goto(`chrome-extension://${id}/options.html`);
    evidence.backgroundIdentity = await verifyBackgroundSource(
      profile,
      id,
      path.resolve(".output/chrome-mv3/background.js"),
    );
    const busyPhases = await bridge.evaluate(async () => {
      const phases: string[] = [];
      const state = globalThis as unknown as { policyBusyPhases: string[] };
      state.policyBusyPhases = phases;
      chrome.storage.onChanged.addListener((changes, area) => {
        const value = changes.modelStatus?.newValue as
          { phase?: unknown } | undefined;
        if (area === "session" && typeof value?.phase === "string")
          phases.push(value.phase);
      });
      return phases;
    });
    evidence.initialBusyPhases = busyPhases;
    const cache = () =>
      bridge.evaluate(() =>
        chrome.runtime.sendMessage({
          destination: "background",
          action: "cache-info",
        }),
      );
    const initialCache = await cache();
    expect(initialCache.ok).toBe(true);
    expect(initialCache.value).toMatchObject({ bytes: 0, complete: false });
    await context.route("https://*.policy.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="en"><head><title>Policy fixture</title></head><body translate="no"><main><p>${english}</p></main></body></html>`,
      }),
    );
    async function settings(patch: Partial<Settings>) {
      await bridge.evaluate(
        (value) => chrome.storage.local.set({ settings: value }),
        { ...createDefaultSettings(), ...patch },
      );
    }
    async function fixture(hostname: string, name: string) {
      const page = await context.newPage();
      await page.goto(`https://${hostname}.policy.test/${name}?run=${nonce}`);
      await expect(page.locator('[data-yaku-floating="true"]')).toBeAttached();
      return page;
    }
    async function tabId(page: Page) {
      return bridge.evaluate(async (url) => {
        const tabs = await chrome.tabs.query({ url });
        if (tabs.length !== 1 || tabs[0]?.id === undefined)
          throw new Error("The unique policy fixture tab was not found.");
        return tabs[0].id;
      }, page.url());
    }
    async function content(page: Page, action: string) {
      return bridge.evaluate(
        ({ tabId, action }) =>
          chrome.tabs.sendMessage(
            tabId,
            { destination: "content", action },
            { frameId: 0 },
          ),
        { tabId: await tabId(page), action },
      );
    }
    async function state(page: Page) {
      const reply = await content(page, "page-state");
      expect(reply.ok).toBe(true);
      return Boolean(reply.value);
    }
    async function inactive(page: Page) {
      // There is no public automatic-decision event. Observe absence repeatedly after listener readiness.
      const until = Date.now() + 700;
      do {
        expect(await state(page)).toBe(false);
        await page.waitForTimeout(70);
      } while (Date.now() < until);
    }
    async function grant(page: Page) {
      const key = `temporaryTranslation:${new URL(page.url()).hostname}`;
      return bridge.evaluate(
        async (key) =>
          (await chrome.storage.local.get(key))[key] as
            { hostname: string; expiresAt: number } | undefined,
        key,
      );
    }
    await settings({ temporaryDomainMinutes: 5 });
    const manual = await fixture("temporary", "manual");
    await inactive(manual);
    const before = Date.now();
    expect((await content(manual, "translate-page")).ok).toBe(true);
    expect(await state(manual)).toBe(true);
    const first = await grant(manual);
    expect(first).toBeDefined();
    expect(first!.hostname).toBe("temporary.policy.test");
    expect(first!.expiresAt).toBeGreaterThanOrEqual(before + 300_000);
    expect(first!.expiresAt).toBeLessThanOrEqual(Date.now() + 300_000);
    await content(manual, "translate-page");
    expect((await grant(manual))!.expiresAt).toBe(first!.expiresAt);
    evidence.fixedGrant = first;
    const same = await fixture("temporary", "same-host");
    await expect.poll(() => state(same)).toBe(true);
    const sibling = await fixture("sibling", "separate-host");
    await inactive(sibling);
    await manual.bringToFront();
    await bridge.evaluate(() => chrome.action.openPopup());
    // Native action popups are exposed as CDP page targets, outside the launching Playwright context's pages.
    const port = (
      await readFile(path.join(profile, "DevToolsActivePort"), "utf8")
    )
      .trim()
      .split("\n")[0]!;
    const popupConnection = await chromium.connectOverCDP(
      `http://127.0.0.1:${port}`,
    );
    const popup = popupConnection
      .contexts()
      .flatMap((context) => context.pages())
      .find((page) => page.url() === `chrome-extension://${id}/popup.html`);
    expect(popup).toBeDefined();
    await expect(popup!.getByText(/^Auto-translate until /)).toBeVisible();
    evidence.nativePopupExpiry = await popup!
      .getByText(/^Auto-translate until /)
      .textContent();
    await expect(
      popup!.getByRole("button", { name: "Stop", exact: true }),
    ).toBeVisible();
    await popup!.screenshot({ path: path.join(output, "popup-temporary.png") });
    await popup!.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(popup!.getByText(/^Auto-translate until /)).toHaveCount(0);
    expect(await grant(manual)).toBeUndefined();
    expect(await state(manual)).toBe(true);
    await popup!.close();
    expect((await content(manual, "translate-page")).ok).toBe(true);
    await bridge.evaluate(
      ({ hostname }) =>
        chrome.storage.local.set({
          [`temporaryTranslation:${hostname}`]: {
            hostname,
            expiresAt: Date.now() - 1,
          },
        }),
      { hostname: "temporary.policy.test" },
    );
    const expired = await fixture("temporary", "expired");
    await inactive(expired);
    expect((await grant(expired))!.expiresAt).toBeLessThan(Date.now());
    await settings({ alwaysSourceLanguages: ["en"] });
    const always = await fixture("language", "always");
    const detection = await bridge.evaluate(
      (value) => chrome.i18n.detectLanguage(value),
      english,
    );
    expect(detection.isReliable).toBe(true);
    expect(detection.languages).toEqual([{ language: "en", percentage: 100 }]);
    evidence.nativeDetection = detection;
    await expect.poll(() => state(always)).toBe(true);
    await settings({
      alwaysSourceLanguages: ["en"],
      neverSourceLanguages: ["en"],
    });
    const never = await fixture("language", "never-overlap");
    await inactive(never);
    await settings({
      alwaysSourceLanguages: ["en"],
      siteRules: [{ hostname: "blocked.policy.test", action: "never" }],
    });
    const blocked = await fixture("blocked", "never-site");
    await inactive(blocked);
    const finalCache = await cache();
    expect(finalCache.ok).toBe(true);
    expect(finalCache.value).toMatchObject({ bytes: 0, complete: false });
    const phases = await bridge.evaluate(
      () =>
        (globalThis as unknown as { policyBusyPhases: string[] })
          .policyBusyPhases,
    );
    expect(
      phases.filter((phase) =>
        ["downloading", "loading", "translating"].includes(phase),
      ),
    ).toEqual([]);
    expect(modelRequests).toEqual([]);
    evidence.finalCache = finalCache.value;
    evidence.modelNetworkRequests = modelRequests;
    evidence.observedModelPhases = phases;
    evidence.routes = {
      sameHost: true,
      sibling: false,
      expired: false,
      alwaysEnglish: true,
      neverEnglishOverlap: false,
      neverSite: false,
    };
    await writeFile(
      path.join(output, "policy-routing.json"),
      JSON.stringify(evidence, null, 2),
    );
  } finally {
    await context.close();
  }
});
