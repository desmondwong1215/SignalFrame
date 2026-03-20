import type { ExtensionConfig } from "./types";

export const STORAGE_KEY = "signalframe:config";

export const DEFAULT_CONFIG: ExtensionConfig = {
  enabled: true,
  sitePreferences: {
    youtube: true,
    facebook: true,
    x: true,
    tiktok: true,
    instagram: true
  },
  apiBaseUrl: "http://localhost:8000"
};

export const REANALYZE_DEBOUNCE_MS = 900;
