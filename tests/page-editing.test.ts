// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPageTranslator } from "../frontend/src/features/page-translation";
import {
  defaultSettings,
  type Settings,
} from "../frontend/src/entities/settings";
import type { Translate } from "../frontend/src/entities/translation";
const controllers: ReturnType<typeof createPageTranslator>[] = [];
const initialUrl = location.href;
const settle = async () => {
  for (let i = 0; i < 12; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
};
const setup = (
  html = '<main><p>Hello <a href="/report">linked words</a>. Run <code>npm install</code>.</p></main>',
) => {
  document.body.innerHTML = html;
  const settings: Settings = {
    ...defaultSettings,
    siteRules: [],
    glossary: {},
  };
  const run = vi.fn<Translate>(async (request) => ({
    id: request.id,
    text: request.text,
    elapsedMs: 0,
  }));
  const controller = createPageTranslator({
    document,
    getSettings: () => settings,
    translate: run,
  });
  controllers.push(controller);
  return { controller, settings, run };
};
const target = () =>
  document.querySelector<HTMLElement>('[data-yaku-owned="translation"]')!;
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  history.replaceState(null, "", initialUrl);
  document.body.innerHTML = "";
});
describe("temporary page translation editing", () => {
  it("starts disabled and makes only owned target paragraphs plaintext editable, including future paragraphs", async () => {
    const { controller, run } = setup();
    const sourceLink = document.querySelector("a")!,
      sourceCode = document.querySelector("code")!,
      sourceText = document.querySelector("p")!.firstChild!;
    expect(controller.isEditing()).toBe(false);
    controller.setEditing(true);
    await controller.translatePage({ wholePage: true });
    expect(target().getAttribute("contenteditable")).toBe("plaintext-only");
    expect(target().getAttribute("role")).toBe("textbox");
    expect(
      target().querySelector("code")?.getAttribute("contenteditable"),
    ).toBe("false");
    expect(sourceLink.getAttribute("contenteditable")).toBeNull();
    expect(sourceCode.getAttribute("contenteditable")).toBeNull();
    expect(sourceText.parentNode).toBe(document.querySelector("p"));
    const next = document.createElement("p");
    next.textContent = "New paragraph.";
    document.querySelector("main")!.append(next);
    await settle();
    expect(
      next
        .querySelector('[data-yaku-owned="translation"]')
        ?.getAttribute("contenteditable"),
    ).toBe("plaintext-only");
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("disabling retains displayed edits and source identity without requesting translation again", async () => {
    const { controller, run } = setup();
    const link = document.querySelector("a")!,
      text = link.textContent;
    await controller.translatePage();
    controller.setEditing(true);
    const edited = target();
    edited.firstChild!.textContent = "Edited translation ";
    await settle();
    controller.setEditing(false);
    expect(controller.isEditing()).toBe(false);
    expect(target()).toBe(edited);
    expect(edited.textContent).toContain("Edited translation");
    expect(edited.hasAttribute("contenteditable")).toBe(false);
    expect(edited.querySelector("code")?.hasAttribute("contenteditable")).toBe(
      false,
    );
    expect(link.textContent).toBe(text);
    expect(link.getAttribute("href")).toBe("/report");
    expect(run).toHaveBeenCalledOnce();
    controller.setEditing(true);
    expect(edited.textContent).toContain("Edited translation");
  });
  it("preserves the session toggle while restore and explicit retranslation discard old edits", async () => {
    const { controller } = setup();
    const original = document.body.innerHTML;
    controller.setEditing(true);
    await controller.translatePage();
    const edited = target();
    edited.firstChild!.textContent = "User edit";
    controller.restore();
    expect(document.body.innerHTML).toBe(original);
    expect(controller.isEditing()).toBe(true);
    await controller.translatePage();
    expect(target()).not.toBe(edited);
    expect(target().textContent).not.toContain("User edit");
    expect(target().getAttribute("contenteditable")).toBe("plaintext-only");
    controller.dispose();
    expect(controller.isEditing()).toBe(false);
    controller.setEditing(true);
    expect(controller.isEditing()).toBe(false);
  });
  it("retains the document-session toggle through SPA scope replacement and language/mode changes", async () => {
    const { controller, settings, run } = setup("<main><p>Hello.</p></main>");
    controller.setEditing(true);
    await controller.translatePage();
    const old = target();
    old.textContent = "Edited old route";
    history.pushState(null, "", "/editing-next-route");
    document.querySelector("main")!.innerHTML = "<p>Next route.</p>";
    await settle();
    expect(controller.isEditing()).toBe(true);
    expect(old.isConnected).toBe(false);
    expect(target().textContent).toBe("Next route.");
    expect(target().getAttribute("contenteditable")).toBe("plaintext-only");
    settings.targetLanguage = "ar";
    controller.setMode("translation");
    await settle();
    expect(controller.isEditing()).toBe(true);
    expect(target().getAttribute("lang")).toBe("ar");
    expect(target().getAttribute("contenteditable")).toBe("plaintext-only");
    expect(run).toHaveBeenCalledTimes(3);
    controller.restore();
    expect(document.querySelector("p")!.textContent).toBe("Next route.");
  });
  it("applies appearance without reparenting the focused target or replacing user edits", async () => {
    const { controller, settings, run } = setup();
    await controller.translatePage();
    controller.setEditing(true);
    const edited = target();
    edited.firstChild!.textContent = "Edited ";
    edited.focus();
    const append = vi.spyOn(edited.parentElement!, "append");
    settings.fontSize = 125;
    settings.textColor = "#123456";
    controller.setMode();
    expect(append).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(edited);
    expect(target()).toBe(edited);
    expect(edited.firstChild!.textContent).toBe("Edited ");
    expect(run).toHaveBeenCalledOnce();
    append.mockRestore();
  });
  it("keeps blur styling readable during editing and prevents accidental translated-link navigation only while editing", async () => {
    const { controller, settings } = setup();
    settings.style = "blur";
    await controller.translatePage();
    expect(target().style.filter).toContain("blur");
    controller.setEditing(true);
    expect(target().style.filter).toBe("none");
    const link = target().querySelector("a")!;
    expect(
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      ),
    ).toBe(false);
    expect(link.getAttribute("href")).toBe("/report");
    controller.setEditing(false);
    expect(target().style.filter).toContain("blur");
    let preventedByEditor = true;
    document.addEventListener(
      "click",
      (event) => {
        preventedByEditor = event.defaultPrevented;
        event.preventDefault();
      },
      { once: true },
    );
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(preventedByEditor).toBe(false);
  });
});

it("uses neighboring original passages on explicit contextual translation without replacing format instructions", async () => {
  const { controller, run } = setup(
    '<main><p>Before the meeting.</p><p>Read the <a href="/guide">complete guide</a>.</p><p hidden>Hidden note.</p><p translate="no">Excluded note.</p><p>After the meeting.</p></main>',
  );
  await controller.translatePage();
  expect(run.mock.calls.every(([request]) => !request.articleBackground)).toBe(
    true,
  );
  run.mockClear();
  await controller.translatePage({ articleContext: true });
  const request = run.mock.calls.find(([input]) =>
    input.text.includes("complete guide"),
  )?.[0];
  expect(request?.articleBackground?.nearby).toEqual([
    "Before the meeting.",
    "After the meeting.",
  ]);
  expect(request?.context).toContain("yaku-link");
});
