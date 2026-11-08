import { copy } from "../../shared/i18n";
import { contentThemeCss } from "../../shared/styles/content-theme";
import { wrapText } from "../../shared/text-layout";

type Passage = { source: string; translation: string };

export async function previewPostCard(
  document: Document,
  theme: string,
  read: (root: Element) => Passage | undefined,
) {
  const location = document.location;
  const pathname = location.pathname;
  const match = /^\/([\w]+)\/status\/(\d+)\/?$/.exec(location.pathname);
  if (
    !match ||
    !["x.com", "twitter.com", "www.x.com", "www.twitter.com"].includes(
      location.hostname,
    )
  )
    throw new Error(copy.postCardUnavailable);
  const [, account, id] = match;
  const permalink = `https://x.com/${account}/status/${id}`;
  const article = [...document.querySelectorAll("article")].find((article) =>
    [
      ...article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]'),
    ].some(
      (link) =>
        link.querySelector("time") &&
        new URL(link.href).pathname === `/${account}/status/${id}`,
    ),
  );
  const post = article?.querySelector('[data-testid="tweetText"]');
  const passage = post && read(post);
  if (!post || !passage?.source.trim() || !passage.translation.trim())
    throw new Error(copy.postCardUnavailable);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(copy.postCardUnavailable);
  const width = 800;
  const margin = 44;
  const font = '28px system-ui, "Segoe UI", sans-serif';
  ctx.font = font;
  const lines = [passage.source, passage.translation].map((text) =>
    wrapText(text, {
      width: width - margin * 2,
      measure: (line) => ctx.measureText(line).width,
    }),
  );
  const height = 170 + lines.reduce((sum, block) => sum + block.length * 42, 0);
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = "#faf8f3";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#1d1b18";
  ctx.font = "600 26px system-ui";
  ctx.fillText(`@${account}`, margin, 58);
  ctx.font = font;
  let y = 105;
  for (const [index, block] of lines.entries()) {
    if (index) {
      ctx.fillStyle = "#ded8cd";
      ctx.fillRect(margin, y - 20, width - margin * 2, 1);
      y += 32;
    }
    ctx.fillStyle = "#1d1b18";
    ctx.textAlign = "start";
    ctx.direction = /^\s*[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(
      index ? passage.translation : passage.source,
    )
      ? "rtl"
      : "ltr";
    for (const line of block) {
      ctx.fillText(line, ctx.direction === "rtl" ? width - margin : margin, y);
      y += 42;
    }
  }
  ctx.direction = "ltr";
  ctx.font = "18px system-ui";
  ctx.fillStyle = "#59534a";
  ctx.fillText(permalink, margin, height - 24, width - margin * 2);
  const png = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!png || document.location.pathname !== pathname || !post.isConnected)
    throw new Error(copy.postCardUnavailable);
  const url = URL.createObjectURL(png);
  const host = document.createElement("div");
  host.dataset.yakuOwned = "true";
  host.dataset.theme = theme;
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${contentThemeCss}dialog{font:inherit;color:var(--foreground);background:var(--card);border:1px solid var(--border);border-radius:16px;width:min(520px,calc(100vw - 24px));max-height:calc(100dvh - 24px);padding:16px;overflow:auto}dialog::backdrop{background:#0005}img{display:block;width:100%;height:auto;border-radius:8px}footer{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}`;
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", copy.postCard);
  canvas.style.cssText =
    "display:block;width:100%;height:auto;border-radius:8px";
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    `${passage.source}\n${passage.translation}`,
  );
  const footer = document.createElement("footer");
  const close = document.createElement("button");
  close.textContent = copy.close;
  close.onclick = () => dialog.close();
  const save = document.createElement("button");
  save.className = "primary";
  save.textContent = copy.savePostCard;
  save.onclick = () => {
    const link = document.createElement("a");
    link.href = url;
    link.download = `post-${id}.png`;
    link.click();
  };
  footer.append(close, save);
  dialog.append(canvas, footer);
  root.append(style, dialog);
  dialog.addEventListener(
    "close",
    () => {
      URL.revokeObjectURL(url);
      host.remove();
    },
    { once: true },
  );
  document.documentElement.append(host);
  dialog.showModal();
}
