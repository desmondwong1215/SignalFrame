export type SiteId = "youtube" | "facebook" | "x" | "tiktok" | "instagram";

export type Decision = "not_ai_generated" | "ai_generated";
export type Confidence = "low" | "medium" | "high";

export interface SitePreferences {
  youtube: boolean;
  facebook: boolean;
  x: boolean;
  tiktok: boolean;
  instagram: boolean;
}

export interface ExtensionConfig {
  enabled: boolean;
  sitePreferences: SitePreferences;
  apiBaseUrl: string;
}

export interface AnalyzeRequest {
  site: SiteId;
  pageType: "video" | "short";
  videoId: string;
  title: string;
  channelName: string;
  urlHash: string;
  visualSignals?: VisualSignals;
}

export interface AnalyzeRuntimePayload {
  request: AnalyzeRequest;
  forceRefresh?: boolean;
}

export interface FrameSample {
  dataUrl: string;
  timestampSec: number;
  width: number;
  height: number;
}

export interface VisualSignals {
  frameSamples: FrameSample[];
  videoWidth: number;
  videoHeight: number;
  durationSec: number;
  playbackRate: number;
  videoSrcUrl?: string;
  videoStreamProbeBase64?: string;
  videoStreamMimeType?: string;
  videoStreamNote?: string;
}

export interface AnalyzeResponse {
  decision: Decision;
  confidence?: Confidence;
  reason: string;
  ttlSeconds: number;
}

export interface DiagnosticsState {
  lastCheckedAt: number | null;
  lastDecision: Decision | null;
  lastConfidence: Confidence | null;
  lastReason: string;
  lastVideoId: string;
}

export const DEFAULT_DIAGNOSTICS: DiagnosticsState = {
  lastCheckedAt: null,
  lastDecision: null,
  lastConfidence: null,
  lastReason: "No analysis has run yet.",
  lastVideoId: ""
};

export interface RuntimeMessage {
  type: "GET_CONFIG" | "SET_CONFIG" | "ANALYZE" | "GET_DIAGNOSTICS";
  payload?: unknown;
}
