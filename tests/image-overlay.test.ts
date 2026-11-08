import { describe, expect, it } from "vitest";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { renderImageOverlay } from "../frontend/src/features/image-translation/lib/overlay";

if (existsSync("C:/Windows/Fonts/msyh.ttc"))
  GlobalFonts.registerFromPath("C:/Windows/Fonts/msyh.ttc", "system-ui");
const factory = (width: number, height: number) =>
  createCanvas(width, height) as unknown as HTMLCanvasElement;

describe("translated image PNG export", () => {
  it("keeps original dimensions and untouched pixels outside clamped OCR regions", async () => {
    const source = createCanvas(400, 160);
    const context = source.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 400, 160);
    context.fillStyle = "#000000";
    context.font = "32px Arial";
    context.fillText("HELLO WORLD", 20, 65);
    context.fillStyle = "#143b88";
    context.fillRect(20, 125, 360, 15);
    const before = context.getImageData(0, 0, 400, 160).data;
    const blob = await renderImageOverlay(
      source as unknown as CanvasImageSource,
      400,
      160,
      [
        {
          source: "HELLO WORLD",
          translation: "你好，世界",
          confidence: 99,
          bounds: { x: 18, y: 25, width: 285, height: 60 },
        },
      ],
      factory,
    );
    expect(blob.type).toBe("image/png");
    const image = await loadImage(Buffer.from(await blob.arrayBuffer()));
    expect([image.width, image.height]).toEqual([400, 160]);
    const output = createCanvas(400, 160);
    const result = output.getContext("2d");
    result.drawImage(image, 0, 0);
    const after = result.getImageData(0, 0, 400, 160).data;
    let changed = 0;
    for (let y = 0; y < 160; y++)
      for (let x = 0; x < 400; x++) {
        const offset = (y * 400 + x) * 4;
        if (x < 16 || x >= 305 || y < 23 || y >= 87)
          expect(Array.from(after.slice(offset, offset + 4))).toEqual(
            Array.from(before.slice(offset, offset + 4)),
          );
        else if (after[offset] !== before[offset]) changed++;
      }
    expect(changed).toBeGreaterThan(100);
    mkdirSync(".workspace/research", { recursive: true });
    writeFileSync(
      ".workspace/research/translated-overlay.png",
      Buffer.from(await blob.arrayBuffer()),
    );
  });

  it("preserves transparent backgrounds while replacing recognized glyphs", async () => {
    const source = createCanvas(200, 80);
    const context = source.getContext("2d");
    context.font = "30px Arial";
    context.fillStyle = "black";
    context.fillText("HI", 12, 40);
    const blob = await renderImageOverlay(
      source as unknown as CanvasImageSource,
      200,
      80,
      [
        {
          source: "HI",
          translation: "Hola",
          confidence: 99,
          bounds: { x: 10, y: 10, width: 160, height: 50 },
        },
      ],
      factory,
    );
    const image = await loadImage(Buffer.from(await blob.arrayBuffer()));
    const output = createCanvas(200, 80);
    const result = output.getContext("2d");
    result.drawImage(image, 0, 0);
    expect(result.getImageData(0, 0, 1, 1).data[3]).toBe(0);
    expect(result.getImageData(168, 58, 1, 1).data[3]).toBe(0);
    expect(
      Array.from(result.getImageData(8, 8, 164, 54).data).some(
        (value, index) => index % 4 === 3 && value > 0,
      ),
    ).toBe(true);
  });

  it("clamps partially outside boxes and refuses text that cannot fit legibly", async () => {
    const source = createCanvas(160, 100);
    const context = source.getContext("2d");
    context.fillStyle = "#333333";
    context.fillRect(0, 0, 160, 100);
    const region = {
      source: "original",
      translation: "Short",
      confidence: 95,
      bounds: { x: -10, y: -5, width: 190, height: 120 },
    };
    const output = await renderImageOverlay(
      source as unknown as CanvasImageSource,
      160,
      100,
      [region],
      factory,
    );
    const image = await loadImage(Buffer.from(await output.arrayBuffer()));
    expect([image.width, image.height]).toEqual([160, 100]);
    await expect(
      renderImageOverlay(
        source as unknown as CanvasImageSource,
        160,
        100,
        [
          {
            ...region,
            bounds: { x: 0, y: 0, width: 4, height: 4 },
            translation: "A long translation that cannot fit",
          },
        ],
        factory,
      ),
    ).rejects.toThrow();
  });
});
