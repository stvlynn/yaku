import type { Settings } from "../../entities/settings";
import { copy } from "../../shared/i18n";
import { contentThemeCss } from "../../shared/styles/content-theme";

interface FloatingControlOptions {
  document: Document;
  getSettings: () => Settings;
  isTranslated: () => boolean;
  onToggle: () => void | Promise<unknown>;
  onOpenWorkspace: () => void | Promise<unknown>;
}

export function installFloatingControl(options: FloatingControlOptions) {
  const { document, getSettings, isTranslated, onToggle, onOpenWorkspace } =
    options;
  const view = document.defaultView;
  if (!view || view.top !== view)
    return { refresh() {}, dispose() {}, showError(_error: string) {} };
  const host = document.createElement("div");
  host.dataset.yakuOwned = "true";
  host.dataset.yakuFloating = "true";
  const shadow = host.attachShadow({ mode: "open" });
  const sheet = document.createElement("style");
  sheet.textContent = `${contentThemeCss}
  :host{position:fixed;z-index:2147483646;right:20px;bottom:24px;max-width:calc(100vw - 16px)}
  :host([hidden]){display:none!important}.control{display:flex;gap:4px;padding:4px;background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-2);align-items:center}
  .handle{display:grid;place-items:center;width:28px;padding:0;color:var(--muted-foreground);cursor:grab;touch-action:none}.handle:active{cursor:grabbing;transform:none}.workspace{font-size:12px}.error{display:flex;flex-direction:column;gap:4px;margin-bottom:8px;padding:10px 4px 4px 12px;max-width:300px;background:var(--card);border:1px solid color-mix(in oklab,var(--danger) 28%,var(--border));border-radius:var(--radius-card);color:var(--danger);font-size:12px;box-shadow:var(--shadow-2)}.error p{padding-right:8px}.error button{align-self:flex-end;min-height:32px;padding:4px 10px;font-size:12px}[hidden]{display:none!important}`;
  const error = document.createElement("div");
  error.className = "error";
  error.role = "alert";
  error.hidden = true;
  const errorText = document.createElement("p");
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "ghost";
  dismiss.textContent = copy.close;
  dismiss.onclick = () => {
    error.hidden = true;
    refresh();
  };
  error.append(errorText, dismiss);
  const control = document.createElement("div");
  control.className = "control";
  control.role = "group";
  control.setAttribute("aria-label", copy.app);
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "handle ghost";
  handle.append(gripIcon(document));
  handle.setAttribute("aria-label", copy.moveControl);
  handle.title = copy.moveControl;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "primary";
  const workspace = document.createElement("button");
  workspace.type = "button";
  workspace.className = "workspace ghost";
  workspace.textContent = copy.textWorkspace;
  control.append(handle, toggle, workspace);
  shadow.append(sheet, error, control);
  document.documentElement.append(host);
  const abort = new AbortController();
  let disposed = false;
  let position: { x: number; y: number } | undefined;
  let drag:
    | { x: number; y: number; left: number; top: number; pointer: number }
    | undefined;
  function showError(message: string) {
    if (disposed) return;
    errorText.textContent = message;
    error.hidden = false;
    refresh();
  }
  function applyPosition(x: number, y: number) {
    const rect = host.getBoundingClientRect();
    position = {
      x: Math.max(8, Math.min(x, view!.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(y, view!.innerHeight - rect.height - 8)),
    };
    host.style.left = `${position.x}px`;
    host.style.top = `${position.y}px`;
    host.style.right = "auto";
    host.style.bottom = "auto";
  }
  async function savePosition() {
    if (!position) return;
    try {
      await chrome.storage.local.set({ floatingControlPosition: position });
    } catch {
      showError(copy.controlPositionError);
    }
  }
  void chrome.storage.local.get("floatingControlPosition").then(
    (stored) => {
      const value: unknown = stored.floatingControlPosition;
      if (
        !disposed &&
        value &&
        typeof value === "object" &&
        "x" in value &&
        "y" in value &&
        typeof value.x === "number" &&
        Number.isFinite(value.x) &&
        typeof value.y === "number" &&
        Number.isFinite(value.y)
      )
        applyPosition(value.x, value.y);
    },
    () => showError(copy.controlPositionError),
  );
  function refresh() {
    control.hidden = !getSettings().showFloatingButton;
    host.hidden = control.hidden && error.hidden;
    host.dataset.theme = getSettings().theme;
    toggle.textContent = isTranslated() ? copy.restorePage : copy.translate;
    toggle.setAttribute(
      "aria-label",
      isTranslated() ? copy.restorePage : copy.translatePage,
    );
    toggle.setAttribute("aria-pressed", String(isTranslated()));
  }
  async function perform(
    callback: () => void | Promise<unknown>,
    translating = false,
  ) {
    error.hidden = true;
    toggle.disabled = true;
    workspace.disabled = true;
    if (translating) {
      toggle.textContent = copy.translating;
      toggle.setAttribute("aria-busy", "true");
    }
    try {
      await callback();
    } catch (failure) {
      showError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      toggle.disabled = false;
      workspace.disabled = false;
      toggle.removeAttribute("aria-busy");
      refresh();
    }
  }
  toggle.addEventListener(
    "click",
    () => {
      void perform(onToggle, !isTranslated());
    },
    { signal: abort.signal },
  );
  workspace.addEventListener(
    "click",
    () => {
      void perform(onOpenWorkspace);
    },
    { signal: abort.signal },
  );
  handle.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0) return;
      const rect = host.getBoundingClientRect();
      drag = {
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top,
        pointer: event.pointerId,
      };
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    { signal: abort.signal },
  );
  handle.addEventListener(
    "pointermove",
    (event) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      applyPosition(
        drag.left + event.clientX - drag.x,
        drag.top + event.clientY - drag.y,
      );
    },
    { signal: abort.signal },
  );
  function finishDrag() {
    if (!drag) return;
    drag = undefined;
    void savePosition();
  }
  handle.addEventListener("pointerup", finishDrag, { signal: abort.signal });
  handle.addEventListener("pointercancel", finishDrag, {
    signal: abort.signal,
  });
  handle.addEventListener(
    "keydown",
    (event) => {
      const deltas: Record<string, [number, number]> = {
        ArrowLeft: [-10, 0],
        ArrowRight: [10, 0],
        ArrowUp: [0, -10],
        ArrowDown: [0, 10],
      };
      const delta = deltas[event.key];
      if (!delta) return;
      event.preventDefault();
      const rect = host.getBoundingClientRect();
      applyPosition(rect.left + delta[0], rect.top + delta[1]);
      void savePosition();
    },
    { signal: abort.signal },
  );
  view.addEventListener(
    "resize",
    () => {
      if (position) applyPosition(position.x, position.y);
    },
    { signal: abort.signal },
  );
  refresh();
  return {
    refresh,
    showError,
    dispose() {
      disposed = true;
      abort.abort();
      host.remove();
    },
  };
}

function gripIcon(document: Document) {
  const namespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(namespace, "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("width", "16");
  icon.setAttribute("height", "16");
  icon.setAttribute("fill", "currentColor");
  icon.setAttribute("aria-hidden", "true");
  for (const x of [6, 10])
    for (const y of [4, 8, 12]) {
      const dot = document.createElementNS(namespace, "circle");
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(y));
      dot.setAttribute("r", "1.1");
      icon.append(dot);
    }
  return icon;
}
