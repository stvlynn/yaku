import { contentThemeCss } from "../../../shared/styles/content-theme";
export function createImagePanel(
  document: Document,
  theme: string,
  batch = false,
) {
  const host = document.createElement("div");
  host.dataset.yakuOwned = "true";
  host.dataset[batch ? "yakuImageBatch" : "yakuImage"] = "true";
  host.dataset.theme = theme;
  const shadow = host.attachShadow({ mode: "open" });
  const sheet = document.createElement("style");
  sheet.textContent = `${contentThemeCss}:host{position:fixed;bottom:24px;left:24px;z-index:2147483647;max-width:calc(100vw - 48px)}section{display:flex;align-items:center;flex-wrap:wrap;gap:4px 12px;padding:4px 4px 4px 14px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius-card);box-shadow:var(--shadow-2)}p{font-size:13px;max-width:340px;color:var(--foreground);overflow-wrap:anywhere}button{min-height:36px;padding:6px 12px;box-shadow:none}[role=alert]{flex-basis:100%;margin:0}`;
  const section = document.createElement("section");
  const status = document.createElement("p");
  status.role = "status";
  section.append(status);
  shadow.append(sheet, section);
  document.documentElement.append(host);
  return {
    host,
    status,
    section,
    button(label: string, action: () => void) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.onclick = action;
      section.append(button);
      return button;
    },
  };
}
