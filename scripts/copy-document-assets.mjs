import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { mkdir, copyFile, cp, readdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const ocrRoot = dirname(require.resolve('tesseract.js/package.json'));
const ocrRequire = createRequire(require.resolve('tesseract.js'));
const coreRoot = dirname(ocrRequire.resolve('tesseract.js-core/package.json'));
const pdfRoot = dirname(require.resolve('pdfjs-dist/package.json'));
const ocrDestination = new URL('../public/ocr/', import.meta.url);
const coreDestination = new URL('core/', ocrDestination);
const pdfDestination = new URL('../public/pdf/', import.meta.url);
await Promise.all([mkdir(coreDestination, { recursive: true }), mkdir(pdfDestination, { recursive: true })]);
await copyFile(join(ocrRoot, 'dist/worker.min.js'), new URL('worker.min.js', ocrDestination));
for (const filename of await readdir(coreRoot)) {
  if (/^tesseract-core.*\.wasm(?:\.js)?$/.test(filename)) await copyFile(join(coreRoot, filename), new URL(filename, coreDestination));
}
await copyFile(join(pdfRoot, 'legacy/build/pdf.worker.mjs'), new URL('pdf.worker.mjs', pdfDestination));
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) await cp(join(pdfRoot, folder), new URL(`${folder}/`, pdfDestination), { recursive: true });
