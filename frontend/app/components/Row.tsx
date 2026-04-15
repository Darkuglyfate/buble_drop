"use client";

import type { CSSProperties, ReactNode } from "react";
import { GAP_REM, PADDING_REM, type Gap, type Padding } from "./layout-tokens";

type Align = "start" | "center" | "end" | "stretch" | "baseline";
type Justify = "start" | "center" | "end" | "between";

type RowProps = {
  children: ReactNode;
  gap?: Gap;
  padding?: Padding;
  align?: Align;
  justify?: Justify;
  wrap?: boolean;
  fullWidth?: boolean;
};

const ALIGN_VALUES: Record<Align, CSSProperties["alignItems"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  baseline: "baseline",
};

const JUSTIFY_VALUES: Record<Justify, CSSProperties["justifyContent"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
};

export function Row({
  children,
  gap = 3,
  padding,
  align = "center",
  justify = "start",
  wrap = false,
  fullWidth = false,
}: RowProps) {
  const style: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    gap: GAP_REM[gap],
    alignItems: ALIGN_VALUES[align],
    justifyContent: JUSTIFY_VALUES[justify],
    flexWrap: wrap ? "wrap" : "nowrap",
    width: fullWidth ? "100%" : undefined,
    padding: padding !== undefined ? PADDING_REM[padding] : undefined,
  };

  return <div style={style}>{children}</div>;
}
