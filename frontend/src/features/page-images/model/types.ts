import type { Settings } from "../../../entities/settings";
export interface BatchImageRequest {
  sessionId: string;
  id: string;
  url: string;
  data?: string;
}
export interface BatchImageState {
  active: boolean;
  queued: number;
  completed: number;
  skipped: number;
  failed: number;
}
export interface PageImageOptions {
  document: Document;
  getSettings: () => Settings;
  translate: (id: string, data?: string) => Promise<string>;
  cancel: (id: string) => Promise<void>;
  translateBatchImage?: (request: BatchImageRequest) => Promise<string>;
  cancelBatch?: (sessionId: string) => Promise<void>;
}
export interface BatchStartOptions {
  scopeSelector?: string;
  minimumPixels?: number;
}
export const imagePreferencesKey = (settings: Settings) =>
  JSON.stringify([
    settings.sourceLanguage,
    settings.targetLanguage,
    settings.glossary,
  ]);
