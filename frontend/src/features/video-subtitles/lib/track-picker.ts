import type { Settings } from "../../../entities/settings";
import { copy, subtitleTrackLabel } from "../../../shared/i18n";
import { contentThemeCss } from "../../../shared/styles/content-theme";
import type { NativeTrackSelectionRequest } from "../model/track-types";

const openPickers = new WeakMap<Document, () => void>();

/** Show a choice only when the player's native selection is ambiguous. */
export function chooseSubtitleTrack(
  request: NativeTrackSelectionRequest,
  theme: Settings["theme"] = "system",
): Promise<string | undefined> {
  if (request.signal.aborted || !request.tracks.length)
    return Promise.resolve(undefined);
  const document = request.media.ownerDocument;
  openPickers.get(document)?.();
  const host = document.createElement("div");
  host.dataset.yakuOwned = "true";
  host.dataset.yakuCaptionPicker = "true";
  host.dataset.theme = theme;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${contentThemeCss}
    dialog{font:inherit;color:var(--foreground);background:var(--card);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-2);padding:20px;width:min(380px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto}
    dialog[open]{animation:dialog-in 200ms var(--ease-out)}
    dialog::backdrop{background:rgb(0 0 0 / .3)}
    dialog[open]::backdrop{animation:backdrop-in 200ms ease}
    @keyframes dialog-in{from{opacity:0;transform:scale(.97)}}
    @keyframes backdrop-in{from{opacity:0}}
    h2{font-size:17px;line-height:1.4;margin:0 0 16px;font-weight:600}
    .tracks{display:grid;gap:6px}
    .track{width:100%;text-align:start;overflow-wrap:anywhere;min-height:44px;box-shadow:none}
    .track:active{transform:scale(.99)}
    footer{display:flex;justify-content:flex-end;margin-top:16px}
  `;
  const dialog = document.createElement("dialog");
  const title = document.createElement("h2");
  title.id = "yaku-captions-title";
  title.textContent = copy.chooseSubtitleTrack;
  dialog.setAttribute("aria-labelledby", title.id);
  const tracks = document.createElement("div");
  tracks.className = "tracks";
  const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
  const names = request.tracks.map((track, index) => {
    if (track.label.trim()) return track.label.trim();
    if (track.language) {
      try {
        const name = languageNames.of(track.language);
        if (name && name !== track.language) return name;
      } catch {
        // A native track may declare an invalid BCP 47 language tag.
      }
    }
    return subtitleTrackLabel(index + 1);
  });
  const footer = document.createElement("footer");
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "ghost";
  cancelButton.textContent = copy.cancel;
  footer.append(cancelButton);
  dialog.append(title, tracks, footer);
  shadow.append(style, dialog);

  return new Promise((resolve, reject) => {
    let finished = false;
    function finish(id?: string) {
      if (finished) return;
      finished = true;
      request.signal.removeEventListener("abort", cancel);
      if (openPickers.get(document) === cancel) openPickers.delete(document);
      if (dialog.open) dialog.close();
      host.remove();
      resolve(id);
    }
    function cancel() {
      finish();
    }
    request.tracks.forEach((track, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "track";
      const name = names[index]!;
      button.textContent =
        names.filter((item) => item === name).length > 1
          ? `${name} · ${subtitleTrackLabel(index + 1)}`
          : name;
      button.autofocus = index === 0;
      button.onclick = () => finish(track.id);
      tracks.append(button);
    });
    cancelButton.onclick = cancel;
    dialog.addEventListener("close", cancel, { once: true });
    request.signal.addEventListener("abort", cancel, { once: true });
    openPickers.set(document, cancel);
    document.documentElement.append(host);
    try {
      dialog.showModal();
    } catch (error) {
      finished = true;
      request.signal.removeEventListener("abort", cancel);
      if (openPickers.get(document) === cancel) openPickers.delete(document);
      host.remove();
      reject(error);
    }
  });
}
