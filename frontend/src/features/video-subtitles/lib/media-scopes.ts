import type { DomCaptionAdapter } from "../model/types";

const playerSelector =
  '.html5-video-player,.watch-video,[data-purpose="video-player"]';

/** Provider IDs are independent of seek/playlist parameters and transport blob URLs. */
function providerIdentity(document: Document): string | undefined {
  const url = new URL(document.location.href);
  if (/(^|\.)youtube(?:-nocookie)?\.com$/.test(url.hostname)) {
    const id =
      url.searchParams.get("v") ??
      /^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[1];
    if (id) return `youtube:${id}`;
  }
  if (/(^|\.)netflix\.com$/.test(url.hostname)) {
    const id = /^\/watch\/(\d+)/.exec(url.pathname)?.[1];
    if (id) return `netflix:${id}`;
  }
}

export function createMediaScopes(document: Document) {
  let next = 0;
  const media = new Map<HTMLMediaElement, { id: string; identity: string }>();
  const meetings = new Map<string, { id: string; identity: string }>();
  const sourceIdentity = (element: HTMLMediaElement) => {
    const provider = providerIdentity(document);
    if (provider) return provider;
    const source =
      element.currentSrc ||
      element.getAttribute("src") ||
      element.querySelector("source[src]")?.getAttribute("src") ||
      "";
    if (!source) return "";
    const url = new URL(source, document.baseURI);
    if (/^#t=/.test(url.hash)) url.hash = "";
    return url.href;
  };
  function mediaScope(element: HTMLMediaElement) {
    const identity = sourceIdentity(element);
    let current = media.get(element);
    if (!current || (identity && current.identity !== identity)) {
      current = { id: `media-${++next}`, identity };
      media.set(element, current);
    }
    return current.id;
  }
  function associatedMedia(element: Element): HTMLMediaElement | undefined {
    if (element.matches("video,audio")) return element as HTMLMediaElement;
    const player = element.closest(playerSelector);
    if (player)
      return player.querySelector<HTMLMediaElement>("video,audio") ?? undefined;
    const candidates =
      document.querySelectorAll<HTMLMediaElement>("video,audio");
    // An unassociated caption must never silently attach to the first of several players.
    return candidates.length === 1 ? candidates[0] : undefined;
  }
  function scope(
    element: Element,
    adapter?: DomCaptionAdapter,
  ): string | undefined {
    if (!adapter?.meeting) {
      const owner = associatedMedia(element);
      return owner ? mediaScope(owner) : undefined;
    }
    const url = new URL(document.location.href);
    const identity = `${url.origin}${url.pathname}`;
    let current = meetings.get(adapter.id);
    if (!current || current.identity !== identity) {
      current = { id: `meeting-${++next}`, identity };
      meetings.set(adapter.id, current);
    }
    return current.id;
  }
  function active(id: string) {
    for (const [element, value] of media) {
      if (!element.isConnected) {
        media.delete(element);
        continue;
      }
      if (value.id === id) return mediaScope(element) === id;
    }
    for (const [adapter, value] of meetings)
      if (value.id === id)
        return (
          scope(document.documentElement, {
            id: adapter,
            hosts: [],
            selector: "",
            meeting: true,
          }) === id
        );
    return false;
  }
  return { scope, active, mediaScope, associatedMedia };
}
