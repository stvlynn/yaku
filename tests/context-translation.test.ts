// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installContextTranslation } from "../frontend/src/features/context-translation";
import {
  defaultSettings,
  type Settings,
} from "../frontend/src/entities/settings";
import type { Translate } from "../frontend/src/entities/translation";

beforeEach(() => {
  const attach = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function (
    this: Element,
    options,
  ) {
    return attach.call(this, { ...options, mode: "open" });
  });
});
const controllers: ReturnType<typeof installContextTranslation>[] = [];
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  document
    .querySelectorAll("[data-yaku-owned]")
    .forEach((node) => node.remove());
});
const install = (
  translate: Translate,
  cancel?: (id: string) => Promise<void>,
  settings: Settings = defaultSettings,
) => {
  const controller = installContextTranslation({
    document,
    translate,
    cancel,
    getSettings: () => settings,
    onError: (error) => {
      throw error;
    },
  });
  controllers.push(controller);
  return controller;
};
const shadow = () =>
  document.querySelector('[data-yaku-owned="true"]')!.shadowRoot!;
const chooseText = (element: Element, mouseup = true) => {
  const range = document.createRange();
  range.selectNodeContents(element);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  if (mouseup)
    element.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, composed: true }),
    );
};

describe("editable input translation", () => {
  it("translates only the native selection and restores its direction on undo", async () => {
    document.body.innerHTML =
      "<textarea>Keep /ja Good morning. And keep this.</textarea>";
    const editor = document.querySelector("textarea")!;
    editor.focus();
    editor.setSelectionRange(9, 22, "backward");
    const run = vi.fn<Translate>(async ({ id }) => ({
      id,
      text: "早上好。",
      elapsedMs: 0,
    }));
    await install(run, undefined, {
      ...defaultSettings,
      inputTargetLanguage: "zh",
    }).translateInput();
    expect(run.mock.calls[0]?.[0]).toMatchObject({
      text: "Good morning.",
      targetLanguage: "zh",
    });
    expect(editor.value).toBe("Keep /ja 早上好。 And keep this.");
    [...shadow().querySelectorAll("button")]
      .find((button) => button.textContent === "Undo translation")!
      .click();
    expect(editor.value).toBe("Keep /ja Good morning. And keep this.");
    expect([
      editor.selectionStart,
      editor.selectionEnd,
      editor.selectionDirection,
    ]).toEqual([9, 22, "backward"]);
  });
  it("joins partial rich paragraphs without changing the surrounding markup or undo selection", async () => {
    document.body.innerHTML =
      '<div contenteditable="true"><p class="first">Keep <b>Good morning</b>.</p><p class="second">Good night to you.</p></div>';
    const editor = document.querySelector<HTMLElement>("[contenteditable]")!;
    editor.focus();
    const first = editor.querySelector("b")!.firstChild!;
    const last = editor.lastChild!.firstChild!;
    window.getSelection()!.setBaseAndExtent(last, 10, first, 0);
    const run = vi.fn<Translate>(async ({ id, text }) => ({
      id,
      text: text
        .replace("Good morning", "早上好")
        .replace("Good night", "晚安"),
      elapsedMs: 0,
    }));
    await install(run).translateInput();
    expect(run.mock.calls[0]?.[0].text).not.toMatch(/Keep|to you/u);
    expect(editor.innerHTML).toBe(
      '<p class="first">Keep <b>早上好</b>.</p><p class="second">晚安 to you.</p>',
    );
    [...shadow().querySelectorAll("button")]
      .find((button) => button.textContent === "Undo translation")!
      .click();
    const selection = window.getSelection()!;
    expect([
      selection.anchorNode,
      selection.anchorOffset,
      selection.focusNode,
      selection.focusOffset,
    ]).toEqual([last, 10, first, 0]);
  });
  it("retargets from the original suffix, remembers the choice, and undoes both translations", async () => {
    document.body.innerHTML = "<textarea>Keep // Good morning</textarea>";
    const editor = document.querySelector("textarea")!;
    editor.focus();
    const run = vi.fn<Translate>(async (request) => ({
      id: request.id,
      text: request.targetLanguage === "ja" ? "おはよう" : "早上好",
      elapsedMs: 0,
    }));
    const saveInputTargetLanguage = vi.fn(async () => {});
    const onError = vi.fn();
    const controller = installContextTranslation({
      document,
      translate: run,
      getSettings: () => ({ ...defaultSettings, inputTargetLanguage: "zh" }),
      onError,
      saveInputTargetLanguage,
    });
    controllers.push(controller);
    await controller.translateInput();
    expect(editor.value).toBe("Keep 早上好");
    const language = shadow().querySelector("select")!;
    run.mockRejectedValueOnce(new Error("Model unavailable"));
    language.value = "ja";
    language.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(language.value).toBe("zh"));
    expect(editor.value).toBe("Keep 早上好");
    expect(onError).toHaveBeenCalledOnce();
    expect(saveInputTargetLanguage).not.toHaveBeenCalled();
    language.value = "ja";
    language.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(editor.value).toBe("Keep おはよう"));
    expect(
      run.mock.calls.map(([request]) => [request.targetLanguage, request.text]),
    ).toEqual([
      ["zh", "Good morning"],
      ["ja", "Good morning"],
      ["ja", "Good morning"],
    ]);
    expect(saveInputTargetLanguage).toHaveBeenCalledWith("ja");
    [...shadow().querySelectorAll("button")]
      .find((button) => button.textContent === "Undo translation")!
      .click();
    expect(editor.value).toBe("Keep // Good morning");
  });
  it("translates only the suffix and restores the exact native value on undo", async () => {
    document.body.innerHTML = "<textarea></textarea>";
    const editor = document.querySelector("textarea")!;
    const original = "Keep https://example.test/hello. // /ja Good morning";
    editor.value = original;
    editor.focus();
    const run = vi.fn<Translate>(async (request) => ({
      id: request.id,
      text: "おはようございます",
      elapsedMs: 0,
    }));
    await install(run).translateInput();
    expect(run.mock.calls[0]?.[0]).toMatchObject({
      text: "Good morning",
      targetLanguage: "ja",
    });
    expect(editor.value).toBe(
      "Keep https://example.test/hello. // おはようございます",
    );
    [...shadow().querySelectorAll("button")]
      .find((button) => button.textContent === "Undo translation")!
      .click();
    expect(editor.value).toBe(original);
  });
  it("retains rich prefix formatting and keeps the original nodes for undo", async () => {
    document.body.innerHTML =
      '<div contenteditable="true"><b>Keep</b> // <em>Good morning</em></div>';
    const editor = document.querySelector<HTMLElement>("[contenteditable]")!;
    const original = editor.innerHTML;
    const bold = editor.firstChild;
    editor.focus();
    const run = vi.fn<Translate>(async (request) => ({
      id: request.id,
      text: request.text.replace("Good morning", "早上好"),
      elapsedMs: 0,
    }));
    await install(run).translateInput();
    expect(run.mock.calls[0]?.[0].text).not.toContain("Keep");
    expect(editor.innerHTML).toBe("<b>Keep</b> <em>早上好</em>");
    [...shadow().querySelectorAll("button")]
      .find((button) => button.textContent === "Undo translation")!
      .click();
    expect(editor.innerHTML).toBe(original);
    expect(editor.firstChild).toBe(bold);
  });
  it.each(["input", "selection"])(
    "preserves declared source language and rejects a stale %s result after it changes",
    async (kind) => {
      document.body.innerHTML = "<textarea>Gift</textarea><p>Gift</p>";
      const settings = { ...defaultSettings, sourceLanguage: "de" };
      let finish!: () => void;
      const run = vi.fn<Translate>(
        (request) =>
          new Promise((resolve) => {
            finish = () =>
              resolve({ id: request.id, text: "毒药", elapsedMs: 0 });
          }),
      );
      const controller = install(run, undefined, settings);
      if (kind === "input") document.querySelector("textarea")!.focus();
      else chooseText(document.querySelector("p")!);
      const pending =
        kind === "input"
          ? controller.translateInput()
          : controller.translateSelection();
      expect(run.mock.calls[0]![0].sourceLanguage).toBe("de");
      settings.sourceLanguage = "en";
      finish();
      await pending;
      expect(document.querySelector("textarea")!.value).toBe("Gift");
      expect(document.querySelector("p")!.textContent).toBe("Gift");
      expect(shadow().querySelector("section")).toBeNull();
    },
  );

  it("does not start translation during IME composition", async () => {
    document.body.innerHTML = "<textarea>正在输入</textarea>";
    const input = document.querySelector("textarea")!;
    input.focus();
    const run = vi.fn<Translate>(async (request) => ({
      id: request.id,
      text: "Translated",
      elapsedMs: 0,
    }));
    const context = install(run);
    input.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    await context.translateInput();
    expect(run).not.toHaveBeenCalled();
    expect(input.value).toBe("正在输入");
    context.dispose();
  });

  it("rejects an in-flight result after composition begins even when visible text is unchanged", async () => {
    document.body.innerHTML = "<textarea>Hello</textarea>";
    const input = document.querySelector("textarea")!;
    input.focus();
    let finish!: (value: {
      id: string;
      text: string;
      elapsedMs: number;
    }) => void;
    const context = install(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = context.translateInput();
    input.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    finish({ id: "late", text: "Outdated", elapsedMs: 0 });
    await pending;
    expect(input.value).toBe("Hello");
    context.dispose();
  });

  it("does not let undo overwrite edits made after a translation", async () => {
    document.body.innerHTML = "<textarea>Hello</textarea>";
    const input = document.querySelector("textarea")!;
    input.focus();
    const context = install(async (request) => ({
      id: request.id,
      text: "你好",
      elapsedMs: 0,
    }));
    await context.translateInput();
    const undo = [
      ...document
        .querySelector("[data-yaku-owned]")!
        .shadowRoot!.querySelectorAll("button"),
    ].find((button) => button.textContent === "Undo translation")!;
    input.value = "My newer edit";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    undo.click();
    expect(input.value).toBe("My newer edit");
    context.dispose();
  });
  it("updates native inputs, dispatches input, and offers real undo", async () => {
    document.body.innerHTML = "<textarea>Hello world</textarea>";
    const input = document.querySelector("textarea")!;
    input.focus();
    const changed = vi.fn();
    input.addEventListener("input", changed);
    const context = install(async (request) => ({
      id: request.id,
      text: "你好世界",
      elapsedMs: 1,
    }));
    await context.translateInput();
    expect(input.value).toBe("你好世界");
    expect(changed).toHaveBeenCalledOnce();
    const shadow = document.querySelector("[data-yaku-owned]")!.shadowRoot!;
    const undo = Array.from(shadow.querySelectorAll("button")).find(
      (button) => button.textContent === "Undo translation",
    )!;
    undo.click();
    expect(input.value).toBe("Hello world");
    expect(changed).toHaveBeenCalledTimes(2);
    context.dispose();
  });
  it("does not overwrite newer edits or translate password inputs", async () => {
    document.body.innerHTML =
      '<input type="password" value="secret"><textarea>Old text</textarea>';
    const run = vi.fn<Translate>();
    const context = install(run);
    document.querySelector("input")!.focus();
    await context.translateInput();
    expect(run).not.toHaveBeenCalled();
    let finish!: (value: {
      id: string;
      text: string;
      elapsedMs: number;
    }) => void;
    run.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const input = document.querySelector("textarea")!;
    input.focus();
    const pending = context.translateInput();
    input.value = "New edit";
    finish({ id: "response", text: "Outdated", elapsedMs: 1 });
    await pending;
    expect(input.value).toBe("New edit");
    context.dispose();
  });
  it("cancels an outstanding input request when dismissed", async () => {
    document.body.innerHTML = "<textarea>Hello</textarea>";
    document.querySelector("textarea")!.focus();
    let finish!: (value: {
      id: string;
      text: string;
      elapsedMs: number;
    }) => void;
    const cancel = vi.fn(async () => {});
    const context = install(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      cancel,
    );
    const pending = context.translateInput();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(cancel).toHaveBeenCalledOnce();
    finish({ id: "response", text: "Late", elapsedMs: 1 });
    await pending;
    expect(document.querySelector("textarea")!.value).toBe("Hello");
    context.dispose();
  });

  it("honors cancelable beforeinput and emits historyUndo with restored selection", async () => {
    document.body.innerHTML = "<textarea>Hello world</textarea>";
    const input = document.querySelector("textarea")!;
    input.focus();
    input.setSelectionRange(2, 5);
    const context = install(async (request) => ({
      id: request.id,
      text: "你好世界",
      elapsedMs: 0,
    }));
    const veto = (event: Event) => event.preventDefault();
    input.addEventListener("beforeinput", veto);
    await context.translateInput();
    expect(input.value).toBe("Hello world");
    input.removeEventListener("beforeinput", veto);
    const events: string[] = [];
    input.addEventListener("input", (event) =>
      events.push((event as InputEvent).inputType),
    );
    await context.translateInput();
    [...shadow().querySelectorAll("button")]
      .find((button) => button.textContent === "Undo translation")!
      .click();
    expect(events).toEqual(["insertReplacementText", "historyUndo"]);
    expect(input.value).toBe("Hello world");
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
  });

  it("preserves rich editor paragraphs and inline formatting and restores original node identity", async () => {
    document.body.innerHTML =
      '<div contenteditable="true" tabindex="0"><p>Hello <strong>friend</strong>.</p><p>Next</p></div>';
    const editor = document.querySelector("div")!;
    editor.focus();
    const original = editor.innerHTML;
    const strong = editor.querySelector("strong");
    const run = vi.fn<Translate>(async (request) => ({
      id: request.id,
      text: '<yaku-inline id="0">你好，<yaku-em id="1">朋友</yaku-em>。</yaku-inline><yaku-inline id="2">下一段</yaku-inline>',
      elapsedMs: 0,
    }));
    const context = install(run);
    await context.translateInput();
    expect(editor.querySelectorAll("p")).toHaveLength(2);
    expect(editor.querySelector("strong")?.textContent).toBe("朋友");
    expect(run.mock.calls[0]![0].context).toContain("Keep every inline marker");
    [...shadow().querySelectorAll("button")]
      .find((button) => button.textContent === "Undo translation")!
      .click();
    expect(editor.innerHTML).toBe(original);
    expect(editor.querySelector("strong")).toBe(strong);
  });

  it("finds the focused text field inside an open shadow root and skips a defocused frame", async () => {
    document.body.innerHTML = "<section></section>";
    const root = document
      .querySelector("section")!
      .attachShadow({ mode: "open" });
    root.innerHTML = '<input value="Hello">';
    const input = root.querySelector("input")!;
    input.focus();
    const run = vi.fn<Translate>(async (request) => ({
      id: request.id,
      text: "你好",
      elapsedMs: 0,
    }));
    const context = install(run);
    await context.translateInput();
    expect(input.value).toBe("你好");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    await context.translateInput();
    expect(run).toHaveBeenCalledOnce();
  });

  it("rejects stale results after edits that return to the same text", async () => {
    document.body.innerHTML = "<textarea>Hello</textarea>";
    const input = document.querySelector("textarea")!;
    input.focus();
    let finish!: (value: {
      id: string;
      text: string;
      elapsedMs: number;
    }) => void;
    const context = install(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = context.translateInput();
    input.value = "Changed";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    input.value = "Hello";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    finish({ id: "stale", text: "Old response", elapsedMs: 0 });
    await pending;
    expect(input.value).toBe("Hello");
  });
});

