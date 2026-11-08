import { modelAssets, modelConfig, modelErrors } from "./config";
import type { ModelStatus } from "../../entities/translation";

const directoryName = `yaku-model-${modelConfig.revision}`;
const sourcePrefix = `https://huggingface.co/${modelConfig.id}/resolve/${modelConfig.revision}/`;
const filename = (path: string) => path.replaceAll("/", "--");
const missing = (error: unknown) =>
  error instanceof DOMException && error.name === "NotFoundError";

async function directory(create = true): Promise<FileSystemDirectoryHandle> {
  if (!navigator.storage?.getDirectory) throw new Error(modelErrors.storage);
  return (await navigator.storage.getDirectory()).getDirectoryHandle(
    directoryName,
    { create },
  );
}

async function storedFile(
  folder: FileSystemDirectoryHandle,
  path: string,
): Promise<File | undefined> {
  try {
    return await (await folder.getFileHandle(filename(path))).getFile();
  } catch (error) {
    if (missing(error)) return undefined;
    throw error;
  }
}

export async function cacheInfo() {
  let bytes = 0;
  let count = 0;
  try {
    const folder = await directory(false);
    for (const [path, size] of modelAssets) {
      const file = await storedFile(folder, path);
      if (file?.size === size) {
        bytes += size;
        count++;
      }
    }
  } catch (error) {
    if (!missing(error)) throw error;
  }
  return {
    complete: count === modelAssets.length,
    bytes,
    total: modelAssets.reduce((sum, [, size]) => sum + size, 0),
  };
}

export async function downloadModel(
  signal: AbortSignal,
  onStatus: (status: ModelStatus) => void,
) {
  const folder = await directory();
  const total = modelAssets.reduce((sum, [, size]) => sum + size, 0);
  let loaded = 0;
  for (const [path, size] of modelAssets) {
    signal.throwIfAborted();
    const cached = await storedFile(folder, path);
    if (cached?.size === size) {
      loaded += size;
      continue;
    }
    const response = await fetch(sourcePrefix + path, { signal });
    if (!response.ok || !response.body)
      throw new Error(`${modelErrors.download} (${response.status}, ${path})`);
    const reader = response.body.getReader();
    let writer: FileSystemWritableFileStream | undefined;
    let fileBytes = 0;
    let lastReported = -1;
    try {
      const handle = await folder.getFileHandle(filename(path), {
        create: true,
      });
      writer = await handle.createWritable();
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
        fileBytes += value.byteLength;
        if (fileBytes > size) throw new Error(modelErrors.length);
        const progress = Math.floor(((loaded + fileBytes) / total) * 1000) / 10;
        if (progress !== lastReported) {
          onStatus({ phase: "downloading", file: path, progress });
          lastReported = progress;
        }
      }
      if (fileBytes !== size) throw new Error(modelErrors.length);
      signal.throwIfAborted();
      await writer.close();
      const committed = await handle.getFile();
      if (committed.size !== size) throw new Error(modelErrors.length);
    } catch (error) {
      // An errored stream can reject cancellation; both resources still need cleanup.
      await Promise.allSettled([reader.cancel(error), writer?.abort(error)]);
      throw error;
    } finally {
      reader.releaseLock();
    }
    loaded += size;
  }
  const state = await cacheInfo();
  if (!state.complete) throw new Error(modelErrors.length);
}

/** Supply model data from OPFS; runtime modules and WASM stay packaged. */
export async function fetchModelAsset(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = String(input);
  if (!url.startsWith(sourcePrefix)) return fetch(input, init);
  const path = url.slice(sourcePrefix.length).replace(/\?.*$/, "");
  const asset = modelAssets.find(([name]) => name === path);
  if (!asset) return new Response(null, { status: 404 });
  const file = await storedFile(await directory(false), path);
  if (file?.size !== asset[1]) throw new Error(modelErrors.unavailable);
  return new Response(init?.method === "HEAD" ? null : file, {
    headers: {
      "Content-Length": String(file.size),
      "Content-Type": path.endsWith(".json")
        ? "application/json"
        : "application/octet-stream",
    },
  });
}

export async function clearModelCache() {
  try {
    await (
      await navigator.storage.getDirectory()
    ).removeEntry(directoryName, { recursive: true });
  } catch (error) {
    if (!missing(error)) throw error;
  }
}
