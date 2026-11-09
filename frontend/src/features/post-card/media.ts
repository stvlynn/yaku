export async function readPostMedia(article: Element) {
  const sources = (selector: string, prefix: string) => [
    ...new Set(
      [...article.querySelectorAll<HTMLImageElement>(selector)]
        .filter((image) => image.closest("article") === article)
        .flatMap((image) => {
          const source = image.currentSrc || image.src;
          if (!source) return [];
          const url = new URL(source);
          return url.origin === "https://pbs.twimg.com" &&
            url.pathname.startsWith(prefix)
            ? [url.href]
            : [];
        }),
    ),
  ];
  const load = async (url: string): Promise<ImageBitmap | undefined> => {
    try {
      const response = await fetch(url, {
        credentials: "omit",
        mode: "cors",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(5000),
      });
      if (
        response.ok &&
        response.headers.get("content-type")?.startsWith("image/")
      )
        return await createImageBitmap(await response.blob());
    } catch {
      // Images without anonymous CORS access cannot safely enter an export canvas.
    }
  };
  const avatar = sources('img[src*="/profile_images/"]', "/profile_images/")[0];
  const photos = sources('[data-testid="tweetPhoto"] img', "/media/").slice(
    0,
    4,
  );
  const [author, ...media] = await Promise.all([
    avatar ? load(avatar) : undefined,
    ...photos.map(load),
  ]);
  return {
    avatar: author,
    photos: media.filter((image) => image !== undefined),
  };
}

export function drawContained(
  ctx: CanvasRenderingContext2D,
  image: ImageBitmap,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}
