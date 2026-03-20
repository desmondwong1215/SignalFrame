import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { REANALYZE_DEBOUNCE_MS } from "./lib/constants";
import { hashString } from "./lib/hash";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  AnalyzeRuntimePayload,
  ExtensionConfig,
  FrameSample,
  RuntimeMessage,
  SiteId
} from "./lib/types";
import { WarningWidget } from "./components/WarningWidget";

let root: Root | null = null;
let mountNode: HTMLDivElement | null = null;
let lastSignature = "";
let debounceTimer: number | null = null;
let heartbeatTimer: number | null = null;
let observerRef: MutationObserver | null = null;
let extensionContextAlive = true;
let analysisRequestSeq = 0;
let passiveSampleTimer: number | null = null;
let passiveHistoryKey = "";
let passiveFrameHistory: FrameSample[] = [];
const passiveCanvas = document.createElement("canvas");

function isExtensionContextAlive(): boolean {
  return Boolean(chrome?.runtime?.id);
}

function sendMessage<T>(message: RuntimeMessage): Promise<T> {
  if (!isExtensionContextAlive()) {
    return Promise.reject(new Error("Extension context invalidated"));
  }

  return chrome.runtime.sendMessage(message) as Promise<T>;
}

function ensureMountNode(): HTMLDivElement {
  if (mountNode) return mountNode;
  mountNode = document.createElement("div");
  mountNode.id = "signalframe-root";
  document.body.appendChild(mountNode);
  return mountNode;
}

function unmountWarning(): void {
  if (root) {
    root.unmount();
    root = null;
  }
  if (mountNode) {
    mountNode.remove();
    mountNode = null;
  }
}

function stopRuntimeLoop(): void {
  extensionContextAlive = false;
  if (debounceTimer) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (heartbeatTimer) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (passiveSampleTimer) {
    window.clearInterval(passiveSampleTimer);
    passiveSampleTimer = null;
  }
  if (observerRef) {
    observerRef.disconnect();
    observerRef = null;
  }
  unmountWarning();
}

function getSiteFromUrl(url: URL): SiteId | null {
  const host = url.hostname.toLowerCase();

  if (host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com") return "youtube";
  if (host === "www.facebook.com" || host === "facebook.com" || host === "m.facebook.com") return "facebook";
  if (host === "www.x.com" || host === "x.com" || host === "www.twitter.com" || host === "twitter.com" || host === "m.twitter.com") return "x";
  if (host === "www.tiktok.com" || host === "tiktok.com" || host === "m.tiktok.com") return "tiktok";
  if (host === "www.instagram.com" || host === "instagram.com") return "instagram";

  return null;
}

function detectPageType(url: URL, site: SiteId): "video" | "short" | null {
  if (site === "youtube") {
    if (url.pathname === "/watch") return "video";
    if (url.pathname.startsWith("/shorts/")) return "short";
    return null;
  }

  if (site === "instagram") {
    if (url.pathname.startsWith("/reel/") || url.pathname.startsWith("/reels/")) return "short";
    if (url.pathname.startsWith("/tv/") || url.pathname.startsWith("/p/")) return "video";
  }

  if (site === "facebook") {
    if (url.pathname.includes("/reel/")) return "short";
    if (url.pathname.startsWith("/watch") || url.pathname.includes("/videos/")) return "video";
  }

  if (site === "tiktok") {
    if (url.pathname.includes("/video/") || url.pathname.startsWith("/@")) return "short";
  }

  if (site === "x") {
    if (url.pathname.includes("/status/")) return "video";
  }

  const activeVideo = getActiveVideoElement();
  if (!activeVideo) return null;

  return activeVideo.videoHeight > activeVideo.videoWidth ? "short" : "video";
}

function normalizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

function getPathSegmentAfter(pathname: string, marker: string): string {
  const index = pathname.indexOf(marker);
  if (index < 0) return "";
  const after = pathname.slice(index + marker.length);
  return after.split("/")[0] ?? "";
}

function getVideoId(url: URL, site: SiteId): string {
  if (site === "youtube") {
    if (url.pathname === "/watch") {
      return normalizeId(url.searchParams.get("v") ?? "");
    }

    if (url.pathname.startsWith("/shorts/")) {
      return normalizeId(url.pathname.split("/")[2] ?? "");
    }

    return "";
  }

  if (site === "facebook") {
    const reelId = getPathSegmentAfter(url.pathname, "/reel/");
    if (reelId) return normalizeId(reelId);

    const watchId = url.searchParams.get("v") || url.searchParams.get("story_fbid") || url.searchParams.get("fbid") || "";
    if (watchId) return normalizeId(watchId);
  }

  if (site === "instagram") {
    const reelId = getPathSegmentAfter(url.pathname, "/reel/") || getPathSegmentAfter(url.pathname, "/reels/");
    if (reelId) return normalizeId(reelId);

    const postId = getPathSegmentAfter(url.pathname, "/p/") || getPathSegmentAfter(url.pathname, "/tv/");
    if (postId) return normalizeId(postId);
  }

  if (site === "tiktok") {
    const videoPart = getPathSegmentAfter(url.pathname, "/video/");
    if (videoPart) return normalizeId(videoPart);

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length > 0) {
      return normalizeId(parts[parts.length - 1] ?? "");
    }
  }

  if (site === "x") {
    const statusId = getPathSegmentAfter(url.pathname, "/status/");
    if (statusId) return normalizeId(statusId);
  }

  const fallback = `${url.hostname}${url.pathname}`;
  return normalizeId(fallback);
}

