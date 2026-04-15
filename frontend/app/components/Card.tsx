"use client";

import type { CSSProperties, ReactNode } from "react";

type CardVariant = "default" | "muted" | "accent" | "warning" | "success";
type CardPadding = "sm" | "md" | "lg";

type CardProps = {
  children: ReactNode;
  variant?: CardVariant;
  padding?: CardPadding;
};

const PADDING_VALUES: Record<CardPadding, string> = {
  sm: "0.75rem",
  md: "1rem",
  lg: "1.25rem",
};

const VARIANT_STYLES: Record<CardVariant, CSSProperties> = {
  default: {
    background: "rgba(255, 255, 255, 0.78)",
    border: "1px solid #dce6ff",
    borderRadius: "1rem",
    boxShadow: "0 8px 24px rgba(143, 165, 216, 0.12)",
    backdropFilter: "blur(8px)",
  },
  muted: {
    background: "rgba(255, 255, 255, 0.6)",
    border: "1px solid #e6ecff",
    borderRadius: "0.75rem",
  },
  accent: {
    background: "linear-gradient(135deg, #dff2ff 0%, #e7e3ff 100%)",
    border: "1px solid #c8d6ff",
    borderRadius: "1rem",
    boxShadow: "0 8px 24px rgba(127, 143, 221, 0.18)",
  },
  warning: {
    background: "#fff2f7",
    border: "1px solid #ffd7e5",
    borderRadius: "0.75rem",
  },
  success: {
    background: "linear-gradient(135deg, #e7fbf0 0%, #d9f7ff 100%)",
    border: "1px solid #c3ebd5",
    borderRadius: "1rem",
  },
};

export function Card({
  children,
  variant = "default",
  padding = "md",
}: CardProps) {
  const style: CSSProperties = {
    ...VARIANT_STYLES[variant],
    padding: PADDING_VALUES[padding],
  };

  return <section style={style}>{children}</section>;
}
