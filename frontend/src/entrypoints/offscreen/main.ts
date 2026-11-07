import ModelWorker from "./model-worker?worker";
import { isEnvelope, request, errorReply } from "../../shared/messaging";
import { ocrLanguageFor } from "../../entities/translation";
import type { Settings } from "../../entities/settings";
import { copy } from "../../shared/i18n";

const images = new Map<string, AbortController>();
async function translatePageImage(payload: {
  id: string;
  url: string;
  settings: Settings;
}) {
  const controller = new AbortController();
  images.set(payload.id, controller);
  try {
    if (!/^(https?:|file:|data:image\/)/.test(payload.url))
      throw new Error(copy.imageAccessFailed);
    const response = await fetch(payload.url, {
      signal: controller.signal,
      credentials: "omit",
    });
    if (!response.ok) throw new Error(copy.imageAccessFailed);
    const file = new File([await response.blob()], "image.png", {
      type: response.headers.get("Content-Type")?.split(";")[0] ?? "",
    });
    const { translateImage } = await import("../../features/image-translation");
    const result = await translateImage(file, {
      signal: controller.signal,
      targetLanguage: payload.settings.targetLanguage,
      sourceLanguage: payload.settings.sourceLanguage,
      ocrLanguage: ocrLanguageFor(payload.settings.sourceLanguage),
      translate: async (input) => {
        const abort = () => {
          void request({
            destination: "background",
            action: "cancel",
            payload: input.id,
          });
        };
        controller.signal.addEventListener("abort", abort, { once: true });
        try {
          return await request({
            destination: "background",
            action: "translate",
            payload: { ...input, glossary: payload.settings.glossary },
          });
        } finally {
          controller.signal.removeEventListener("abort", abort);
        }
      },
    });
    controller.signal.throwIfAborted();
    if (!result.source.trim())
      throw new DOMException(copy.imageNoText, "ImageNoTextError");
    const blob = await result.exportPng();
    controller.signal.throwIfAborted();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } finally {
    images.delete(payload.id);
  }
}

const worker = new ModelWorker();
const pending = new Map<string, (reply: unknown) => void>();
worker.postMessage({
  action: "initialize",
  wasmPath: chrome.runtime.getURL("wasm/"),
});
worker.onmessage = ({ data }) => {
  if (data.action === "status") {
    void chrome.runtime.sendMessage({
      destination: "background",
      action: "model-status",
      payload: data.status,
    });
    return;
  }
  pending.get(data.id)?.(data.reply);
  pending.delete(data.id);
};
worker.onerror = (error) => {
  for (const respond of pending.values())
    respond({ ok: false, error: error.message });
  pending.clear();
};
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (!isEnvelope(message) || message.destination !== "offscreen") return;
  if (sender.id !== chrome.runtime.id || sender.tab) return;
  if (message.action === "translate-image") {
    void translatePageImage(
      message.payload as Parameters<typeof translatePageImage>[0],
    ).then(
      (value) => respond({ ok: true, value }),
      (error) => respond(errorReply(error)),
    );
    return true;
  }
  if (message.action === "cancel-image") {
    images.get(String(message.payload))?.abort();
    respond({ ok: true, value: null });
    return;
  }
  const id = crypto.randomUUID();
  pending.set(id, respond);
  worker.postMessage({ ...message, id });
  return true;
});
