import type { DomCaptionAdapter } from "../model/types";

/** Candidate public DOM structures, verified by fixtures, not authenticated production sessions. */
export const captionAdapters: readonly DomCaptionAdapter[] = [
  {
    id: "youtube",
    hosts: ["youtube.com", "youtube-nocookie.com"],
    selector: ".caption-window",
  },
  {
    id: "netflix",
    hosts: ["netflix.com"],
    selector: ".player-timedtext-text-container",
  },
  {
    id: "udemy",
    hosts: ["udemy.com"],
    selector: '[class*="captions-cue-text"]',
  },
  {
    id: "google-meet",
    hosts: ["meet.google.com"],
    selector:
      '[role="region"][aria-label*="caption" i] .ygicle, [role="region"][aria-label*="caption" i] [jsname="YSxPC"], [jsname="dsyhDe"] .ygicle, [jsname="dsyhDe"] [jsname="YSxPC"]',
    meeting: true,
    speakerContainer: '.nMcdL, [jsname="tgaKEf"]',
    speakerSelector: ".NWpY1d",
  },
  {
    id: "zoom",
    hosts: ["zoom.us"],
    selector: ".live-transcription-subtitle__item",
    meeting: true,
    speakerSelector: ".live-transcription-subtitle__speaker",
  },
  {
    id: "teams",
    hosts: ["teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft"],
    selector: '[data-tid="closed-caption-text"]',
    meeting: true,
    speakerContainer: '[data-tid="closed-caption-chat-message"]',
    speakerSelector: ".ui-chat__message__author",
  },
];
