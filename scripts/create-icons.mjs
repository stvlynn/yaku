import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Languages } from 'lucide-react';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const tokens = await readFile(new URL('../frontend/src/shared/styles/tokens.css', import.meta.url), 'utf8');
function token(name) {
  const value = tokens.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];
  if (!value) throw new Error(`Missing icon token: ${name}`);
  return value;
}
const svg = renderToStaticMarkup(createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 128, height: 128, viewBox: '0 0 128 128' },
  createElement('rect', { width: 128, height: 128, rx: 28, fill: token('yellow-500') }),
  createElement(Languages, { x: 24, y: 24, width: 80, height: 80, color: token('ink-900'), strokeWidth: 1.8 }),
));
const directory = new URL('../public/icon/', import.meta.url);
await mkdir(directory, { recursive: true });
const image = await loadImage(Buffer.from(svg));
for (const size of [16, 32, 48, 128]) {
  const canvas = createCanvas(size, size);
  canvas.getContext('2d').drawImage(image, 0, 0, size, size);
  await writeFile(new URL(`${size}.png`, directory), await canvas.encode('png'));
}
