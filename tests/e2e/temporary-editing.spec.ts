import { test, expect, chromium, type Page } from "@playwright/test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDefaultSettings } from "../../frontend/src/entities/settings";
import { verifyBackgroundSource } from "../../scripts/experiments/background-identity.mjs";

test("native popup editing state follows the document and newly attached frames without persistence", async () => {
  const realModel = Boolean(process.env.YAKU_MODEL_PROFILE);
  test.setTimeout(realModel ? 180_000 : 90_000);
  const profile =
    process.env.YAKU_MODEL_PROFILE ??
    (await mkdtemp(path.join(tmpdir(), "yaku-editing-session-")));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chrome",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging", "--remote-debugging-port=0"],
  });
  const output = path.resolve(".workspace/qa");
  await mkdir(output, { recursive: true });
  const evidence: Record<string, unknown> = {
    completed: false,
    usesModelStubs: false,
    realModel,
  };
  const errors: string[] = [];
  try {
    const browser = await context.browser()!.newBrowserCDPSession();
    const { id } = await browser.send("Extensions.loadUnpacked", {
      path: path.resolve(".output/chrome-mv3"),
    });
    const bridge = await context.newPage();
    await bridge.goto(`chrome-extension://${id}/options.html`);
    evidence.identity = await verifyBackgroundSource(
      profile,
      id,
      path.resolve(".output/chrome-mv3/background.js"),
    );
    await bridge.evaluate(
      (settings) => chrome.storage.local.set({ settings }),
      {
        ...createDefaultSettings(),
        sourceLanguage: "en",
        targetLanguage: "zh",
      },
    );
    const initialCache = await bridge.evaluate(() =>
      chrome.runtime.sendMessage({
        destination: "background",
        action: "cache-info",
      }),
    );
    expect(initialCache.value.complete).toBe(realModel);
    const nonce = crypto.randomUUID();
    await context.route(
      /^http:\/\/(?:top|child|late)\.editing\.test\//,
      (route) => {
        const url = new URL(route.request().url());
        return route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `<!doctype html><html><head><meta charset="utf-8"><title>Editing session fixture</title></head><body><main${realModel && url.hostname === "top.editing.test" ? "" : ' translate="no"'}><p id="source">Read the <a href="/guide">complete guide</a> and run <code>npm install</code>.</p></main>${url.hostname === "top.editing.test" ? `<iframe src="http://child.editing.test/initial?run=${nonce}"></iframe>` : ""}</body></html>`,
        });
      },
    );
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`http://top.editing.test/initial?run=${nonce}`);
    const tabId = await bridge.evaluate(
      async (url) =>
        (await chrome.tabs.query({})).find((tab) => tab.url === url)!.id!,
      page.url(),
    );
    const send = (action: string, payload?: unknown, frameId = 0) =>
      bridge.evaluate(
        ({ tabId, action, payload, frameId }) =>
          chrome.tabs.sendMessage(
            tabId,
            { destination: "content", action, payload },
            { frameId },
          ),
        { tabId, action, payload, frameId },
      );
    const state = async (frameId = 0): Promise<boolean | undefined> => {
      const reply = await send("page-editing-state", undefined, frameId);
      return reply?.ok ? (reply.value as boolean) : undefined;
    };
    const frameIds = () =>
      bridge.evaluate(
        async (tabId) =>
          (
            await chrome.scripting.executeScript({
              target: { tabId, allFrames: true },
              func: () => location.href,
            })
          ).map((frame) => ({ id: frame.frameId, url: frame.result })),
        tabId,
      );
    await expect.poll(() => state()).toBe(false);
    await expect.poll(async () => (await frameIds()).length).toBe(2);
    const child = (await frameIds()).find((frame) =>
      frame.url?.includes("child.editing.test"),
    )!.id;
    await expect.poll(() => state(child)).toBe(false);
    const port = (
      await readFile(path.join(profile, "DevToolsActivePort"), "utf8")
    )
      .trim()
      .split("\n")[0]!;
    async function popup(): Promise<Page> {
      await page.bringToFront();
      await bridge.evaluate(() => chrome.action.openPopup());
      const popupConnection = await chromium.connectOverCDP(
        `http://127.0.0.1:${port}`,
      );
      await expect
        .poll(() =>
          popupConnection
            .contexts()
            .flatMap((context) => context.pages())
            .some(
              (candidate) =>
                candidate.url() === `chrome-extension://${id}/popup.html`,
            ),
        )
        .toBe(true);
      return popupConnection
        .contexts()
        .flatMap((context) => context.pages())
        .find(
          (candidate) =>
            candidate.url() === `chrome-extension://${id}/popup.html`,
        )!;
    }
    let panel = await popup();
    await panel.getByRole("button", { name: /^More reading controls/ }).click();
    const toggle = panel.getByRole("switch", {
      name: "Temporary editing",
      exact: true,
    });
    await expect(toggle).toBeEnabled();
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect.poll(() => state()).toBe(true);
    await expect.poll(() => state(child)).toBe(true);
    await panel.screenshot({
      path: path.join(output, "temporary-editing-popup.png"),
    });
    await panel.close();

    const workers = await context.newCDPSession(bridge);
    const workerStates = new Map<
      string,
      { scriptURL: string; runningStatus: string }
    >();
    workers.on("ServiceWorker.workerVersionUpdated", (event) => {
      for (const version of event.versions)
        workerStates.set(version.versionId, version);
    });
    await workers.send("ServiceWorker.enable");
    await expect
      .poll(
        () =>
          [...workerStates].find(
            ([, version]) =>
              version.scriptURL === `chrome-extension://${id}/background.js` &&
              version.runningStatus === "running",
          )?.[0],
      )
      .toBeTruthy();
    const workerId = [...workerStates].find(
      ([, version]) =>
        version.scriptURL === `chrome-extension://${id}/background.js` &&
        version.runningStatus === "running",
    )![0];
    await workers.send("ServiceWorker.stopWorker", { versionId: workerId });
    await expect
      .poll(() => workerStates.get(workerId)?.runningStatus)
      .toBe("stopped");

    await page.evaluate((nonce) => {
      const frame = document.createElement("iframe");
      frame.src = `http://late.editing.test/new?run=${nonce}`;
      document.body.append(frame);
    }, nonce);
    await expect.poll(async () => (await frameIds()).length).toBe(3);
    const late = (await frameIds()).find((frame) =>
      frame.url?.includes("late.editing.test"),
    )!.id;
    await expect.poll(() => state(late)).toBe(true);
    evidence.frameInheritanceAfterWorkerRestart = true;
    await send("restore-page");
    expect(await state()).toBe(true);
    await send("translate-page");
    expect(await state()).toBe(true);
    const translation = page.locator('[data-yaku-owned="translation"]');
    const manualText = " 人工修订。";
    async function editTranslation() {
      await expect(translation).toHaveAttribute(
        "contenteditable",
        "plaintext-only",
        { timeout: 90_000 },
      );
      await expect(translation).toContainText(/[\u3400-\u9fff]/u);
      const generated = await translation.textContent();
      await translation.focus();
      await page.keyboard.press("Control+End");
      await page.keyboard.insertText(manualText);
      await expect(translation).toContainText(manualText);
      await page.keyboard.press("Control+z");
      await expect(translation).toHaveText(generated!);
      await page.keyboard.press("Control+Shift+z");
      await expect(translation).toContainText(manualText);
      expect(
        await page.locator("#source").evaluate((element) => {
          const clone = element.cloneNode(true) as Element;
          clone.querySelector('[data-yaku-owned="translation"]')?.remove();
          return clone.innerHTML;
        }),
      ).toBe(
        'Read the <a href="/guide">complete guide</a> and run <code>npm install</code>.',
      );
    }
    if (realModel) await editTranslation();
    await page.evaluate(() => history.pushState({}, "", "/next"));
    expect(await state()).toBe(true);
    if (realModel) {
      await expect(translation).not.toContainText(manualText, {
        timeout: 90_000,
      });
      await editTranslation();
    }
    panel = await popup();
    await panel.getByRole("button", { name: /^More reading controls/ }).click();
    await expect(
      panel.getByRole("switch", { name: "Temporary editing", exact: true }),
    ).toBeChecked();
    await panel
      .getByRole("switch", { name: "Temporary editing", exact: true })
      .click();
    await expect.poll(() => state()).toBe(false);
    await expect.poll(() => state(child)).toBe(false);
    await expect.poll(() => state(late)).toBe(false);
    if (realModel) {
      await expect(translation).not.toHaveAttribute("contenteditable");
      await expect(translation).toContainText(manualText);
      await page.screenshot({
        path: path.join(output, "temporary-editing-real-model.png"),
      });
    }
    await panel
      .getByRole("switch", { name: "Temporary editing", exact: true })
      .click();
    await expect.poll(() => state()).toBe(true);
    await panel.close();
    await page.reload();
    await expect.poll(() => state()).toBe(false);
    await expect(translation).toHaveCount(0);
    const preferences = await bridge.evaluate(
      async () => (await chrome.storage.local.get("settings")).settings,
    );
    expect(preferences).not.toHaveProperty("temporaryEditing");
    const cache = await bridge.evaluate(() =>
      chrome.runtime.sendMessage({
        destination: "background",
        action: "cache-info",
      }),
    );
    expect(cache.value.complete).toBe(realModel);
    if (!realModel) expect(cache.value.bytes).toBe(0);
    expect(errors).toEqual([]);
    evidence.completed = true;
    evidence.errors = errors;
    evidence.cache = cache.value;
    evidence.scope = realModel
      ? "Actual HY-MT2 rich paragraph, native typing/undo/redo, source preservation, switch-off retaining edits, SPA regeneration and document/frame session lifecycle. Uses a preseeded model profile."
      : "Native popup and document/frame session lifecycle; fixture prose is excluded from translation and no model inference is performed.";
  } finally {
    await writeFile(
      path.join(
        output,
        realModel
          ? "temporary-editing-session-model.json"
          : "temporary-editing-session.json",
      ),
      JSON.stringify(evidence, null, 2),
    );
    await context.close();
  }
});
