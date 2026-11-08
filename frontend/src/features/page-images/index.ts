import {
  copy,
  imageBatchProgress,
  imageBatchFailures,
} from "../../shared/i18n";
import { installImageBatch } from "./lib/image-batch";
import { createImagePanel } from "./lib/image-panel";
import { createImageReplacement, readBlobImage } from "./lib/image-replacement";
import type {
  PageImageOptions,
  BatchImageState,
  BatchStartOptions,
} from "./model/types";
export type {
  PageImageOptions,
  BatchImageState,
  BatchStartOptions,
  BatchImageRequest,
} from "./model/types";

export function installPageImages(options: PageImageOptions) {
  const { document, getSettings, cancel } = options;
  const states = new Map<
    HTMLImageElement,
    {
      id: string;
      source: ReturnType<typeof createImageReplacement>;
      restore: () => void;
      panel?: ReturnType<typeof createImagePanel>;
    }
  >();
  let target: HTMLImageElement | undefined;
  let batch: ReturnType<typeof installImageBatch> | undefined;
  let batchPanel: ReturnType<typeof createImagePanel> | undefined;
  let batchStop: HTMLButtonElement | undefined;
  let batchAlert: HTMLParagraphElement | undefined;
  let lastError: string | undefined;
  let batchFailureCount = 0;
  const cached = new Map<string, Promise<string>>();
  const mutate = (action: () => void) =>
    batch ? batch.mutate(action) : action();
  const capture = (event: Event) => {
    target = event
      .composedPath()
      .find(
        (node) => node instanceof document.defaultView!.HTMLImageElement,
      ) as HTMLImageElement | undefined;
  };
  document.addEventListener("contextmenu", capture, true);

  async function perform(
    image: HTMLImageElement,
    id: string,
    url: string,
    translate: (data?: string) => Promise<string>,
    valid: () => boolean,
    showPanel: boolean,
  ) {
    states.get(image)?.restore();
    const source = createImageReplacement(image, mutate);
    const panel = showPanel
      ? createImagePanel(document, getSettings().theme)
      : undefined;
    if (panel) panel.status.textContent = copy.translatingImage;
    const state = {
      id,
      source,
      panel,
      restore() {
        if (!source.live) return;
        source.restore();
        void cancel(id);
        panel?.host.remove();
        if (states.get(image) === state) states.delete(image);
      },
    };
    states.set(image, state);
    const button = panel?.button(copy.cancel, state.restore);
    try {
      const data = url.startsWith("blob:")
        ? await readBlobImage(url)
        : undefined;
      if (!source.live || !valid()) {
        state.restore();
        return false;
      }
      const result = await translate(data);
      const applied = await source.apply(result, valid);
      if (!applied) {
        state.restore();
        return false;
      }
      if (panel && button) {
        panel.status.hidden = true;
        button.textContent = copy.restoreImage;
      }
      return true;
    } catch (error) {
      source.rollback();
      if (!source.live || !valid()) {
        state.restore();
        return false;
      }
      if (panel && button) {
        panel.status.hidden = false;
        panel.status.role = "alert";
        panel.status.textContent =
          error instanceof Error ? error.message : String(error);
        button.textContent = copy.close;
        return false;
      }
      state.restore();
      throw error;
    }
  }
  function stopBatch() {
    batch?.stop();
    cached.clear();
  }
  function restore() {
    stopBatch();
    batch = undefined;
    batchPanel?.host.remove();
    batchPanel = undefined;
    batchAlert = undefined;
    batchStop = undefined;
    for (const state of [...states.values()]) state.restore();
  }
  function progress(state: BatchImageState) {
    if (!batchPanel) return;
    batchPanel.status.textContent = imageBatchProgress(
      state.completed,
      state.queued,
      state.skipped,
    );
    if (batchStop) batchStop.hidden = !state.active;
    batchFailureCount = state.failed;
    if (batchAlert) {
      batchAlert.hidden = state.failed === 0 && !lastError;
      batchAlert.textContent = [
        state.failed ? imageBatchFailures(state.failed) : "",
        lastError ?? "",
      ]
        .filter(Boolean)
        .join(" ");
    }
  }
  return {
    async start(id: string, url: string) {
      stopBatch();
      const image =
        target?.isConnected && (target.currentSrc || target.src) === url
          ? target
          : Array.from(document.images).find(
              (image) => (image.currentSrc || image.src) === url,
            );
      if (!image) throw new Error(copy.imageTargetMissing);
      await perform(
        image,
        id,
        url,
        (data) => options.translate(id, data),
        () => true,
        true,
      );
    },
    startBatch(sessionId: string, config: BatchStartOptions = {}) {
      if (!options.translateBatchImage || !options.cancelBatch)
        throw new Error(copy.imageBatchUnavailable);
      restore();
      lastError = undefined;
      batchFailureCount = 0;
      batchPanel = createImagePanel(document, getSettings().theme, true);
      batchStop = batchPanel.button(copy.stopImages, stopBatch);
      batchPanel.button(copy.restoreImages, restore);
      batchAlert = document.createElement("p");
      batchAlert.role = "alert";
      batchAlert.hidden = true;
      batchPanel.section.append(batchAlert);
      try {
        batch = installImageBatch({
          document,
          getSettings,
          sessionId,
          ...config,
          cancel,
          isReplacement: (image) =>
            states.get(image)?.source.isReplacement() ?? false,
          restoreImage: (image) => states.get(image)?.restore(),
          cancelBatch: () => options.cancelBatch!(sessionId),
          onState: progress,
          onError: (error) => {
            lastError = error instanceof Error ? error.message : String(error);
            if (batchAlert) {
              batchAlert.hidden = false;
              batchAlert.textContent = [
                imageBatchFailures(batchFailureCount + 1),
                lastError,
              ].join(" ");
            }
          },
          onPreferencesChanged: () => {
            cached.clear();
            lastError = copy.imageBatchSettingsChanged;
            if (batchAlert) {
              batchAlert.hidden = false;
              batchAlert.textContent = lastError;
            }
          },
          translate: (image, id, url, valid) =>
            perform(
              image,
              id,
              url,
              (data) => {
                let pending = cached.get(url);
                if (!pending) {
                  pending = options.translateBatchImage!({
                    sessionId,
                    id,
                    url,
                    data,
                  });
                  cached.set(url, pending);
                  const current = pending;
                  // Cancellation invalidates this attempt; other errors remain visible and cached.
                  void current.catch((error: unknown) => {
                    if (
                      typeof error === "object" &&
                      error !== null &&
                      "name" in error &&
                      error.name === "AbortError" &&
                      cached.get(url) === current
                    )
                      cached.delete(url);
                  });
                  if (cached.size > 8)
                    cached.delete(cached.keys().next().value!);
                }
                return pending;
              },
              valid,
              false,
            ),
        });
      } catch (error) {
        batchPanel.host.remove();
        batchPanel = undefined;
        void options.cancelBatch!(sessionId);
        throw error;
      }
    },
    stopBatch,
    getBatchState: (): BatchImageState =>
      batch?.getState() ?? {
        active: false,
        queued: 0,
        completed: 0,
        skipped: 0,
        failed: 0,
      },
    refresh() {
      for (const state of states.values())
        if (state.panel) state.panel.host.dataset.theme = getSettings().theme;
      if (batchPanel) batchPanel.host.dataset.theme = getSettings().theme;
      batch?.refresh();
    },
    restore,
    dispose() {
      restore();
      document.removeEventListener("contextmenu", capture, true);
    },
  };
}
