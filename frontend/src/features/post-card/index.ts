import { copy } from "../../shared/i18n";
import { contentThemeCss } from "../../shared/styles/content-theme";
import { wrapText } from "../../shared/text-layout";
import { drawContained, readPostMedia } from "./media";

type Passage = { source: string; translation: string };
const postHosts = new Set([
  "x.com",
  "twitter.com",
  "www.x.com",
  "www.twitter.com",
]);
const postPath = /^\/([\w]+)\/status\/(\d+)\/?$/;

function postPermalink(article: Element) {
  const links = [
    ...article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]'),
  ]
    .filter(
      (link) =>
        link.closest("article") === article && link.querySelector("time"),
    )
    .flatMap((link) => {
      if (!URL.canParse(link.href)) return [];
      const url = new URL(link.href);
      const match =
        postHosts.has(url.hostname) && url.protocol === "https:"
          ? postPath.exec(url.pathname)
          : null;
      return match ? [`https://x.com/${match[1]}/status/${match[2]}`] : [];
    });
  const distinct = [...new Set(links)];
  return distinct.length === 1 ? distinct[0] : undefined;
}

export function trackPostCardTarget(document: Document) {
  let selected: { article: Element; url: string } | undefined;
  const controller = new AbortController();
  if (postHosts.has(document.location.hostname))
    document.addEventListener(
      "contextmenu",
      (event) => {
        selected = undefined;
        if (!event.isTrusted || !(event.target instanceof Element)) return;
        const article = event.target.closest("article");
        if (article) selected = { article, url: document.location.href };
      },
      { capture: true, signal: controller.signal },
    );
  return {
    take() {
      const captured = selected;
      selected = undefined;
      return captured?.article.isConnected &&
        captured.url === document.location.href
        ? captured.article
        : undefined;
    },
    dispose: () => controller.abort(),
  };
}

export async function previewPostCard(
  document: Document,
  theme: string,
  read: (root: Element) => Passage | undefined,
  selected?: Element,
) {
  const location = document.location;
  const pathname = location.pathname;
  if (!postHosts.has(location.hostname))
    throw new Error(copy.postCardUnavailable);
  const current = postPath.exec(pathname);
  const currentLink = current
    ? `https://x.com/${current[1]}/status/${current[2]}`
    : undefined;
  const article =
    selected ??
    (currentLink
      ? [...document.querySelectorAll("article")].find(
          (article) => postPermalink(article) === currentLink,
        )
      : undefined);
  const permalink = article && postPermalink(article);
  const match = permalink && postPath.exec(new URL(permalink).pathname);
  if (!article || !permalink || !match)
    throw new Error(copy.postCardUnavailable);
  const [, account, id] = match;
  const post = [...article.querySelectorAll('[data-testid="tweetText"]')].find(
    (element) => element.closest("article") === article,
  );
  const passage = post && read(post);
  if (
    !article ||
    !post ||
    !passage?.source.trim() ||
    !passage.translation.trim()
  )
    throw new Error(copy.postCardUnavailable);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(copy.postCardUnavailable);
  const { avatar, photos } = await readPostMedia(article);
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
  const qr = encode(permalink, { border: 4, ecc: "M" }).data;
  const moduleSize = 4;
  const qrSize = qr.length * moduleSize;
  const columns = photos.length === 1 ? 1 : 2;
  const photoWidth = (width - margin * 2 - (columns - 1) * 12) / columns;
  const photoHeight =
    photos.length === 1
      ? Math.min(420, (photoWidth * photos[0]!.height) / photos[0]!.width)
      : 224;
  const mediaHeight = photos.length
    ? Math.ceil(photos.length / columns) * (photoHeight + 12)
    : 0;
  const height =
    170 +
    qrSize +
    mediaHeight +
    lines.reduce((sum, block) => sum + block.length * 42, 0);
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = "#faf8f3";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#1d1b18";
  ctx.font = "600 26px system-ui";
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(margin + 22, 49, 22, 0, 2 * Math.PI);
    ctx.clip();
    const side = Math.min(avatar.width, avatar.height);
    ctx.drawImage(
      avatar,
      (avatar.width - side) / 2,
      (avatar.height - side) / 2,
      side,
      side,
      margin,
      27,
      44,
      44,
    );
    ctx.restore();
    avatar.close();
  }
  ctx.fillText(`@${account}`, margin + (avatar ? 56 : 0), 58);
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
  for (const [index, photo] of photos.entries()) {
    drawContained(
      ctx,
      photo,
      margin + (index % columns) * (photoWidth + 12),
      y - 10 + Math.floor(index / columns) * (photoHeight + 12),
      photoWidth,
      photoHeight,
    );
    photo.close();
  }
  ctx.direction = "ltr";
  ctx.font = "18px system-ui";
  ctx.fillStyle = "#59534a";
  const qrX = width - margin - qrSize;
  const qrY = height - margin - qrSize;
  ctx.fillText(permalink, margin, qrY + qrSize / 2, qrX - margin * 2);
  ctx.fillStyle = "#fff";
  ctx.fillRect(qrX, qrY, qrSize, qrSize);
  ctx.fillStyle = "#000";
  for (const [row, modules] of qr.entries()) {
    for (const [column, dark] of modules.entries()) {
      if (dark)
        ctx.fillRect(
          qrX + column * moduleSize,
          qrY + row * moduleSize,
          moduleSize,
          moduleSize,
        );
    }
  }
  const png = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (
    !png ||
    document.location.pathname !== pathname ||
    !post.isConnected ||
    postPermalink(article) !== permalink
  )
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
  footer.append(close);
  const file = new File([png], `post-${id}.png`, { type: "image/png" });
  const navigator = document.defaultView?.navigator;
  const shareData = { files: [file] };
  const notice = document.createElement("p");
  notice.setAttribute("role", "status");
  if (navigator?.share && navigator.canShare?.(shareData)) {
    const share = document.createElement("button");
    share.textContent = copy.sharePostCard;
    share.onclick = async () => {
      share.disabled = true;
      notice.textContent = "";
      try {
        await navigator.share(shareData);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          notice.textContent = copy.sharePostCardFailed;
      } finally {
        share.disabled = false;
      }
    };
    footer.append(share);
  }
  footer.append(save);
  dialog.append(canvas, notice, footer);
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
import { encode } from "uqr";
