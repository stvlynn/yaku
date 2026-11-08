export const modelConfig = {
  id: "DavidLuong/Hy-MT2-1.8B-ONNX-q4f16",
  revision: "cb415aec769544c3f9cefdc312142b592e731bb9",
} as const;

export const modelAssets = [
  ["config.json", 1518],
  ["tokenizer_config.json", 166491],
  ["tokenizer.json", 9527287],
  ["special_tokens_map.json", 488],
  ["generation_config.json", 221],
  ["chat_template.jinja", 654],
  ["onnx/model_q4f16.onnx", 1373443906],
] as const;

export const modelErrors = {
  storage: "Local model storage is unavailable in this browser context.",
  download: "The model download failed.",
  length: "The downloaded model file is incomplete. Retry the download.",
  unavailable:
    "The model files are not available locally. Prepare the model first.",
  gpu: "WebGPU is unavailable. Enable hardware acceleration and use a supported Chrome browser.",
  precision:
    "This GPU does not support the shader-f16 feature required by the model.",
  empty: "No translation was generated.",
  cancelled: "Cancelled",
  unsupportedWritingStyle:
    "This writing style has not been validated for the local model.",
  incomplete:
    "Generation stopped without completing the response. No partial translation was accepted.",
  context:
    "The model context window was exhausted before the response completed. No partial translation was accepted.",
  generationConfig:
    "The model does not provide valid completion token or context configuration.",
} as const;
