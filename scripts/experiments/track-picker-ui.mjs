/** Native dialog UI behavior, independent of model quality and caption acquisition. */
import { chromium, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const wxtRequire = createRequire(require.resolve("wxt"));
const { build } = await import(pathToFileURL(wxtRequire.resolve("esbuild")).href);
const bundle = await build({
  stdin: {
    contents: `import { chooseSubtitleTrack } from "./frontend/src/features/video-subtitles/lib/track-picker";
      let controller: AbortController;
      Object.assign(window, {
        pickerTheme: "light",
        pickerResult: "pending",
        startPicker() {
          controller = new AbortController();
          (window as any).pickerResult = "pending";
          void chooseSubtitleTrack({
            media: document.querySelector("video")!, purpose: "export", signal: controller.signal,
            tracks: ["first", "second"].map(id => ({ id, label: "English", language: "en", kind: "subtitles", mode: "showing", default: false, loadState: "loaded", selected: true })),
          }, (window as any).pickerTheme).then(value => { (window as any).pickerResult = value ?? null; });
        },
        abortPicker() { controller.abort(); },
      });
      document.querySelector("#open")!.addEventListener("click", () => (window as any).startPicker());
      document.querySelector("#fullscreen")!.addEventListener("click", () => document.querySelector("video")!.requestFullscreen());`,
    loader: "ts",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  loader: { ".css": "text" },
});
const output = resolve(".workspace/qa");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const evidence = { completed: false, errors: [], console: [] };
page.on("pageerror", error => evidence.errors.push(String(error)));
page.on("console", message => evidence.console.push(message.text()));
try {
  await page.route("http://caption-fixture.test/", route => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><meta charset="utf-8"><title>Caption picker fixture</title><body><video width="640" height="360"></video><button id="open">Open captions</button><button id="fullscreen">Fullscreen video</button></body></html>`,
  }));
  await page.goto("http://caption-fixture.test/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const open = page.getByRole("button", { name: "Open captions", exact: true });
  const dialog = page.getByRole("dialog", { name: "Choose captions", exact: true });
  const first = page.getByRole("button", { name: "English · Track 1", exact: true });
  const second = page.getByRole("button", { name: "English · Track 2", exact: true });
  const cancel = page.getByRole("button", { name: "Cancel", exact: true });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.reload();
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole("button", { name: "Fullscreen video", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.tagName)).toBe("VIDEO");
  await page.evaluate(() => window.startPicker());
  await expect(dialog).toBeVisible();
  evidence.fullscreenStyles = await dialog.evaluate(element => {
    const style = getComputedStyle(element);
    const hostStyle = getComputedStyle(element.getRootNode().host);
    return { font: style.fontFamily, color: style.color, token: style.getPropertyValue("--foreground"), hostFont: hostStyle.fontFamily, hostToken: hostStyle.getPropertyValue("--foreground") };
  });
  await page.screenshot({ path: resolve(output, "caption-track-picker-fullscreen.png") });
  await second.click();
  await expect.poll(() => page.evaluate(() => window.pickerResult)).toBe("second");
  expect(await page.evaluate(() => document.fullscreenElement?.tagName)).toBe("VIDEO");
  await page.evaluate(() => document.exitFullscreen());
  evidence.fullscreenVideoSelection = true;
  await open.click();
  await expect(dialog).toBeVisible();
  await expect(first).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(second).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  evidence.forwardTabBoundary = await page.evaluate(() => ({
    documentFocused: document.hasFocus(),
    activeElement: document.activeElement?.tagName,
    shadowActiveElement: document.activeElement?.shadowRoot?.activeElement?.tagName,
  }));
  if (!await first.evaluate(element => element.getRootNode().activeElement === element)) {
    expect(await page.evaluate(() => document.hasFocus())).toBe(false);
    await page.keyboard.press("Tab");
  }
  await expect(first).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.pickerResult)).toBe("first");
  await expect(open).toBeFocused();
  evidence.keyboardSelectionAndFocusReturn = true;

  await open.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.pickerResult)).toBeNull();
  await open.click();
  await page.evaluate(() => window.abortPicker());
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.pickerResult)).toBeNull();
  evidence.escapeAndAbort = true;

  await open.click();
  await page.screenshot({ path: resolve(output, "caption-track-picker-light.png") });
  await cancel.click();
  await page.setViewportSize({ width: 360, height: 640 });
  await page.evaluate(() => { window.pickerTheme = "dark"; });
  await open.click();
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(360);
  await page.screenshot({ path: resolve(output, "caption-track-picker-narrow-dark.png") });
  await cancel.click();
  evidence.narrowBounds = bounds;

  expect(evidence.errors).toEqual([]);
  evidence.completed = true;
} finally {
  await writeFile(resolve(output, "caption-track-picker-ui.json"), JSON.stringify(evidence, null, 2));
  await browser.close();
}
console.log(JSON.stringify(evidence, null, 2));
