import { isEnvelope, request, errorReply } from "../shared/messaging";
import type { ModelStatus } from "../entities/translation";
import { resolveGlossary } from "../entities/settings";
import { copy } from "../shared/i18n";
import { installPreferencesSync, readSettings } from "../features/preferences";
import { createTemporaryTranslationStore } from "../features/temporary-translation";

export default defineBackground(() => {
  const temporaryTranslation = createTemporaryTranslationStore(
    chrome.storage.local,
  );
  const imageRequests = new Map<
    string,
    { url: string; tab: number; frame: number; batch?: string }
  >();
  const imageBatchKey = (id: string) => `imageBatch:${id}`;
  const getImageBatch = async (id: string) => {
    const key = imageBatchKey(id);
    return (await chrome.storage.session.get(key))[key] as
      { tab: number; frame: number } | undefined;
  };
  installPreferencesSync();
  let creating: Promise<void> | undefined;
  async function ensureModel() {
    if (creating) return creating;
    creating = (async () => {
      if (!(await chrome.offscreen.hasDocument())) {
        await chrome.offscreen.createDocument({
          url: "offscreen.html",
          reasons: [
            chrome.offscreen.Reason.WORKERS,
            chrome.offscreen.Reason.BLOBS,
          ],
          justification: "Run local translation while the popup is closed.",
        });
      }
    })();
    try {
      await creating;
    } finally {
      creating = undefined;
    }
  }
  chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (!isEnvelope(message) || message.destination !== "background") return;
    if (sender.id !== chrome.runtime.id) return;
    const operation = async () => {
      if (
        [
          "temporary-translation-state",
          "start-temporary-translation",
          "stop-temporary-translation",
        ].includes(message.action)
      ) {
        const target =
          sender.tab ??
          (await chrome.tabs.get((message.payload as { tabId: number }).tabId));
        const url = new URL(
          sender.tab
            ? (sender.url ?? target.url ?? "about:blank")
            : (target.url ?? "about:blank"),
        );
        if (!["http:", "https:"].includes(url.protocol)) return null;
        if (message.action === "start-temporary-translation") {
          if (!sender.tab) throw new Error(copy.pageUnavailable);
          const settings = await readSettings();
          return (
            (await temporaryTranslation.start(
              url.hostname,
              settings.temporaryDomainMinutes,
            )) ?? null
          );
        }
        if (message.action === "stop-temporary-translation") {
          await temporaryTranslation.stop(url.hostname);
          return null;
        }
        return (await temporaryTranslation.read(url.hostname)) ?? null;
      }
      if (message.action === "cancel-image-batch") {
        const { sessionId } = message.payload as { sessionId: string };
        const session = await getImageBatch(sessionId);
        if (!session) return null;
        if (session.tab !== sender.tab?.id || session.frame !== sender.frameId)
          throw new Error(copy.imageTargetMissing);
        await chrome.storage.session.remove(imageBatchKey(sessionId));
        const children = [...imageRequests].filter(
          ([, grant]) => grant.batch === sessionId,
        );
        for (const [id] of children) imageRequests.delete(id);
        if (children.length) {
          await ensureModel();
          await Promise.all(
            children.map(([id]) =>
              request({
                destination: "offscreen",
                action: "cancel-image",
                payload: id,
              }),
            ),
          );
        }
        return null;
      }
      if (message.action === "translate-batch-image") {
        const payload = message.payload as {
          sessionId: string;
          id: string;
          url: string;
        };
        if (
          !payload ||
          typeof payload.sessionId !== "string" ||
          typeof payload.id !== "string" ||
          typeof payload.url !== "string"
        )
          throw new Error(copy.imageTargetMissing);
        const session = await getImageBatch(payload.sessionId);
        if (
          !session ||
          session.tab !== sender.tab?.id ||
          session.frame !== sender.frameId ||
          imageRequests.has(payload.id)
        )
          throw new Error(copy.imageTargetMissing);
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: session.tab, frameIds: [session.frame] },
          args: [payload.url],
          func: (url: string) => {
            const roots: (Document | ShadowRoot)[] = [document];
            for (const root of roots) {
              for (const element of root.querySelectorAll("*"))
                if (element.shadowRoot) roots.push(element.shadowRoot);
              for (const image of root.querySelectorAll("img")) {
                if (
                  (image.currentSrc || image.src) !== url ||
                  !image.complete ||
                  !image.naturalWidth
                )
                  continue;
                const bounds = image.getBoundingClientRect();
                const style = getComputedStyle(image);
                if (
                  bounds.width > 0 &&
                  bounds.height > 0 &&
                  bounds.bottom >= -600 &&
                  bounds.top <= innerHeight + 600 &&
                  bounds.right >= 0 &&
                  bounds.left <= innerWidth &&
                  style.visibility !== "hidden" &&
                  style.display !== "none"
                )
                  return true;
              }
            }
            return false;
          },
        });
        if (!result?.result || !(await getImageBatch(payload.sessionId)))
          throw new Error(copy.imageTargetMissing);
        imageRequests.set(payload.id, {
          ...session,
          url: payload.url,
          batch: payload.sessionId,
        });
      }
      if (
        message.action === "translate-page-image" ||
        message.action === "translate-batch-image" ||
        message.action === "cancel-page-image"
      ) {
        const payload = message.payload as
          { id?: string; data?: string } | undefined;
        const grant = payload?.id ? imageRequests.get(payload.id) : undefined;
        if (!grant && message.action === "cancel-page-image") return null;
        if (
          !grant ||
          grant.tab !== sender.tab?.id ||
          grant.frame !== sender.frameId
        )
          throw new Error(copy.imageTargetMissing);
        await ensureModel();
        if (message.action === "cancel-page-image") {
          imageRequests.delete(payload!.id!);
          return request({
            destination: "offscreen",
            action: "cancel-image",
            payload: payload!.id,
          });
        }
        try {
          const saved = await readSettings();
          const settings = {
            ...saved,
            glossary: resolveGlossary(saved, {
              targetLanguage: saved.targetLanguage,
              url: sender.url,
            }),
          };
          if (!imageRequests.has(payload!.id!))
            throw new DOMException("Aborted", "AbortError");
          return await request({
            destination: "offscreen",
            action: "translate-image",
            payload: {
              id: payload!.id,
              url: grant.url.startsWith("blob:") ? payload!.data : grant.url,
              settings,
            },
          });
        } finally {
          imageRequests.delete(payload!.id!);
        }
      }
      if (message.action === "open-workspace") {
        await chrome.tabs.create({
          url: chrome.runtime.getURL("workspace.html"),
        });
        return null;
      }
      if (message.action === "translate-page-frames") {
        if (
          sender.tab?.id === undefined ||
          !["translate-page", "restore-page"].includes(String(message.payload))
        )
          throw new Error(copy.pageUnavailable);
        const reply = await chrome.tabs.sendMessage(sender.tab.id, {
          destination: "content",
          action: String(message.payload),
        });
        if (!reply?.ok) throw new Error(reply?.error ?? copy.pageUnavailable);
        return null;
      }
      if (message.action === "inherit-page-editing") {
        if (sender.tab?.id === undefined || sender.frameId === 0)
          throw new Error(copy.pageUnavailable);
        try {
          const reply = await chrome.tabs.sendMessage(
            sender.tab.id,
            { destination: "content", action: "page-editing-state" },
            { frameId: 0 },
          );
          if (!reply?.ok || typeof reply.value !== "boolean")
            throw new Error(reply?.error ?? copy.pageUnavailable);
          return reply.value;
        } catch (error) {
          // A child can initialize before the top document's content script.
          if (
            error instanceof Error &&
            error.message.includes("Receiving end does not exist")
          )
            return null;
          throw error;
        }
      }
      if (message.action === "page-error" && sender.tab?.id !== undefined) {
        return chrome.tabs.sendMessage(
          sender.tab.id,
          {
            destination: "content",
            action: "show-error",
            payload: String(message.payload),
          },
          { frameId: 0 },
        );
      }
      if (message.action === "model-status") {
        await chrome.storage.session.set({
          modelStatus: message.payload as ModelStatus,
        });
        return null;
      }
      if (
        [
          "prepare",
          "translate",
          "cancel",
          "cancel-download",
          "unload-model",
          "clear-model-cache",
          "cache-info",
        ].includes(message.action)
      ) {
        await ensureModel();
        return request({ ...message, destination: "offscreen" });
      }
      throw new Error("Unknown extension request.");
    };
    void operation().then(
      (value) => respond({ ok: true, value }),
      (error) => respond(errorReply(error)),
    );
    return true;
  });
  chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: "post-card",
      title: copy.postCard,
      contexts: ["page"],
      documentUrlPatterns: ["https://*.x.com/*", "https://*.twitter.com/*"],
    });
    chrome.contextMenus.create({
      id: "toggle-page",
      title: copy.shortcutTogglePage,
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: "translate-selection",
      title: copy.translateSelection,
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "translate-input",
      title: copy.shortcutInput,
      contexts: ["editable"],
    });
    chrome.contextMenus.create({
      id: "translate-image",
      title: copy.translateImage,
      contexts: ["image"],
    });
    chrome.contextMenus.create({
      id: "translate-page-images",
      title: copy.translatePageImages,
      contexts: ["image"],
    });
    chrome.contextMenus.create({
      id: "restore-page-images",
      title: copy.restorePageImages,
      contexts: ["image"],
    });
    chrome.contextMenus.create({
      id: "pretranslate-subtitles",
      title: copy.pretranslateSubtitles,
      contexts: ["video"],
    });
    chrome.contextMenus.create({
      id: "download-subtitles",
      title: copy.downloadSubtitles,
      contexts: ["video"],
    });
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    if (reason === "install")
      await chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  });
  const sendToTab = async (
    action: string,
    tab?: chrome.tabs.Tab,
    frameId?: number,
  ) => {
    if (action === "open-sidepanel" && tab?.windowId !== undefined) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    }
    if (tab?.id !== undefined)
      await chrome.tabs.sendMessage(
        tab.id,
        { destination: "content", action },
        frameId === undefined ? {} : { frameId },
      );
  };
  chrome.commands.onCommand.addListener((command, tab) => {
    void sendToTab(command, tab);
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "translate-page-images" && tab?.id !== undefined) {
      const sessionId = crypto.randomUUID();
      const tabId = tab.id;
      void chrome.storage.session
        .set({
          [imageBatchKey(sessionId)]: { tab: tabId, frame: info.frameId ?? 0 },
        })
        .then(() =>
          chrome.tabs.sendMessage(
            tabId,
            {
              destination: "content",
              action: "translate-page-images",
              payload: { sessionId },
            },
            { frameId: info.frameId ?? 0 },
          ),
        )
        .catch(() => chrome.storage.session.remove(imageBatchKey(sessionId)));
      return;
    }
    if (
      info.menuItemId === "translate-image" &&
      info.srcUrl &&
      tab?.id !== undefined
    ) {
      const id = crypto.randomUUID();
      imageRequests.set(id, {
        url: info.srcUrl,
        tab: tab.id,
        frame: info.frameId ?? 0,
      });
      void chrome.tabs
        .sendMessage(
          tab.id,
          {
            destination: "content",
            action: "translate-image",
            payload: { id, url: info.srcUrl },
          },
          { frameId: info.frameId ?? 0 },
        )
        .catch(() => imageRequests.delete(id));
      return;
    }
    void sendToTab(String(info.menuItemId), tab, info.frameId ?? 0);
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    void (async () => {
      const values = await chrome.storage.session.get(null);
      const keys = Object.entries(values)
        .filter(
          ([key, value]) =>
            key.startsWith("imageBatch:") &&
            value &&
            typeof value === "object" &&
            "tab" in value &&
            value.tab === tabId,
        )
        .map(([key]) => key);
      if (keys.length) await chrome.storage.session.remove(keys);
      const pending = [...imageRequests].filter(
        ([, grant]) => grant.tab === tabId,
      );
      for (const [id] of pending) imageRequests.delete(id);
      if (pending.length) {
        await ensureModel();
        await Promise.all(
          pending.map(([id]) =>
            request({
              destination: "offscreen",
              action: "cancel-image",
              payload: id,
            }),
          ),
        );
      }
    })().catch((error) => console.error(error));
  });
});
