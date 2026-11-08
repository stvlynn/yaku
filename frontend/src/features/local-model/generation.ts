import {
  DynamicCache,
  Tensor,
  ones,
  type InterruptableStoppingCriteria,
  type TextGenerationPipeline,
} from "@huggingface/transformers";
import { modelErrors } from "./config";

export interface CompleteGenerationOptions {
  pipeline: Pick<TextGenerationPipeline, "model" | "tokenizer">;
  prompt: string;
  stopping: InterruptableStoppingCriteria;
  isCancelled: () => boolean;
  windowTokens?: number;
}

/** A generation window is a scheduling boundary, never a completion boundary. */
export async function generateComplete({
  pipeline,
  prompt,
  stopping,
  isCancelled,
  windowTokens = 512,
}: CompleteGenerationOptions): Promise<string> {
  const { model, tokenizer } = pipeline;
  const encoded = tokenizer.apply_chat_template(
    [{ role: "user", content: prompt }],
    {
      add_generation_prompt: true,
      return_dict: true,
      truncation: false,
    },
  );
  let inputIds = encoded.input_ids;
  let attentionMask = encoded.attention_mask;
  const promptLength = inputIds.dims[1]!;
  const maxContext = model.config.max_position_embeddings;
  const eos = model.generation_config?.eos_token_id;
  const eosTokens = typeof eos === "number" ? [eos] : eos;
  if (
    !Array.isArray(eosTokens) ||
    !eosTokens.length ||
    !Number.isSafeInteger(maxContext) ||
    maxContext < 1 ||
    !Number.isSafeInteger(windowTokens) ||
    windowTokens < 1
  )
    throw new Error(modelErrors.generationConfig);
  const cache = new DynamicCache();
  const checkCancelled = () => {
    if (isCancelled())
      throw new DOMException(modelErrors.cancelled, "AbortError");
  };
  try {
    while (true) {
      checkCancelled();
      const previousLength = inputIds.dims[1]!;
      const budget = Math.min(windowTokens, maxContext - previousLength);
      if (budget < 1) throw new Error(modelErrors.context);
      const output = await model.generate({
        input_ids: inputIds,
        attention_mask: attentionMask,
        past_key_values: cache,
        max_new_tokens: budget,
        do_sample: false,
        stopping_criteria: stopping,
      });
      checkCancelled();
      if (!(output instanceof Tensor) || output.type !== "int64")
        throw new Error(modelErrors.incomplete);
      const length = output.dims[1]!;
      if (length <= previousLength) throw new Error(modelErrors.incomplete);
      const lastToken = Number((output.data as BigInt64Array)[length - 1]);
      if (eosTokens.includes(lastToken)) {
        const text = tokenizer.batch_decode(
          output.slice(null, [promptLength, length]),
          { skip_special_tokens: true },
        )[0];
        if (!text?.trim()) throw new Error(modelErrors.empty);
        return text.trim();
      }
      if (length - previousLength !== budget)
        throw new Error(modelErrors.incomplete);
      inputIds = output;
      attentionMask = ones([1, length]);
    }
  } finally {
    await cache.dispose();
  }
}
