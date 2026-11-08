import { test, expect, chromium, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDefaultSettings } from "../../frontend/src/entities/settings";
import { verifyBackgroundSource } from "../../scripts/experiments/background-identity.mjs";

interface ReadingFixture {
  editing: boolean;
  holdReads: boolean;
  holdWrites: boolean;
  failure?: string;
  writes: boolean[];
  releaseReads: () => void;
  releaseWrites: () => void;
}
async function fixture(
  page: Page,
  commands: {
    holdWrites?: boolean;
    failure?: string;
    release?: "reads" | "writes";
  },
) {
  await page.evaluate((commands) => {
    const state = (globalThis as unknown as { readingFixture: ReadingFixture })
      .readingFixture;
    const { release, ...values } = commands;
    Object.assign(state, values);
    if (release === "reads") state.releaseReads();
    if (release === "writes") state.releaseWrites();
  }, commands);
}

test("More reading controls expose authoritative temporary-editing state, pending/error feedback and keyboard dismissal", async () => {
  const profile = await mkdtemp(path.join(tmpdir(), "yaku-reading-ui-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chrome",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging", "--remote-debugging-port=0"],
    viewport: { width: 360, height: 520 },
  });
  try {
    const cdp = await context.browser()!.newBrowserCDPSession();
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: path.resolve(".output/chrome-mv3"),
    });
    const bridge = await context.newPage();
    await bridge.goto(`chrome-extension://${id}/options.html`);
    const identity = await verifyBackgroundSource(
      profile,
      id,
      path.resolve(".output/chrome-mv3/background.js"),
    );
    await bridge.evaluate(
      (value) => chrome.storage.local.set({ settings: value }),
      createDefaultSettings(),
    );
    const tabId = await bridge.evaluate(async () => {
      const tab = await chrome.tabs.getCurrent();
      if (tab?.id === undefined)
        throw new Error("The UI fixture has no tab identity.");
      return tab.id;
    });
    const page = await context.newPage();
    await page.addInitScript((tabId) => {
      let reads: (() => void)[] = [];
      let writes: (() => void)[] = [];
      const state: ReadingFixture = {
        editing: false,
        holdReads: true,
        holdWrites: false,
        writes: [],
        releaseReads() {
          state.holdReads = false;
          for (const resolve of reads) resolve();
          reads = [];
        },
        releaseWrites() {
          state.holdWrites = false;
          for (const resolve of writes) resolve();
          writes = [];
        },
      };
      Object.defineProperty(globalThis, "readingFixture", { value: state });
      Object.defineProperty(chrome.tabs, "query", {
        value: async () => [{ id: tabId }],
      });
      Object.defineProperty(chrome.tabs, "sendMessage", {
        value: async (
          _tab: number,
          message: { action: string; payload?: boolean },
        ) => {
          if (message.action === "page-state")
            return { ok: true, value: false };
          if (message.action === "page-editing-state") {
            if (state.holdReads)
              await new Promise<void>((resolve) => reads.push(resolve));
            return state.failure
              ? { ok: false, error: state.failure }
              : { ok: true, value: state.editing };
          }
          if (message.action === "set-page-editing") {
            state.writes.push(!!message.payload);
            if (state.holdWrites)
              await new Promise<void>((resolve) => writes.push(resolve));
            if (state.failure) return { ok: false, error: state.failure };
            state.editing = !!message.payload;
            return { ok: true, value: undefined };
          }
          throw new Error(`Unexpected UI fixture action: ${message.action}`);
        },
      });
    }, tabId);
    await page.goto(`chrome-extension://${id}/popup.html`);
    await page.bringToFront();
    const more = () =>
      page.getByRole("button", { name: /^More reading controls/ });
    await more().focus();
    await page.keyboard.press("Enter");
    const panel = page.getByRole("dialog", {
      name: "Reading controls",
      exact: true,
    });
    await expect(panel).toBeVisible();
    const editing = panel.getByRole("switch", {
      name: "Temporary editing",
      exact: true,
    });
    await expect(editing).toBeDisabled();
    await fixture(page, { release: "reads" });
    await expect(editing).toBeEnabled();
    await expect(editing).toHaveAttribute("aria-checked", "false");
    await fixture(page, { holdWrites: true });
    await editing.focus();
    await page.keyboard.press("Space");
    await expect(editing).toBeDisabled();
    await expect(editing).toHaveAttribute("aria-checked", "false");
    expect(
      await page.evaluate(
        () =>
          (globalThis as unknown as { readingFixture: ReadingFixture })
            .readingFixture.writes,
      ),
    ).toEqual([true]);
    await fixture(page, { release: "writes" });
    await expect(editing).toBeEnabled();
    await expect(editing).toHaveAttribute("aria-checked", "true");
    await expect(more()).toHaveAttribute("data-editing-active", "true");
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(more()).toBeFocused();
    await more().click();
    await expect(editing).toHaveAttribute("aria-checked", "true");
    await mkdir(".workspace/qa", { recursive: true });
    await page.screenshot({ path: ".workspace/qa/popup-reading-light.png" });
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
    expect(
      await bridge.evaluate(
        async () => (await chrome.storage.local.get("settings")).settings,
      ),
    ).toEqual(createDefaultSettings());
    await bridge.evaluate(
      (value) =>
        chrome.storage.local.set({ settings: { ...value, theme: "dark" } }),
      createDefaultSettings(),
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.screenshot({ path: ".workspace/qa/popup-reading-dark.png" });
    await panel.getByRole("button", { name: "Close", exact: true }).click();
    await expect(more()).toBeFocused();
    await fixture(page, {
      failure: "This page is unavailable for translation.",
    });
    await more().click();
    await expect(editing).toBeDisabled();
    await expect(panel.getByRole("alert")).toHaveText(
      "This page is unavailable for translation.",
    );
    await expect(page.getByRole("alert")).toHaveCount(1);
    await page.screenshot({ path: ".workspace/qa/popup-reading-error.png" });
    await panel.getByRole("button", { name: "Close", exact: true }).click();
    await fixture(page, { failure: undefined });
    await more().click();
    await expect(editing).toBeEnabled();
    await expect(editing).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await editing.focus();
    await page.keyboard.press("Space");
    await expect(editing).toHaveAttribute("aria-checked", "false");
    await expect(more()).not.toHaveAttribute("data-editing-active", "true");
    await writeFile(
      ".workspace/qa/popup-reading-ui.json",
      JSON.stringify(
        {
          identity,
          scope:
            "Controlled chrome.tabs UI fixture only; no claim of actual page editing or model inference.",
          checkedStateAuthoritative: true,
          pendingDisabled: true,
          escapeFocusReturn: true,
          localSettingsEditingFields: false,
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
  }
});
