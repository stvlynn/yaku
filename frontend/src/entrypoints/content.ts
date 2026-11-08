import {
  createPageTranslator,
  reliableLanguageObservation,
} from "../features/page-translation";
import { installContextTranslation } from "../features/context-translation";
import {
  installVideoSubtitles,
  chooseSubtitleTrack,
} from "../features/video-subtitles";
import { installFloatingControl } from "../features/floating-control";
import { installPageImages } from "../features/page-images";
import { readSettings, onSettingsChanged } from "../features/preferences";
import { request, isEnvelope, errorReply } from "../shared/messaging";
import type { Translate } from "../entities/translation";
import {
  resolveGlossary,
  resolveSourceLanguagePolicy,
  type Settings,
} from "../entities/settings";
import type { TemporaryTranslation } from "../features/temporary-translation";

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
      if (error instanceof Error && error.name === "AbortError") return;
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
      onTrackSelectionRequired: (selection) =>
        chooseSubtitleTrack(selection, getSettings().theme),
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
    let manualRevision = 0;
    let editingRevision = 0;
    async function translateManually(
      wholePage = false,
      articleContext = false,
    ) {
      manualRevision++;
      void page.translatePage({ wholePage, articleContext }).catch(onError);
      if (
        window.top === window &&
        page.isActive() &&
        settings.temporaryDomainMinutes > 0
      )
        await request({
          destination: "background",
          action: "start-temporary-translation",
        });
    }
    function restorePage() {
      manualRevision++;
      page.restore();
    }
    floating = installFloatingControl({
      document,
      getSettings,
      isTranslated: () => page.isActive(),
      onToggle: async () => {
        await request({
          destination: "background",
          action: "translate-page-frames",
          payload: page.isActive() ? "restore-page" : "translate-page",
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
              await translateManually();
              return page.isActive();
            case "translate-page-with-context":
              await translateManually(false, true);
              return page.isActive();
            case "translate-whole-page":
              await translateManually(true);
              return page.isActive();
            case "restore-page":
              restorePage();
              return;
            case "toggle-page":
              if (page.isActive()) restorePage();
              else await translateManually();
              return;
            case "translate-selection":
              await context.translateSelection();
              return;
            case "translate-input":
              await context.translateInput();
              return;
            case "page-state":
              return page.isActive();
            case "page-editing-state":
              return page.isEditing();
            case "set-page-editing":
              if (typeof message.payload !== "boolean")
                throw new TypeError("Expected an editing state.");
              editingRevision++;
              page.setEditing(message.payload);
              return page.isEditing();
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
    if (window.top !== window) {
      const revision = editingRevision;
      void request<boolean | null>({
        destination: "background",
        action: "inherit-page-editing",
      }).then(
        (enabled) => {
          if (revision === editingRevision && enabled !== null)
            page.setEditing(enabled);
        },
        (error) => {
          if (revision === editingRevision) onError(error);
        },
      );
    }
    const rule = settings.siteRules.find(
      (item) =>
        location.hostname === item.hostname ||
        location.hostname.endsWith(`.${item.hostname}`),
    );
    const revision = manualRevision;
    void (async () => {
      if (rule?.action === "never") return;
      let observation: Parameters<typeof resolveSourceLanguagePolicy>[1] = {
        language: settings.sourceLanguage,
        reliable: settings.sourceLanguage !== "auto",
      };
      if (
        settings.sourceLanguage === "auto" &&
        (settings.alwaysSourceLanguages.length ||
          settings.neverSourceLanguages.length)
      ) {
        const detection = await chrome.i18n.detectLanguage(
          document.body.innerText,
        );
        observation = reliableLanguageObservation(detection);
      }
      const policy = resolveSourceLanguagePolicy(settings, observation);
      if (policy === "never") return;
      const temporary = await request<TemporaryTranslation | null>({
        destination: "background",
        action: "temporary-translation-state",
      });
      if (revision !== manualRevision) return;
      if (
        rule?.action === "always" ||
        policy === "always" ||
        temporary ||
        settings.autoTranslate
      ) {
        void page.translatePage().catch(onError);
        floating?.refresh();
      }
    })().catch(onError);
    ctx.onInvalidated(() => {
      manualRevision++;
      editingRevision++;
      remove();
      context.dispose();
      page.dispose();
      subtitles.dispose();
      images.dispose();
      floating?.dispose();
    });
  },
});
