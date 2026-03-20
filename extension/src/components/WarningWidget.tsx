import { useMemo, useRef, useState, type CSSProperties } from "react";
import type { Confidence, Decision } from "../lib/types";

interface WarningWidgetProps {
  decision: Decision;
  confidence?: Confidence;
  reason: string;
  loading?: boolean;
  onRetry?: () => void;
}

export function WarningWidget({ decision, confidence, reason, loading = false, onRetry }: WarningWidgetProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ right: 16, bottom: 16 });
  const [iconHovered, setIconHovered] = useState(false);
  const [iconPressed, setIconPressed] = useState(false);
  const [retryHovered, setRetryHovered] = useState(false);
  const [retryPressed, setRetryPressed] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; right: number; bottom: number } | null>(null);

  const confidenceLabel = useMemo(() => {
    if (!confidence) return "";
    if (confidence === "high") return "High confidence";
    if (confidence === "medium") return "Medium confidence";
    return "Low confidence";
  }, [confidence]);

  const title = useMemo(() => {
    if (loading) return "Checking video";
    if (decision === "ai_generated") return "AI-generated";
    return "Not AI-generated";
  }, [decision, loading]);

  const badgeTone = useMemo(() => {
    if (loading) return "loading" as const;
    if (decision !== "ai_generated") return "safe" as const;
    if (confidence === "high") return "high" as const;
    if (confidence === "medium") return "medium" as const;
    return "low" as const;
  }, [confidence, decision, loading]);

  const onPointerDown: React.PointerEventHandler<HTMLButtonElement> = (event) => {
    setIconPressed(true);
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      right: position.right,
      bottom: position.bottom
    };
  };

  const onPointerMove: React.PointerEventHandler<HTMLButtonElement> = (event) => {
    if (!dragStartRef.current) return;
    const deltaX = event.clientX - dragStartRef.current.x;
    const deltaY = event.clientY - dragStartRef.current.y;
    const nextRight = Math.max(8, dragStartRef.current.right - deltaX);
    const nextBottom = Math.max(8, dragStartRef.current.bottom - deltaY);
    setPosition({ right: nextRight, bottom: nextBottom });
  };

  const onPointerUp: React.PointerEventHandler<HTMLButtonElement> = (event) => {
    setIconPressed(false);
    const target = event.currentTarget;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    dragStartRef.current = null;
  };

  return (
    <div style={{ ...containerStyle, right: `${position.right}px`, bottom: `${position.bottom}px` }}>
      <button
        style={{
          ...buttonStyle,
          ...(badgeTone === "high" ? buttonHighStyle : {}),
          ...(badgeTone === "medium" ? buttonMediumStyle : {}),
          ...(badgeTone === "low" ? buttonLowStyle : {}),
          ...(badgeTone === "safe" ? buttonSafeStyle : {}),
          ...(badgeTone === "loading" ? buttonLoadingStyle : {}),
          ...(iconHovered ? buttonHoverStyle : {}),
          ...(iconPressed ? buttonPressedStyle : {})
        }}
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={() => setIconHovered(true)}
        onMouseLeave={() => {
          setIconHovered(false);
          setIconPressed(false);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setIconPressed(false)}
      >
        <span style={bubbleLabelStyle}>SF</span>
        {loading ? <span style={spinnerStyle} /> : null}
      </button>
      {open ? (
        <div
          style={{
            ...panelStyle,
            ...(badgeTone === "high" ? panelHighStyle : {}),
            ...(badgeTone === "medium" ? panelMediumStyle : {}),
            ...(badgeTone === "low" ? panelLowStyle : {}),
            ...(badgeTone === "safe" ? panelSafeStyle : {}),
            ...(badgeTone === "loading" ? panelLoadingStyle : {})
          }}
        >
          <h4 style={titleStyle}>{title}</h4>
          {decision === "ai_generated" && !loading ? <p style={confidenceStyle}>{confidenceLabel}</p> : null}
          <p style={reasonStyle}>{reason}</p>
          {!loading && onRetry ? (
            <button
              style={{
                ...retryButtonStyle,
                ...(retryHovered ? retryButtonHoverStyle : {}),
                ...(retryPressed ? retryButtonPressedStyle : {})
              }}
              onMouseEnter={() => setRetryHovered(true)}
              onMouseLeave={() => {
                setRetryHovered(false);
                setRetryPressed(false);
              }}
              onMouseDown={() => setRetryPressed(true)}
              onMouseUp={() => setRetryPressed(false)}
              onBlur={() => setRetryPressed(false)}
              onClick={onRetry}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const containerStyle: CSSProperties = {
  position: "fixed",
  zIndex: 2147483646,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "8px"
};

const buttonStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  borderRadius: "999px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#1d2129",
  fontWeight: 800,
  fontSize: "12px",
  letterSpacing: "0.4px",
  cursor: "pointer",
  touchAction: "none",
  transition: "transform 140ms ease, box-shadow 140ms ease, filter 140ms ease",
  boxShadow: "0 6px 14px rgba(0, 0, 0, 0.25)"
};

const buttonHoverStyle: CSSProperties = {
  filter: "brightness(1.03)",
  boxShadow: "0 8px 16px rgba(0, 0, 0, 0.3)"
};

const buttonPressedStyle: CSSProperties = {
  transform: "translateY(1px) scale(0.98)",
  boxShadow: "0 4px 10px rgba(0, 0, 0, 0.24)"
};

const buttonHighStyle: CSSProperties = {
  border: "1px solid #b8431d",
  background: "#ff875f"
};

const buttonMediumStyle: CSSProperties = {
  border: "1px solid #cc8d1a",
  background: "#ffd889"
};

const buttonLowStyle: CSSProperties = {
  border: "1px solid #9ba8b6",
  background: "#ffe7a8"
};

const buttonSafeStyle: CSSProperties = {
  border: "1px solid #2a9c67",
  background: "#56d39a"
};

const buttonLoadingStyle: CSSProperties = {
  border: "1px solid #9ba6b2",
  background: "#eef2f5"
};

const bubbleLabelStyle: CSSProperties = {
  position: "relative",
  userSelect: "none"
};

const spinnerStyle: CSSProperties = {
  width: "12px",
  height: "12px",
  marginLeft: "6px",
  borderRadius: "50%",
  border: "2px solid #b4bec8",
  borderTopColor: "#5d6b7a",
  animation: "signalframe-spin 0.8s linear infinite"
};

const panelStyle: CSSProperties = {
  width: "280px",
  borderRadius: "12px",
  boxShadow: "0 12px 22px rgba(0, 0, 0, 0.18)",
  padding: "12px"
};

const panelHighStyle: CSSProperties = {
  border: "1px solid #efb09f",
  background: "#fff4f1"
};

const panelMediumStyle: CSSProperties = {
  border: "1px solid #eac788",
  background: "#fff8ed"
};

const panelLowStyle: CSSProperties = {
  border: "1px solid #f0d8a3",
  background: "#fffaf0"
};

const panelSafeStyle: CSSProperties = {
  border: "1px solid #8cd5b2",
  background: "#effcf5"
};

const panelLoadingStyle: CSSProperties = {
  border: "1px solid #d7dde4",
  background: "#f7f9fb"
};

const titleStyle: CSSProperties = {
  margin: "0 0 6px",
  color: "#3a2e2a"
};

const confidenceStyle: CSSProperties = {
  margin: "0 0 8px",
  color: "#6c5a4e",
  fontWeight: 600,
  fontSize: "13px"
};

const reasonStyle: CSSProperties = {
  margin: 0,
  color: "#403a37",
  fontSize: "13px",
  lineHeight: 1.4
};

const retryButtonStyle: CSSProperties = {
  marginTop: "10px",
  border: "1px solid #b8c2cd",
  background: "#ffffff",
  color: "#243445",
  borderRadius: "8px",
  padding: "6px 10px",
  fontSize: "12px",
  fontWeight: 600,
  transition: "transform 120ms ease, background-color 120ms ease, box-shadow 120ms ease",
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.08)",
  cursor: "pointer"
};

const retryButtonHoverStyle: CSSProperties = {
  background: "#f3f7fb",
  boxShadow: "0 2px 4px rgba(0, 0, 0, 0.12)"
};

const retryButtonPressedStyle: CSSProperties = {
  transform: "translateY(1px)",
  background: "#e8eef5",
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.08)"
};

if (typeof document !== "undefined" && !document.getElementById("signalframe-spin-style")) {
  const style = document.createElement("style");
  style.id = "signalframe-spin-style";
  style.textContent = "@keyframes signalframe-spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(style);
}
