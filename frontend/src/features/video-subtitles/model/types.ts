import type { Settings } from "../../../entities/settings";

export interface SubtitleCue {
  id: string;
  scope: string;
  source: string;
  translation?: string;
  speaker?: string;
  start: number;
  end: number;
  timing: "track" | "observed";
  adapter: string;
}
export interface DomCaptionAdapter {
  id: string;
  hosts: readonly string[];
  selector: string;
  meeting?: boolean;
  speakerSelector?: string;
  speakerContainer?: string;
}
export interface SubtitleRuntime {
  document: Document;
  getSettings: () => Settings;
  revision: () => number;
  request: (source: string) => Promise<string>;
  scope: (element: Element, adapter?: DomCaptionAdapter) => string | undefined;
  active: (scope: string) => boolean;
  record: (cue: SubtitleCue) => void;
  onError: (error: unknown) => void;
  now: () => number;
}
