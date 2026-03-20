import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_DIAGNOSTICS } from "./lib/types";
import type { DiagnosticsState, ExtensionConfig } from "./lib/types";

function sendMessage<T>(type: "GET_CONFIG" | "SET_CONFIG" | "GET_DIAGNOSTICS", payload?: unknown): Promise<T> {
  return chrome.runtime.sendMessage({ type, payload }) as Promise<T>;
}

function Popup() {
  const [config, setConfig] = useState<ExtensionConfig | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>(DEFAULT_DIAGNOSTICS);

  useEffect(() => {
    void sendMessage<ExtensionConfig>("GET_CONFIG").then(setConfig);
    void sendMessage<DiagnosticsState>("GET_DIAGNOSTICS").then(setDiagnostics);
  }, []);

  if (!config) {
    return <main style={mainStyle}>Loading settings...</main>;
  }

  const save = async (next: Partial<ExtensionConfig>) => {
    const updated = await sendMessage<ExtensionConfig>("SET_CONFIG", next);
    setConfig(updated);
  };

  return (
    <main style={mainStyle}>
      <h3 style={titleStyle}>SignalFrame</h3>
      <p style={textStyle}>Assistive warning for likely AI-generated videos and shorts across supported social platforms.</p>

      <label style={rowStyle}>
        <span>Enable extension</span>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(event) => {
            void save({ enabled: event.target.checked });
          }}
        />
      </label>

      <label style={rowStyle}>
        <span>Enable on YouTube</span>
        <input
          type="checkbox"
          checked={config.sitePreferences.youtube}
          onChange={(event) => {
            void save({
              sitePreferences: {
                ...config.sitePreferences,
                youtube: event.target.checked
              }
            });
          }}
        />
      </label>

      <label style={rowStyle}>
        <span>Enable on Facebook</span>
        <input
          type="checkbox"
          checked={config.sitePreferences.facebook}
          onChange={(event) => {
            void save({
              sitePreferences: {
                ...config.sitePreferences,
                facebook: event.target.checked
              }
            });
          }}
        />
      </label>

      <label style={rowStyle}>
        <span>Enable on X</span>
        <input
          type="checkbox"
          checked={config.sitePreferences.x}
          onChange={(event) => {
            void save({
              sitePreferences: {
                ...config.sitePreferences,
                x: event.target.checked
              }
            });
          }}
        />
      </label>

      <label style={rowStyle}>
        <span>Enable on TikTok</span>
        <input
          type="checkbox"
          checked={config.sitePreferences.tiktok}
          onChange={(event) => {
            void save({
              sitePreferences: {
                ...config.sitePreferences,
                tiktok: event.target.checked
              }
            });
          }}
        />
      </label>

      <label style={rowStyle}>
        <span>Enable on Instagram</span>
        <input
          type="checkbox"
          checked={config.sitePreferences.instagram}
          onChange={(event) => {
            void save({
              sitePreferences: {
                ...config.sitePreferences,
                instagram: event.target.checked
              }
            });
          }}
        />
      </label>

      <div style={diagnosticBoxStyle}>
        <p style={diagnosticTitleStyle}>Diagnostics</p>
        <p style={diagnosticTextStyle}>Last decision: {diagnostics.lastDecision ?? "none yet"}</p>
        <p style={diagnosticTextStyle}>Confidence: {diagnostics.lastConfidence ?? "n/a"}</p>
        <p style={diagnosticTextStyle}>Video id: {diagnostics.lastVideoId || "n/a"}</p>
        <p style={diagnosticTextStyle}>Reason: {diagnostics.lastReason}</p>
        <p style={hintStyle}>Warning icon appears when analysis runs and updates as checks complete.</p>
      </div>
    </main>
  );
}

const mainStyle: React.CSSProperties = {
  padding: "14px",
  color: "#1d1f23"
};

const titleStyle: React.CSSProperties = {
  margin: "0 0 6px"
};

const textStyle: React.CSSProperties = {
  margin: "0 0 12px",
  color: "#515969",
  fontSize: "13px",
  lineHeight: 1.4
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "10px",
  fontSize: "14px"
};

const diagnosticBoxStyle: React.CSSProperties = {
  marginTop: "12px",
  padding: "10px",
  borderRadius: "8px",
  background: "#f1f4f8",
  border: "1px solid #d7dee8"
};

const diagnosticTitleStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: "13px",
  fontWeight: 700
};

const diagnosticTextStyle: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: "12px",
  color: "#394150",
  lineHeight: 1.35
};

const hintStyle: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: "11px",
  color: "#616b7d"
};

const rootNode = document.getElementById("root");
if (!rootNode) {
  throw new Error("Popup root node not found");
}

createRoot(rootNode).render(<Popup />);
