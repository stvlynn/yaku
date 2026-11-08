import { copy } from "../../../shared/i18n";
import { contentThemeCss } from "../../../shared/styles/content-theme";
import { contextualChanges } from "./context-diff";

export function openContextDialog(
  document: Document,
  theme: string,
  run: (signal: AbortSignal) => Promise<
    | {
        source: string;
        withoutContext: PromiseSettledResult<string>;
        withContext: PromiseSettledResult<string>;
      }
    | undefined
  >,
) {
  const operation = new AbortController();
  const host = document.createElement("div");
  host.dataset.yakuOwned = "true";
  host.dataset.theme = theme;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${contentThemeCss}
    dialog{font:inherit;color:var(--foreground);background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px;width:min(720px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto}
    dialog::backdrop{background:rgb(0 0 0 / .3)}
    header{display:flex;justify-content:space-between;align-items:center;gap:16px}
    h2,h3{margin:0;font-size:inherit}
    p{margin:12px 0;overflow-wrap:anywhere;white-space:pre-wrap}
    .pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:12px}
    section{padding:12px;border:1px solid var(--border);border-radius:10px}
    mark{background:var(--accent);color:var(--accent-foreground);border-radius:2px}
  `;
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", copy.compareContext);
  const header = document.createElement("header");
  const heading = document.createElement("h2");
  heading.textContent = copy.compareContext;
  const close = document.createElement("button");
  close.textContent = copy.close;
  close.onclick = () => dialog.close();
  header.append(heading, close);
  const body = document.createElement("div");
  body.setAttribute("aria-live", "polite");
  body.textContent = copy.comparingContext;
  dialog.append(header, body);
  shadow.append(style, dialog);
  const dispose = () => {
    operation.abort();
    if (dialog.open) dialog.close();
    host.remove();
  };
  dialog.addEventListener("close", dispose, { once: true });
  document.documentElement.append(host);
  dialog.showModal();
  void run(operation.signal).then(
    (result) => {
      if (operation.signal.aborted) return;
      if (!result) {
        body.textContent = copy.contextComparisonUnavailable;
        return;
      }
      const source = document.createElement("p");
      source.textContent = result.source;
      source.dir = "auto";
      const pair = document.createElement("div");
      pair.className = "pair";
      for (const [label, arm] of [
        [copy.withoutPageContext, result.withoutContext],
        [copy.withPageContext, result.withContext],
      ] as const) {
        const section = document.createElement("section");
        const title = document.createElement("h3");
        title.textContent = label;
        const text = document.createElement("p");
        text.dir = "auto";
        if (
          arm.status === "fulfilled" &&
          arm === result.withContext &&
          result.withoutContext.status === "fulfilled"
        ) {
          for (const run of contextualChanges(
            result.withoutContext.value,
            arm.value,
          )) {
            if (run.changed && run.text.trim()) {
              const mark = document.createElement("mark");
              mark.textContent = run.text;
              text.append(mark);
            } else text.append(run.text);
          }
        } else
          text.textContent =
            arm.status === "fulfilled"
              ? arm.value
              : copy.contextComparisonUnavailable;
        section.append(title, text);
        pair.append(section);
      }
      body.replaceChildren(source, pair);
    },
    () => {
      if (!operation.signal.aborted)
        body.textContent = copy.contextComparisonUnavailable;
    },
  );
  return dispose;
}
