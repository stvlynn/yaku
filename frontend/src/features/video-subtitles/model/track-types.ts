export interface NativeTrackChoice {
  id: string;
  label: string;
  language: string;
  kind: "subtitles" | "captions";
  mode: TextTrackMode;
  default: boolean;
  loadState: "unloaded" | "loading" | "loaded" | "error" | "unknown";
  selected: boolean;
}
export interface NativeTrackSelectionRequest {
  media: HTMLMediaElement;
  tracks: readonly NativeTrackChoice[];
  purpose: "pretranslate" | "export";
  signal: AbortSignal;
}
export type NativeTrackSelector = (
  request: NativeTrackSelectionRequest,
) => Promise<string | undefined>;
export interface NativeTrackCommandOptions {
  trackId?: string;
  /** Explicit commands may temporarily enable a selected disabled track for native loading. */
  acquire?: boolean;
}
