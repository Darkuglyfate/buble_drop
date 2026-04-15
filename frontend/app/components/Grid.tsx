"use client";

import type { CSSProperties, ReactNode } from "react";
import { GAP_REM, type Gap } from "./layout-tokens";

type Columns = 1 | 2 | 3 | 4;

type GridProps = {
  children: ReactNode;
  columns?: Columns;
  gap?: Gap;
  fullWidth?: boolean;
};

export function Grid({
  children,
  columns = 2,
  gap = 3,
  fullWidth = true,
}: GridProps) {
  const style: CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: GAP_REM[gap],
    width: fullWidth ? "100%" : undefined,
  };

  return <div style={style}>{children}</div>;
}
