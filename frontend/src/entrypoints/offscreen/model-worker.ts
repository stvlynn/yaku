import { createLocalModel } from "../../features/local-model";
import type { TranslationRequest } from "../../entities/translation";
import { errorReply } from "../../shared/messaging";

let model: ReturnType<typeof createLocalModel>;
self.onmessage = ({ data }) => {
  if (data.action === "initialize") {
    model = createLocalModel(
      (status) => self.postMessage({ action: "status", status }),
      data.wasmPath,
    );
    return;
  }
  const operation = async () => {
    switch (data.action) {
      case "prepare":
        await model.prepare();
        return null;
      case "translate":
        return model.translate(data.payload as TranslationRequest);
      case "cancel":
        model.cancel(String(data.payload));
        return null;
      case "cancel-download":
        model.cancelDownload();
        return null;
      case "unload-model":
        await model.unload();
        return null;
      case "clear-model-cache":
        await model.clearCache();
        return null;
      case "cache-info":
        return model.cacheInfo();
      default:
        throw new Error("Unknown model request.");
    }
  };
  void operation().then(
    (value) => self.postMessage({ id: data.id, reply: { ok: true, value } }),
    (error) =>
      self.postMessage({
        id: data.id,
        reply: errorReply(error),
      }),
  );
};
