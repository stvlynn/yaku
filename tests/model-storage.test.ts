import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadModel } from "../frontend/src/features/local-model/storage";

afterEach(() => vi.unstubAllGlobals());
function storage(createWritable: () => Promise<unknown>) {
  const folder = {
    getFileHandle: async (_name: string, options?: { create?: boolean }) => {
      if (!options?.create) throw new DOMException("Missing", "NotFoundError");
      return { createWritable, getFile: async () => new File([], "partial") };
    },
  };
  vi.stubGlobal("navigator", {
    storage: {
      getDirectory: async () => ({ getDirectoryHandle: async () => folder }),
    },
  });
}

describe("model download failure cleanup", () => {
  it("aborts the OPFS writer even when the errored response rejects reader cancellation", async () => {
    const failure = new Error("Connection lost");
    const abort = vi.fn(async () => {});
    storage(async () => ({ write: vi.fn(), close: vi.fn(), abort }));
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.error(failure);
              },
            }),
          ),
      ),
    );
    await expect(
      downloadModel(new AbortController().signal, vi.fn()),
    ).rejects.toBe(failure);
    expect(abort).toHaveBeenCalledExactlyOnceWith(failure);
  });
  it("cancels the response when OPFS cannot allocate a writer and preserves the quota error", async () => {
    const failure = new DOMException(
      "Disk quota exceeded",
      "QuotaExceededError",
    );
    const cancel = vi.fn();
    storage(async () => {
      throw failure;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new ReadableStream({ cancel }))),
    );
    await expect(
      downloadModel(new AbortController().signal, vi.fn()),
    ).rejects.toBe(failure);
    expect(cancel).toHaveBeenCalledExactlyOnceWith(failure);
  });
  it("releases both resources when a write fails without replacing the original error", async () => {
    const failure = new DOMException("Disk full", "QuotaExceededError");
    const abort = vi.fn(async () => {
      throw new Error("Writer already closed");
    });
    const cancel = vi.fn();
    storage(async () => ({
      write: async () => {
        throw failure;
      },
      abort,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array([1]));
              },
              cancel,
            }),
          ),
      ),
    );
    await expect(
      downloadModel(new AbortController().signal, vi.fn()),
    ).rejects.toBe(failure);
    expect(abort).toHaveBeenCalledExactlyOnceWith(failure);
    expect(cancel).toHaveBeenCalledExactlyOnceWith(failure);
  });
});
