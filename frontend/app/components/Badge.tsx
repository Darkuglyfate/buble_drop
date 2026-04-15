"use client";

import type { CSSProperties, ReactNode } from "react";

type BadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "muted"
  | "rare"
  | "qualified";

type BadgeSize = "sm" | "md";

type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  size?: BadgeSize;
};

const SIZE_STYLES: Record<BadgeSize, CSSProperties> = {
  sm: {
    padding: "0.125rem 0.5rem",
    fontSize: "0.625rem",
    borderRadius: "9999px",
  },
  md: {
    padding: "0.25rem 0.625rem",
    fontSize: "0.6875rem",
    borderRadius: "9999px",
  },
};

const TONE_STYLES: Record<BadgeTone, CSSProperties> = {
  neutral: {
    background: "#eef2fb",
    color: "#5d6f93",
  },
  info: {
    background: "linear-gradient(135deg, #dff2ff 0%, #e7e3ff 100%)",
    color: "#39588d",
  },
  success: {
    background: "#e7fbf0",
    color: "#2f6f53",
  },
  warning: {
    background: "#fff4d9",
    color: "#8a5a10",
  },
  danger: {
    background: "#fff2f7",
    color: "#7f3a53",
  },
  muted: {
    background: "#f2ecff",
    color: "#6a5d93",
  },
  rare: {
    background: "linear-gradient(135deg, #fff0b0 0%, #ffd8ef 100%)",
    color: "#6e4f1f",
    boxShadow: "0 0 16px rgba(255, 212, 135, 0.45)",
  },
  qualified: {
    background: "linear-gradient(135deg, #ffe38f 0%, #ffb5e7 100%)",
    color: "#6b3f00",
    boxShadow: "0 0 20px rgba(255, 208, 128, 0.65)",
  },
};

export function Badge({ children, tone = "neutral", size = "md" }: BadgeProps) {
  const style: CSSProperties = {
    ...SIZE_STYLES[size],
    ...TONE_STYLES[tone],
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    whiteSpace: "nowrap",
  };

  return <span style={style}>{children}</span>;
}
