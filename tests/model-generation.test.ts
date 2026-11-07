import { describe, expect, it, vi } from "vitest";
import {
  DynamicCache,
  InterruptableStoppingCriteria,
  Tensor,
  ones,
} from "@huggingface/transformers";
import {
  generateComplete,
  type CompleteGenerationOptions,
} from "../frontend/src/features/local-model/generation";

const eos = 120020n;
function fixture(completion: bigint[], maxContext = 10000) {
  const generate = vi.fn(
    async ({
      input_ids,
      max_new_tokens,
    }: {
      input_ids: Tensor;
      max_new_tokens: number;
    }) => {
      const prefix = [...(input_ids.data as BigInt64Array)];
      const generated = prefix.length - 2;
      const next = completion.slice(generated, generated + max_new_tokens);
      return new Tensor(
        "int64",
        [...prefix, ...next],
        [1, prefix.length + next.length],
      );
    },
  );
  const decode = vi.fn((tensor: Tensor) => [
    [...(tensor.data as BigInt64Array)]
      .filter((token) => token !== eos)
      .map((token) => String.fromCharCode(Number(token)))
      .join(""),
  ]);
  const tokenize = vi.fn(() => ({
    input_ids: new Tensor("int64", [1n, 2n], [1, 2]),
    attention_mask: ones([1, 2]),
  }));
  const pipeline = {
    model: {
      config: { max_position_embeddings: maxContext },
      generation_config: { eos_token_id: Number(eos) },
      generate,
    },
    tokenizer: { apply_chat_template: tokenize, batch_decode: decode },
  } as unknown as CompleteGenerationOptions["pipeline"];
  return { pipeline, generate, decode, tokenize };
}

describe("complete local generation", () => {
  it("continues beyond 1024 tokens until EOS without losing the final content", async () => {
    const { pipeline, generate, tokenize } = fixture([
      ...Array<bigint>(1197).fill(65n),
      69n,
      78n,
      68n,
      eos,
    ]);
    const result = await generateComplete({
      pipeline,
      prompt: "long input",
      stopping: new InterruptableStoppingCriteria(),
      isCancelled: () => false,
    });
    expect(result).toHaveLength(1200);
    expect(result.endsWith("END")).toBe(true);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(tokenize.mock.calls[0]).toBeDefined();
    const options = (
      tokenize.mock.calls as unknown as [unknown, { truncation: boolean }][]
    )[0]![1];
    expect(options.truncation).toBe(false);
    const calls = generate.mock.calls.map(
      ([args]) =>
        args as typeof args & {
          attention_mask: Tensor;
          past_key_values: DynamicCache;
        },
    );
    expect(calls.map((call) => call.input_ids.dims[1])).toEqual([2, 514, 1026]);
    expect(
      calls.every(
        (call) => call.attention_mask.dims[1] === call.input_ids.dims[1],
      ),
    ).toBe(true);
    expect(new Set(calls.map((call) => call.past_key_values)).size).toBe(1);
  });

  it("does not accept a short output that stopped without EOS", async () => {
    const { pipeline, decode } = fixture([65n, 66n]);
    await expect(
      generateComplete({
        pipeline,
        prompt: "input",
        stopping: new InterruptableStoppingCriteria(),
        isCancelled: () => false,
      }),
    ).rejects.toThrow("without completing");
    expect(decode).not.toHaveBeenCalled();
  });

  it("never reports a context-exhausted partial sequence as success", async () => {
    const { pipeline, decode } = fixture(Array<bigint>(30).fill(65n), 8);
    await expect(
      generateComplete({
        pipeline,
        prompt: "input",
        stopping: new InterruptableStoppingCriteria(),
        isCancelled: () => false,
      }),
    ).rejects.toThrow("context window");
    expect(decode).not.toHaveBeenCalled();
  });

  it("disposes the persistent KV cache on cancellation instead of returning partial text", async () => {
    const { pipeline, generate, decode } = fixture(Array<bigint>(20).fill(65n));
    let cancelled = false;
    const base = generate.getMockImplementation()!;
    generate.mockImplementation(async (args) => {
      const output = await base(args);
      cancelled = true;
      return output;
    });
    const dispose = vi.spyOn(DynamicCache.prototype, "dispose");
    try {
      await expect(
        generateComplete({
          pipeline,
          prompt: "input",
          stopping: new InterruptableStoppingCriteria(),
          isCancelled: () => cancelled,
          windowTokens: 8,
        }),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(dispose).toHaveBeenCalledOnce();
      expect(decode).not.toHaveBeenCalled();
    } finally {
      dispose.mockRestore();
    }
  });
});
