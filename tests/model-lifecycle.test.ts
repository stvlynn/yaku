import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => ({
  models: [] as { disposed: boolean }[],
  generate: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("@huggingface/transformers", () => ({
  env: { backends: { onnx: { wasm: {} } } },
  AutoModelForCausalLM: {
    from_pretrained: async () => {
      const model = { disposed: false };
      probe.models.push(model);
      return model;
    },
  },
  PreTrainedTokenizer: class {},
  InterruptableStoppingCriteria: class {
    reset() {}
    interrupt() {}
  },
  TextGenerationPipeline: class {
    model: { disposed: boolean };
    constructor({ model }: { model: { disposed: boolean } }) {
      this.model = model;
    }
    async dispose() {
      this.model.disposed = true;
    }
  },
}));
vi.mock("../frontend/src/features/local-model/generation", () => ({
  generateComplete: probe.generate,
}));
vi.mock("../frontend/src/features/local-model/storage", () => ({
  downloadModel: async () => {},
  fetchModelAsset: async () => Response.json({}),
  cacheInfo: vi.fn(),
  clearModelCache: probe.clear,
}));
import { createLocalModel } from "../frontend/src/features/local-model";

beforeEach(() => {
  vi.clearAllMocks();
  probe.models.length = 0;
  probe.clear.mockImplementation(async () => {});
  vi.stubGlobal("navigator", {
    gpu: {
      requestAdapter: async () => ({ features: new Set(["shader-f16"]) }),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("model lifecycle serialization", () => {
  it("does not hand a disposed session to a translation arriving during unload", async () => {
    let finish!: (value: string) => void;
    probe.generate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    probe.generate.mockImplementation(async ({ pipeline }) => {
      if (pipeline.model.disposed) throw new Error("Disposed GPU session");
      return "Fresh session";
    });
    const model = createLocalModel(vi.fn(), "/wasm/");
    const first = model.translate({
      id: "first",
      text: "Hello",
      targetLanguage: "zh",
    });
    const firstRejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(probe.generate).toHaveBeenCalledOnce());
    const unloading = model.unload();
    const next = model.translate({
      id: "next",
      text: "Again",
      targetLanguage: "zh",
    });
    finish("Old session");
    await firstRejected;
    await unloading;
    await expect(next).resolves.toMatchObject({ text: "Fresh session" });
    expect(probe.models).toHaveLength(2);
    expect(probe.models[0]?.disposed).toBe(true);
    expect(probe.models[1]?.disposed).toBe(false);
    await model.unload();
  });
  it("waits for cache removal before a standalone preparation can begin", async () => {
    let finish!: () => void;
    probe.clear.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const model = createLocalModel(vi.fn(), "/wasm/");
    await model.prepare();
    const clearing = model.clearCache();
    await vi.waitFor(() => expect(probe.clear).toHaveBeenCalledOnce());
    const preparing = model.prepare();
    await Promise.resolve();
    expect(probe.models).toHaveLength(1);
    finish();
    await clearing;
    await preparing;
    expect(probe.models).toHaveLength(2);
    expect(probe.models[1]?.disposed).toBe(false);
    await model.unload();
  });
});