describe("selection, hover and local speech", () => {
  it("uses the current selection and excludes protected/site-excluded text", async () => {
    document.body.innerHTML =
      '<p id="first">First selection</p><p id="second">Second selection</p><p translate="no">Excluded</p>';
    const run = vi.fn<Translate>(async (request) => ({
      id: request.id,
      text: "结果",
      elapsedMs: 0,
    }));
    const context = install(run);
    chooseText(document.querySelector("#first")!);
    chooseText(document.querySelector("#second")!, false);
    await context.translateSelection();
    expect(run.mock.calls[0]![0].text).toBe("Second selection");
    chooseText(document.querySelector('[translate="no"]')!);
    await context.translateSelection();
    expect(run).toHaveBeenCalledOnce();
  });

  it("hover reads only source text and a repeated Alt toggles the result without another model request", async () => {
    document.body.innerHTML =
      '<p>Original<span data-yaku-owned="translation">Injected translation</span></p>';
    const settings = { ...defaultSettings, hoverEnabled: true };
    const run = vi.fn<Translate>(async (request) => ({
      id: request.id,
      text: "结果",
      elapsedMs: 0,
    }));
    install(run, undefined, settings);
    document.querySelector("p")!.dispatchEvent(
      new MouseEvent("pointerover", {
        bubbles: true,
        composed: true,
        altKey: true,
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(run.mock.calls[0]![0].text).toBe("Original");
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Alt", bubbles: true }),
    );
    expect(shadow().querySelector("section")).toBeNull();
    expect(run).toHaveBeenCalledOnce();
  });

  it("refreshes a pending voice list and uses only a matching local voice", () => {
    const speech = new EventTarget() as EventTarget & {
      getVoices: () => SpeechSynthesisVoice[];
      cancel: ReturnType<typeof vi.fn>;
      speak: ReturnType<typeof vi.fn>;
    };
    const voices: SpeechSynthesisVoice[] = [];
    Object.assign(speech, {
      getVoices: () => voices,
      cancel: vi.fn(),
      speak: vi.fn(),
    });
    vi.stubGlobal("speechSynthesis", speech);
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        constructor(public text: string) {}
      },
    );
    document.body.innerHTML = '<p lang="en">Listen to this</p>';
    install(async (request) => ({
      id: request.id,
      text: "结果",
      elapsedMs: 0,
    }));
    chooseText(document.querySelector("p")!);
    expect(shadow().querySelector("[data-speech]")).toBeNull();
    voices.push(
      {
        lang: "en-US",
        localService: false,
        name: "Remote",
      } as SpeechSynthesisVoice,
      {
        lang: "en-US",
        localService: true,
        name: "Local",
      } as SpeechSynthesisVoice,
    );
    speech.dispatchEvent(new Event("voiceschanged"));
    (shadow().querySelector("[data-speech]") as HTMLButtonElement).click();
    expect(speech.speak.mock.calls[0]![0].voice.localService).toBe(true);
    expect(speech.speak.mock.calls[0]![0].lang).toBe("en-US");
  });
});
