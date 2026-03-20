import { DEFAULT_CONFIG, STORAGE_KEY } from "./lib/constants";
import { DEFAULT_DIAGNOSTICS } from "./lib/types";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  AnalyzeRuntimePayload,
  DiagnosticsState,
  ExtensionConfig,
  RuntimeMessage
} from "./lib/types";

interface CacheEntry {
  result: AnalyzeResponse;
  expiresAt: number;
}

interface PendingRequest {
  controller: AbortController;
  requestKey: string;
}

const responseCache = new Map<string, CacheEntry>();
const DIAGNOSTICS_KEY = "signalframe:diagnostics";
const pendingByTab = new Map<number, PendingRequest>();

async function getConfig(): Promise<ExtensionConfig> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  const merged = {
    ...DEFAULT_CONFIG,
    ...(stored[STORAGE_KEY] ?? {})
  };

  return {
    ...merged,
    sitePreferences: {
      ...DEFAULT_CONFIG.sitePreferences,
      ...merged.sitePreferences,
      youtube: merged.sitePreferences?.youtube ?? DEFAULT_CONFIG.sitePreferences.youtube,
      facebook: merged.sitePreferences?.facebook ?? DEFAULT_CONFIG.sitePreferences.facebook,
      x: merged.sitePreferences?.x ?? DEFAULT_CONFIG.sitePreferences.x,
      tiktok: merged.sitePreferences?.tiktok ?? DEFAULT_CONFIG.sitePreferences.tiktok,
      instagram: merged.sitePreferences?.instagram ?? DEFAULT_CONFIG.sitePreferences.instagram
    }
  };
}

async function setConfig(partial: Partial<ExtensionConfig>): Promise<ExtensionConfig> {
  const next = {
    ...(await getConfig()),
    ...partial
  };
  await chrome.storage.sync.set({ [STORAGE_KEY]: next });
  return next;
}

async function getDiagnostics(): Promise<DiagnosticsState> {
  const stored = await chrome.storage.local.get(DIAGNOSTICS_KEY);
  return {
    ...DEFAULT_DIAGNOSTICS,
    ...(stored[DIAGNOSTICS_KEY] ?? {})
  };
}

async function setDiagnostics(next: DiagnosticsState): Promise<void> {
  await chrome.storage.local.set({ [DIAGNOSTICS_KEY]: next });
}

async function analyzeViaBackend(
  payload: AnalyzeRequest,
  config: ExtensionConfig,
  forceRefresh = false,
  tabId?: number
): Promise<AnalyzeResponse> {
  const cacheKey = `${payload.site}|${payload.pageType}|${payload.videoId}|${payload.title}|${payload.channelName}`;
  const now = Date.now();
  if (!forceRefresh) {
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.result;
    }
  }

  const requestKey = `${payload.videoId}|${payload.title}|${payload.channelName}`;
  const controller = new AbortController();

  if (typeof tabId === "number") {
    const active = pendingByTab.get(tabId);
    if (active && active.requestKey !== requestKey) {
      active.controller.abort();
    }
    pendingByTab.set(tabId, { controller, requestKey });
  }

  const deadline = Date.now() + 30_000;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;

    try {
      const response = await fetch(`${config.apiBaseUrl}/api/v1/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (response.ok) {
        const parsed = (await response.json()) as AnalyzeResponse;
        responseCache.set(cacheKey, {
          result: parsed,
          expiresAt: Date.now() + parsed.ttlSeconds * 1000
        });

        if (typeof tabId === "number") {
          const current = pendingByTab.get(tabId);
          if (current?.controller === controller) {
            pendingByTab.delete(tabId);
          }
        }

        return parsed;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return {
          decision: "not_ai_generated",
          reason: "Skipped an older check because you moved to another video.",
          ttlSeconds: 5
        };
      }
    }

    const waitMs = Math.min(2000, 400 + attempt * 300);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  if (typeof tabId === "number") {
    const current = pendingByTab.get(tabId);
    if (current?.controller === controller) {
      pendingByTab.delete(tabId);
    }
  }

  return {
    decision: "not_ai_generated",
    reason: "We could not check this video after several tries. Please try again in a moment.",
    ttlSeconds: 15
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  if (!stored[STORAGE_KEY]) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: DEFAULT_CONFIG });
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  void (async () => {
    if (message.type === "GET_CONFIG") {
      sendResponse(await getConfig());
      return;
    }

    if (message.type === "SET_CONFIG") {
      sendResponse(await setConfig((message.payload ?? {}) as Partial<ExtensionConfig>));
      return;
    }

    if (message.type === "GET_DIAGNOSTICS") {
      sendResponse(await getDiagnostics());
      return;
    }

    if (message.type === "ANALYZE") {
      const config = await getConfig();
      const analyzePayload = message.payload as AnalyzeRuntimePayload | AnalyzeRequest;
      const request = "request" in analyzePayload ? analyzePayload.request : analyzePayload;
      const forceRefresh = "request" in analyzePayload ? Boolean(analyzePayload.forceRefresh) : false;

      if (!config.enabled || !config.sitePreferences[request.site]) {
        const disabledResult = {
          decision: "not_ai_generated",
          reason: "SignalFrame is turned off for this site.",
          ttlSeconds: 120
        } satisfies AnalyzeResponse;
        await setDiagnostics({
          lastCheckedAt: Date.now(),
          lastDecision: disabledResult.decision,
          lastConfidence: null,
          lastReason: disabledResult.reason,
          lastVideoId: request.videoId
        });
        sendResponse(disabledResult);
        return;
      }

      const result = await analyzeViaBackend(request, config, forceRefresh, sender.tab?.id);
      await setDiagnostics({
        lastCheckedAt: Date.now(),
        lastDecision: result.decision,
        lastConfidence: result.confidence ?? null,
        lastReason: result.reason,
        lastVideoId: request.videoId
      });
      sendResponse(result);
      return;
    }
  })();

  return true;
});
