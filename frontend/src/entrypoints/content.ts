import { createPageTranslator } from "../features/page-translation";
import { installContextTranslation } from "../features/context-translation";
import { installVideoSubtitles } from "../features/video-subtitles";
import { installFloatingControl } from "../features/floating-control";
import { installPageImages } from "../features/page-images";
import { readSettings, onSettingsChanged } from "../features/preferences";
import { request, isEnvelope, errorReply } from "../shared/messaging";
import type { Translate } from "../entities/translation";
import { resolveGlossary, type Settings } from "../entities/settings";

export default defineContentScript({
  matches: ["<all_urls>"],
  allFrames: true,
  matchAboutBlank: true,
  main: async (ctx) => {
    let settings = await readSettings();
    let effectiveSettings: Settings;
    let effectiveSource: Settings | undefined;
    let effectiveUrl = "";
    const getSettings = () => {
      if (effectiveSource !== settings || effectiveUrl !== location.href) {
        effectiveSource = settings;
        effectiveUrl = location.href;
        effectiveSettings = {
          ...settings,
          glossary: resolveGlossary(settings, {
            targetLanguage: settings.targetLanguage,
            url: effectiveUrl,
          }),
        };
      }
      return effectiveSettings;
    };
    const translate: Translate = (payload) =>
      request({ destination: "background", action: "translate", payload });
    let floating: ReturnType<typeof installFloatingControl> | undefined;
    const onError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (window.top !== window)
        void request({
          destination: "background",
          action: "page-error",
          payload: message,
        });
      else floating?.showError(message);
    };
    const page = createPageTranslator({
      document,
      translate,
      detectLanguage: (text) => chrome.i18n.detectLanguage(text),
      getSettings,
      onError,
      cancel: (payload) =>
        request<void>({ destination: "background", action: "cancel", payload }),
    });
    const context = installContextTranslation({
      document,
      translate,
      getSettings,
      onError,
      cancel: (payload) =>
        request<void>({ destination: "background", action: "cancel", payload }),
    });
    const subtitles = installVideoSubtitles({
      document,
      translate,
      getSettings,
      onError,
    });
    const images = installPageImages({
      document,
      getSettings,
      translate: (id, data) =>
        request({
          destination: "background",
          action: "translate-page-image",
          payload: { id, data },
        }),
      translateBatchImage: (payload) =>
        request({
          destination: "background",
          action: "translate-batch-image",
          payload,
        }),
      cancelBatch: (sessionId) =>
        request({
          destination: "background",
          action: "cancel-image-batch",
          payload: { sessionId },
        }),
      cancel: (id) =>
        request({
          destination: "background",
          action: "cancel-page-image",
          payload: { id },
        }),
    });
    let active = false;
    floating = installFloatingControl({
      document,
      getSettings,
      isTranslated: () => active,
      onToggle: async () => {
        await request({
          destination: "background",
          action: "translate-page-frames",
          payload: active ? "restore-page" : "translate-page",
        });
      },
      onOpenWorkspace: () => {
        void request({ destination: "background", action: "open-workspace" });
      },
    });
    const remove = onSettingsChanged((next) => {
      settings = next;
      page.setMode(next.mode);
      subtitles.refresh();
      images.refresh();
      floating?.refresh();
    }, onError);
    chrome.runtime.onMessage.addListener(
      (message: unknown, _sender, respond) => {
        if (!isEnvelope(message) || message.destination !== "content") return;
        const operation = async () => {
          switch (message.action) {
            case "show-error":
              floating?.showError(String(message.payload));
              return;
            case "translate-image": {
              const payload = message.payload as { id: string; url: string };
              void images.start(payload.id, payload.url).catch(onError);
              return;
            }
            case "translate-page-images":
              images.startBatch(
                (message.payload as { sessionId: string }).sessionId,
              );
              return;
            case "restore-page-images":
              images.restore();
              return;
            case "pretranslate-subtitles":
              void subtitles.pretranslate({ all: true }).catch(onError);
              return;
            case "download-subtitles": {
              void subtitles
                .exportSubtitles({ format: "vtt", mode: "bilingual" })
                .then(({ blob, name }) => {
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = name;
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                })
                .catch(onError);
              return;
            }
            case "translate-page":
              active = true;
              void page.translatePage().catch(onError);
              return;
            case "translate-whole-page":
              active = true;
              void page.translatePage({ wholePage: true }).catch(onError);
              return;
            case "restore-page":
              active = false;
              page.restore();
              return;
            case "toggle-page":
              if (active) page.restore();
              else void page.translatePage().catch(onError);
              active = !active;
              return;
            case "translate-selection":
              await context.translateSelection();
              return;
            case "translate-input":
              await context.translateInput();
              return;
            case "page-state":
              return active;
            default:
              throw new Error("Unknown page request.");
          }
        };
        void operation().then(
          (value) => {
            floating?.refresh();
            respond({ ok: true, value });
          },
          (error) => respond(errorReply(error)),
        );
        return true;
      },
    );
    const rule = settings.siteRules.find(
      (item) =>
        location.hostname === item.hostname ||
        location.hostname.endsWith(`.${item.hostname}`),
    );
    if (
      rule?.action === "always" ||
      (settings.autoTranslate && rule?.action !== "never")
    ) {
      active = true;
      void page.translatePage().catch(onError);
    }
    ctx.onInvalidated(() => {
      remove();
      context.dispose();
      page.dispose();
      subtitles.dispose();
      images.dispose();
      floating?.dispose();
    });
  },
});
