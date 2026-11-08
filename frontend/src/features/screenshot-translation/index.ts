import { copy } from "../../shared/i18n";
import { contentThemeCss } from "../../shared/styles/content-theme";

export async function translateScreenshot(options: {
  document: Document;
  screenshot: string;
  theme: string;
  translate: (crop: string) => Promise<string>;
  cancel: () => void;
}) {
  const { document, screenshot, theme, translate, cancel } = options;
  const bitmap = await createImageBitmap(
    await (await fetch(screenshot)).blob(),
  );
  const host = document.createElement("div");
  host.dataset.yakuOwned = "true";
  host.dataset.theme = theme;
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${contentThemeCss}
    dialog{font:inherit;color:var(--foreground);background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;max-width:calc(100vw - 24px)}
    dialog::backdrop{background:#0005}dialog[data-selecting]{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;border:0;border-radius:0;padding:0;overflow:hidden;cursor:crosshair;touch-action:none}
    canvas{display:block;max-width:100%;max-height:75vh;object-fit:contain}dialog[data-selecting] canvas{width:100%;height:100%;max-height:none;object-fit:fill}
    .area{position:absolute;pointer-events:none;border:2px solid var(--primary);box-shadow:0 0 0 200vmax #0005}
    footer{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}dialog[data-selecting] footer{position:absolute;top:12px;right:12px;margin:0}
  `;
  const dialog = document.createElement("dialog");
  dialog.dataset.selecting = "";
  dialog.setAttribute("aria-label", copy.translateScreenshot);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d")!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const area = document.createElement("div");
  area.className = "area";
  area.hidden = true;
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const footer = document.createElement("footer");
  const close = document.createElement("button");
  close.textContent = copy.cancel;
  close.onclick = () => dialog.close();
  footer.append(close);
  dialog.append(canvas, area, status, footer);
  root.append(style, dialog);
  document.documentElement.append(host);
  return new Promise<void>((resolve) => {
    let closed = false;
    let start: { x: number; y: number; pointer: number } | undefined;
    dialog.addEventListener(
      "close",
      () => {
        closed = true;
        cancel();
        host.remove();
        resolve();
      },
      { once: true },
    );
    const rectangle = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const x = Math.min(
        bounds.width,
        Math.max(0, event.clientX - bounds.left),
      );
      const y = Math.min(
        bounds.height,
        Math.max(0, event.clientY - bounds.top),
      );
      return {
        left: Math.min(start!.x, x),
        top: Math.min(start!.y, y),
        width: Math.abs(x - start!.x),
        height: Math.abs(y - start!.y),
        bounds,
      };
    };
    canvas.onpointerdown = (event) => {
      if (event.button !== 0 || !dialog.hasAttribute("data-selecting")) return;
      const bounds = canvas.getBoundingClientRect();
      start = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        pointer: event.pointerId,
      };
      canvas.setPointerCapture(event.pointerId);
    };
    canvas.onpointermove = (event) => {
      if (start?.pointer !== event.pointerId) return;
      const rect = rectangle(event);
      area.hidden = false;
      area.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
    };
    canvas.onpointercancel = () => {
      start = undefined;
      area.hidden = true;
    };
    canvas.onpointerup = async (event) => {
      if (start?.pointer !== event.pointerId) return;
      const { left, top, width, height, bounds } = rectangle(event);
      start = undefined;
      area.hidden = true;
      if (width < 1 || height < 1) return;
      const scaleX = canvas.width / bounds.width;
      const scaleY = canvas.height / bounds.height;
      const x = Math.floor(left * scaleX);
      const y = Math.floor(top * scaleY);
      const crop = document.createElement("canvas");
      crop.width = Math.ceil((left + width) * scaleX) - x;
      crop.height = Math.ceil((top + height) * scaleY) - y;
      crop
        .getContext("2d")!
        .drawImage(
          canvas,
          x,
          y,
          crop.width,
          crop.height,
          0,
          0,
          crop.width,
          crop.height,
        );
      delete dialog.dataset.selecting;
      canvas.hidden = true;
      canvas.style.display = "none";
      status.textContent = copy.translating;
      try {
        const translated = await translate(crop.toDataURL("image/png"));
        if (closed) return;
        const image = await createImageBitmap(
          await (await fetch(translated)).blob(),
        );
        canvas.width = image.width;
        canvas.height = image.height;
        context.drawImage(image, 0, 0);
        image.close();
        canvas.hidden = false;
        canvas.style.display = "";
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", copy.translatedScreenshot);
        status.textContent = "";
        const save = document.createElement("button");
        save.className = "primary";
        save.textContent = copy.savePostCard;
        save.onclick = () => {
          const link = document.createElement("a");
          link.href = translated;
          link.download = "translated-screenshot.png";
          link.click();
        };
        footer.append(save);
      } catch (error) {
        if (!closed)
          status.textContent =
            error instanceof Error ? error.message : copy.imageAccessFailed;
      } finally {
        close.textContent = copy.close;
      }
    };
    dialog.showModal();
  });
}
