"use client";

import type { CSSProperties, ReactNode } from "react";

export type HeadingLevel = "h1" | "h2" | "h3" | "h4";
type HeadingTone = "primary" | "muted";

type HeadingProps = {
  children: ReactNode;
  level?: HeadingLevel;
  tone?: HeadingTone;
};

const LEVEL_STYLES: Record<HeadingLevel, CSSProperties> = {
  h1: {
    fontSize: "1.25rem",
    fontWeight: 700,
    lineHeight: 1.3,
    letterSpacing: "-0.01em",
  },
  h2: {
    fontSize: "1.125rem",
    fontWeight: 700,
    lineHeight: 1.35,
  },
  h3: {
    fontSize: "0.9375rem",
    fontWeight: 600,
    lineHeight: 1.4,
  },
  h4: {
    fontSize: "0.8125rem",
    fontWeight: 600,
    lineHeight: 1.4,
  },
};

const TONE_COLORS: Record<HeadingTone, string> = {
  primary: "#27457b",
  muted: "#5d6f93",
};

export function Heading({ children, level = "h2", tone = "primary" }: HeadingProps) {
  const style: CSSProperties = {
    ...LEVEL_STYLES[level],
    color: TONE_COLORS[tone],
    margin: 0,
  };

  const Tag = level;
  return <Tag style={style}>{children}</Tag>;
}
