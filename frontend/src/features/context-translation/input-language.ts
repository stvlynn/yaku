import { languages } from "../../shared/languages";
import { composedParent } from "../../shared/translation-markup";

const rule = (hostname: string) => {
  if (/(^|\.)(x|twitter)\.com$/.test(hostname))
    return { scope: '[role="dialog"]', nearby: '[data-testid="tweetText"]' };
  if (/(^|\.)youtube\.com$/.test(hostname))
    return {
      scope: "ytd-comment-view-model, ytd-comment-thread-renderer, #comment",
      nearby: "yt-attributed-string#content-text",
      page: "#description-inline-expander",
    };
  if (/(^|\.)reddit\.com$/.test(hostname))
    return {
      scope: "shreddit-comment",
      nearby: '[slot="comment"]',
      page: "shreddit-post-text-body .text-neutral-content",
    };
  if (hostname === "web.telegram.org")
    return {
      page: ".message-date-group .Message .text-content, .bubble-content .message .translatable-message",
    };
  if (hostname === "web.whatsapp.com")
    return {
      page: '[data-testid="msg-container"] [data-testid="selectable-text"], .message-in [data-testid="selectable-text"], .message-out [data-testid="selectable-text"]',
    };
};

export function conversationSample(
  editor: HTMLElement,
  sourceText: (element: Element) => string,
) {
  const document = editor.ownerDocument;
  const site = rule(document.location.hostname);
  if (!site) return "";
  if (site.scope && site.nearby) {
    for (
      let element: Element | null = editor;
      element;
      element = composedParent(element)
    ) {
      if (!element.matches(site.scope)) continue;
      const sample = element.querySelector(site.nearby);
      const text = sample && sourceText(sample).trim();
      if (text) return text.slice(0, 1024);
    }
  }
  return site.page
    ? [...document.querySelectorAll(site.page)]
        .slice(-5)
        .map(sourceText)
        .join("\n")
        .trim()
        .slice(-1024)
    : "";
}

export function supportedInputLanguage(language?: string) {
  const tag = language?.toLowerCase().replaceAll("_", "-");
  if (tag === "zh-tw" || tag === "zh-hk") return "zh-Hant";
  return (
    languages.find(([code]) => code.toLowerCase() === tag)?.[0] ??
    languages.find(([code]) => code === tag?.split("-")[0])?.[0]
  );
}
