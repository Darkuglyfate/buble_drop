"use client";

import type { CSSProperties, ReactNode } from "react";
import { GAP_REM, PADDING_REM, type Gap, type Padding } from "./layout-tokens";

type Align = "start" | "center" | "end" | "stretch";
type Justify = "start" | "center" | "end" | "between";

type StackProps = {
  children: ReactNode;
  gap?: Gap;
  padding?: Padding;
  align?: Align;
  justify?: Justify;
  fullWidth?: boolean;
  flex?: boolean;
};

const ALIGN_VALUES: Record<Align, CSSProperties["alignItems"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
};

const JUSTIFY_VALUES: Record<Justify, CSSProperties["justifyContent"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
};

export function Stack({
  children,
  gap = 3,
  padding,
  align = "stretch",
  justify = "start",
  fullWidth = true,
  flex = false,
}: StackProps) {
  const style: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: GAP_REM[gap],
    alignItems: ALIGN_VALUES[align],
    justifyContent: JUSTIFY_VALUES[justify],
    width: fullWidth ? "100%" : undefined,
    flex: flex ? 1 : undefined,
    padding: padding !== undefined ? PADDING_REM[padding] : undefined,
  };

  return <div style={style}>{children}</div>;
}
