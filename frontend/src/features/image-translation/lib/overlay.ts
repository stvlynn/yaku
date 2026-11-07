import { copy } from "../../../shared/i18n";
import { wrapText } from "../../../shared/text-layout";
import type { OcrRegion } from "../index";

/** Flat edge-color covering is intentional; this is not artwork reconstruction or inpainting. */
export async function renderImageOverlay(
  image: CanvasImageSource,
  width: number,
  height: number,
  regions: OcrRegion[],
  createCanvas: (width: number, height: number) => HTMLCanvasElement = () =>
    document.createElement("canvas"),
): Promise<Blob> {
  const canvas = createCanvas(width, height);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(copy.imageCanvasUnavailable);
  context.drawImage(image, 0, 0, width, height);
  const original = context.getImageData(0, 0, width, height);
  for (const region of regions) {
    if (!region.translation?.trim()) continue;
    const x = Math.max(0, Math.floor(region.bounds.x) - 2);
    const y = Math.max(0, Math.floor(region.bounds.y) - 2);
    const right = Math.min(
      width,
      Math.ceil(region.bounds.x + region.bounds.width) + 2,
    );
    const bottom = Math.min(
      height,
      Math.ceil(region.bounds.y + region.bounds.height) + 2,
    );
    if (right <= x || bottom <= y) continue;
    const boxWidth = right - x;
    if (boxWidth <= 4) throw new Error(copy.imageOverlayTooLong);
    const boxHeight = bottom - y;
    const samples: number[][] = [[], [], [], []];
    // Sample the original ring, not a previously painted overlapping translation.
    const points = [
      [x - 2, y],
      [right + 1, y],
      [x, y - 2],
      [right - 1, y - 2],
      [x - 2, bottom - 1],
      [right + 1, bottom - 1],
      [x, bottom + 1],
      [right - 1, bottom + 1],
    ];
    for (const [sampleX, sampleY] of points) {
      const offset =
        (Math.min(height - 1, Math.max(0, sampleY!)) * width +
          Math.min(width - 1, Math.max(0, sampleX!))) *
        4;
      for (let channel = 0; channel < 4; channel++)
        samples[channel]!.push(original.data[offset + channel]!);
    }
    const color = samples.map(
      (channel) =>
        channel.sort((a, b) => a - b)[Math.floor(channel.length / 2)]!,
    );
    let fontSize = Math.min(64, Math.floor(boxHeight - 4));
    let lines: string[] = [];
    let ascent = 0,
      descent = 0,
      lineHeight = 0,
      left = 0,
      textHeight = 0;
    context.textBaseline = "alphabetic";
    for (; fontSize >= 8; fontSize--) {
      context.font = `${fontSize}px system-ui, sans-serif`;
      lines = wrapText(region.translation, {
        width: boxWidth - 4,
        measure: (text) => context.measureText(text).width,
      });
      const metrics = lines.map((line) => context.measureText(line));
      ascent = Math.max(
        fontSize * 0.8,
        ...metrics.map((metric) => metric.actualBoundingBoxAscent),
      );
      descent = Math.max(
        fontSize * 0.2,
        ...metrics.map((metric) => metric.actualBoundingBoxDescent),
      );
      left = Math.max(
        0,
        ...metrics.map((metric) => metric.actualBoundingBoxLeft),
      );
      lineHeight = Math.max(fontSize * 1.2, ascent + descent);
      textHeight =
        ascent + descent + Math.max(0, lines.length - 1) * lineHeight;
      if (
        textHeight <= boxHeight - 4 &&
        metrics.every(
          (metric) =>
            left + Math.max(metric.width, metric.actualBoundingBoxRight) <=
            boxWidth - 4,
        )
      )
        break;
    }
    if (fontSize < 8) throw new Error(copy.imageOverlayTooLong);
    context.clearRect(x, y, boxWidth, boxHeight);
    context.fillStyle = `rgba(${color.slice(0, 3).join(",")},${color[3]! / 255})`;
    context.fillRect(x, y, boxWidth, boxHeight);
    context.fillStyle =
      ((color[0]! * 0.2126 + color[1]! * 0.7152 + color[2]! * 0.0722) *
        color[3]!) /
        255 +
        255 * (1 - color[3]! / 255) >
      140
        ? "#000000"
        : "#ffffff";
    context.save();
    context.beginPath();
    context.rect(x, y, boxWidth, boxHeight);
    context.clip();
    const firstBaseline = y + (boxHeight - textHeight) / 2 + ascent;
    lines.forEach((line, index) =>
      context.fillText(line, x + 2 + left, firstBaseline + index * lineHeight),
    );
    context.restore();
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error(copy.imageCanvasUnavailable)),
      "image/png",
    ),
  );
}
