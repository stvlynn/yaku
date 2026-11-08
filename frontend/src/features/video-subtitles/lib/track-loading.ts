import type { NativeTrackChoice } from "../model/track-types";
import { copy } from "../../../shared/i18n";

export interface NativeTrackEntry {
  media: HTMLMediaElement;
  track: TextTrack;
  element?: HTMLTrackElement;
  choice: NativeTrackChoice;
}
export interface NativeTrackLease {
  entry: NativeTrackEntry;
  signal: AbortSignal;
  valid: () => boolean;
  release: () => void;
}
export const abortedTrack = () => new DOMException("", "AbortError");
export async function raceTrackAbort<T>(
  pending: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw abortedTrack();
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortedTrack());
    signal.addEventListener("abort", abort, { once: true });
    pending
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
/** A lease owns only the hidden value it wrote; same-value external writes are not observable. */
export async function loadNativeTrack(
  entry: NativeTrackEntry,
  signal: AbortSignal,
  current: () => boolean,
): Promise<NativeTrackLease> {
  const { track, element, media } = entry;
  const view = media.ownerDocument.defaultView!;
  if (signal.aborted) throw abortedTrack();
  const controller = new view.AbortController();
  const externalAbort = () => controller.abort();
  signal.addEventListener("abort", externalAbort, { once: true });
  const original = track.mode;
  let owned = original === "disabled";
  if (owned) track.mode = "hidden";
  const expected = track.mode;
  const valid = () =>
    !controller.signal.aborted &&
    media.isConnected &&
    current() &&
    track.mode === expected;
  const ownership = view.setInterval(() => {
    if (!valid()) controller.abort();
  }, 100);
  const release = () => {
    view.clearInterval(ownership);
    signal.removeEventListener("abort", externalAbort);
    if (owned && track.mode === "hidden") track.mode = original;
    owned = false;
  };
  try {
    if (!valid()) throw abortedTrack();
    if (element && element.readyState !== 2) {
      if (element.readyState === 3)
        throw new Error(copy.subtitleTrackLoadError);
      await new Promise<void>((resolve, reject) => {
        let timer: number;
        let poll: number;
        const cleanup = () => {
          clearTimeout(timer);
          clearInterval(poll);
          element.removeEventListener("load", loaded);
          element.removeEventListener("error", failed);
          controller.signal.removeEventListener("abort", abort);
        };
        const finish = (error?: unknown) => {
          cleanup();
          error ? reject(error) : resolve();
        };
        const loaded = () => (valid() ? finish() : finish(abortedTrack()));
        const failed = () => finish(new Error(copy.subtitleTrackLoadError));
        const abort = () => finish(abortedTrack());
        element.addEventListener("load", loaded, { once: true });
        element.addEventListener("error", failed, { once: true });
        controller.signal.addEventListener("abort", abort, { once: true });
        poll = view.setInterval(() => {
          if (!valid()) abort();
          else if (element.readyState === 2) loaded();
          else if (element.readyState === 3) failed();
        }, 100);
        timer = view.setTimeout(
          () => finish(new Error(copy.subtitleTrackLoadTimeout)),
          15000,
        );
      });
    }
    if (!valid()) throw abortedTrack();
    return { entry, signal: controller.signal, valid, release };
  } catch (error) {
    release();
    throw error;
  }
}