function getTitleText(site: SiteId): string {
  if (site === "youtube") {
    const directTitle = document.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.textContent?.trim();
    if (directTitle) return directTitle;
  }

  const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim();
  if (metaTitle) return metaTitle;

  return document.title
    .replace(" - YouTube", "")
    .replace(" | Facebook", "")
    .replace(" • Instagram photos and videos", "")
    .replace(" / X", "")
    .trim();
}

function getChannelName(site: SiteId): string {
  if (site === "youtube") {
    const channel = document.querySelector("ytd-channel-name yt-formatted-string")?.textContent?.trim();
    if (channel) return channel;
  }

  const authorMeta = document.querySelector('meta[name="author"]')?.getAttribute("content")?.trim();
  if (authorMeta) return authorMeta;

  const siteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim();
  if (siteName) return siteName;

  return "";
}

function getActiveVideoElement(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll("video"));
  if (videos.length === 0) return null;

  const visible = videos
    .filter((video) => {
      const rect = video.getBoundingClientRect();
      return rect.width > 120 && rect.height > 80 && rect.bottom > 0 && rect.right > 0;
    })
    .sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectB.width * rectB.height - rectA.width * rectA.height;
    });

  return visible[0] ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getPassiveKey(): string {
  const url = new URL(window.location.href);
  return `${url.origin}${url.pathname}${url.search}`;
}

function resetPassiveFrameHistoryIfNeeded(): void {
  const nextKey = getPassiveKey();
  if (nextKey !== passiveHistoryKey) {
    passiveHistoryKey = nextKey;
    passiveFrameHistory = [];
  }
}

function selectDistributedFrameSamples(samples: FrameSample[], targetCount: number): FrameSample[] {
  if (samples.length <= targetCount) {
    return samples;
  }

  const ordered = [...samples].sort((a, b) => a.timestampSec - b.timestampSec);
  const selected: FrameSample[] = [];
  const used = new Set<number>();

  for (let idx = 0; idx < targetCount; idx += 1) {
    const fraction = targetCount <= 1 ? 0 : idx / (targetCount - 1);
    const pickIndex = Math.round(fraction * (ordered.length - 1));
    if (used.has(pickIndex)) continue;
    used.add(pickIndex);
    selected.push(ordered[pickIndex]);
  }

  return selected;
}

function updatePassiveFrameHistory(video: HTMLVideoElement): void {
  resetPassiveFrameHistoryIfNeeded();

  if (!Number.isFinite(video.currentTime) || video.currentTime < 0) {
    return;
  }

  const sample = captureFrame(video, passiveCanvas);
  if (!sample) {
    return;
  }

  const nearExisting = passiveFrameHistory.some((entry) => Math.abs(entry.timestampSec - sample.timestampSec) < 0.45);
  if (!nearExisting) {
    passiveFrameHistory.push(sample);
  } else {
    passiveFrameHistory = passiveFrameHistory.map((entry) =>
      Math.abs(entry.timestampSec - sample.timestampSec) < 0.45 ? sample : entry
    );
  }

  passiveFrameHistory.sort((a, b) => a.timestampSec - b.timestampSec);
  if (passiveFrameHistory.length > 24) {
    passiveFrameHistory = passiveFrameHistory.slice(-24);
  }
}

function installPassiveSampler(): void {
  if (passiveSampleTimer) {
    window.clearInterval(passiveSampleTimer);
  }

  passiveSampleTimer = window.setInterval(() => {
    if (!isExtensionContextAlive()) {
      stopRuntimeLoop();
      return;
    }

    const video = getActiveVideoElement();
    if (!video || video.readyState < 2) {
      return;
    }

    updatePassiveFrameHistory(video);
  }, 1200);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let idx = 0; idx < bytes.length; idx += chunk) {
    const slice = bytes.subarray(idx, idx + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function captureFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): FrameSample | null {
  const width = Math.max(96, Math.min(426, video.videoWidth || 0));
  const height = Math.max(96, Math.min(240, video.videoHeight || 0));

  if (!video.videoWidth || !video.videoHeight) return null;

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: false });
  if (!context) return null;

  try {
    context.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.68);
    return {
      dataUrl,
      timestampSec: Number(video.currentTime.toFixed(2)),
      width,
      height
    };
  } catch {
    // Cross-origin/DRM restrictions can block pixel reads; fail silently for MVP.
    return null;
  }
}

