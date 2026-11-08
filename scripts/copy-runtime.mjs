import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { mkdir, copyFile, rm } from "node:fs/promises";

const require = createRequire(import.meta.url);
const transformerRequire = createRequire(
  require.resolve("@huggingface/transformers"),
);
const runtimeDirectory = dirname(transformerRequire.resolve("onnxruntime-web"));
const destination = new URL("../public/wasm/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const filename of [
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
]) {
  await rm(new URL(filename, destination), { force: true });
}
for (const filename of [
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
]) {
  await copyFile(
    join(runtimeDirectory, filename),
    new URL(filename, destination),
  );
}
