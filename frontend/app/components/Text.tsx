"use client";

import type { CSSProperties, ReactNode } from "react";

type TextVariant = "body" | "caption" | "label" | "overline" | "mono";
type TextTone = "primary" | "secondary" | "muted" | "accent" | "danger" | "success";
type TextWeight = "normal" | "semibold" | "bold";

type TextProps = {
  children: ReactNode;
  variant?: TextVariant;
  tone?: TextTone;
  weight?: TextWeight;
};

const VARIANT_STYLES: Record<TextVariant, CSSProperties> = {
  body: { fontSize: "0.875rem", lineHeight: 1.5 },
  caption: { fontSize: "0.75rem", lineHeight: 1.4 },
  label: { fontSize: "0.8125rem", lineHeight: 1.4 },
  overline: {
    fontSize: "0.6875rem",
    lineHeight: 1.4,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontWeight: 600,
  },
  mono: {
    fontSize: "0.75rem",
    fontFamily: "var(--font-source-code-pro), monospace",
  },
};

const TONE_COLORS: Record<TextTone, string> = {
  primary: "#27457b",
  secondary: "#5d76a5",
  muted: "#6074a0",
  accent: "#536ea4",
  danger: "#7f3a53",
  success: "#2f6f53",
};

const WEIGHT_VALUES: Record<TextWeight, number> = {
  normal: 400,
  semibold: 600,
  bold: 700,
};

// body = paragraph (block), everything else = inline
const BLOCK_VARIANTS: ReadonlyArray<TextVariant> = ["body"];

export function Text({
  children,
  variant = "body",
  tone = "secondary",
  weight = "normal",
}: TextProps) {
  const style: CSSProperties = {
    ...VARIANT_STYLES[variant],
    color: TONE_COLORS[tone],
    fontWeight: WEIGHT_VALUES[weight],
    margin: 0,
  };

  const Tag = BLOCK_VARIANTS.includes(variant) ? "p" : "span";
  return <Tag style={style}>{children}</Tag>;
}