async function collectVisualSignals(): Promise<AnalyzeRequest["visualSignals"]> {
  const video = getActiveVideoElement();
  if (!video) return undefined;

  updatePassiveFrameHistory(video);
  const samples = selectDistributedFrameSamples(passiveFrameHistory, 4);

  if (samples.length === 0) return undefined;

  let videoStreamProbeBase64: string | undefined;
  let videoStreamNote: string | undefined;
  const videoSrcUrl = video.currentSrc || undefined;

  if (videoSrcUrl) {
    try {
      const response = await fetch(videoSrcUrl, {
        headers: {
          Range: "bytes=0-65535"
        }
      });

      const data = await response.arrayBuffer();
      videoStreamProbeBase64 = bytesToBase64(new Uint8Array(data).slice(0, 65536));
    } catch {
      videoStreamNote = "Stream probe unavailable due to CORS/DRM or site restrictions.";
    }
  } else {
    videoStreamNote = "No direct video source URL available from active element.";
  }

  return {
    frameSamples: samples,
    videoWidth: video.videoWidth || samples[0].width,
    videoHeight: video.videoHeight || samples[0].height,
    durationSec: Number.isFinite(video.duration) ? Number(video.duration.toFixed(2)) : 0,
    playbackRate: video.playbackRate || 1,
    videoSrcUrl,
    videoStreamProbeBase64,
    videoStreamMimeType: videoSrcUrl ? "video/*" : undefined,
    videoStreamNote
  };
}

async function collectSignalPayload(): Promise<AnalyzeRequest | null> {
  const url = new URL(window.location.href);
  const site = getSiteFromUrl(url);
  if (!site) {
    return null;
  }

  const pageType = detectPageType(url, site);

  if (!pageType) {
    return null;
  }

  const videoId = getVideoId(url, site);
  if (!videoId) {
    return null;
  }

  return {
    site,
    pageType,
    videoId,
    title: getTitleText(site).slice(0, 220),
    channelName: getChannelName(site).slice(0, 100),
    urlHash: await hashString(`${site}|${url.origin}${url.pathname}${url.search}`),
    visualSignals: await collectVisualSignals()
  };
}

function renderWarning(result: AnalyzeResponse): void {
  const node = ensureMountNode();
  if (!root) {
    root = createRoot(node);
  }

  root.render(
    <WarningWidget
      decision={result.decision}
      confidence={result.confidence}
      reason={result.reason}
      loading={false}
      onRetry={() => {
        void runAnalysisOnce(true);
      }}
    />
  );
}

function renderLoading(): void {
  const node = ensureMountNode();
  if (!root) {
    root = createRoot(node);
  }

  root.render(
    <WarningWidget
      decision="not_ai_generated"
      confidence={undefined}
      reason="Checking this video now."
      loading={true}
    />
  );
}

async function runAnalysisOnce(force = false): Promise<void> {
  if (!extensionContextAlive || !isExtensionContextAlive()) {
    stopRuntimeLoop();
    return;
  }

  const config = await sendMessage<ExtensionConfig>({ type: "GET_CONFIG" });
  const payload = await collectSignalPayload();
  if (!payload) {
    unmountWarning();
    return;
  }

  if (!config.enabled || !config.sitePreferences[payload.site]) {
    unmountWarning();
    return;
  }

  const signature = `${payload.videoId}|${payload.title}|${payload.channelName}`;
  if (signature === lastSignature && !force) {
    return;
  }

  lastSignature = signature;
  analysisRequestSeq += 1;
  const currentRequestSeq = analysisRequestSeq;
  renderLoading();

  try {
    const result = await sendMessage<AnalyzeResponse>({
      type: "ANALYZE",
      payload: {
        request: payload,
        forceRefresh: force
      } satisfies AnalyzeRuntimePayload
    });

    // Ignore stale responses when user navigated to a new video while request was pending.
    if (currentRequestSeq !== analysisRequestSeq || signature !== lastSignature) {
      return;
    }

    renderWarning(result);
  } catch {
    // Happens when extension reloads and old content script context is invalid.
    stopRuntimeLoop();
  }
}

function scheduleReanalysis(): void {
  if (debounceTimer) {
    window.clearTimeout(debounceTimer);
  }

  debounceTimer = window.setTimeout(() => {
    void runAnalysisOnce();
  }, REANALYZE_DEBOUNCE_MS);
}

function installObservers(): void {
  let lastHref = window.location.href;
  heartbeatTimer = window.setInterval(() => {
    if (!isExtensionContextAlive()) {
      stopRuntimeLoop();
      return;
    }

    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      lastSignature = "";
      passiveHistoryKey = "";
      passiveFrameHistory = [];
      scheduleReanalysis();
    }
  }, 600);

  observerRef = new MutationObserver(() => {
    if (!isExtensionContextAlive()) {
      stopRuntimeLoop();
      return;
    }
    scheduleReanalysis();
  });

  observerRef.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  installPassiveSampler();
}

installObservers();
scheduleReanalysis();
