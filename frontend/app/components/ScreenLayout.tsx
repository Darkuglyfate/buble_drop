"use client";

import type { CSSProperties, ReactNode } from "react";

type ScreenLayoutProps = {
  children: ReactNode;
};

const CONTAINER_STYLE: CSSProperties = {
  position: "relative",
  minHeight: "100vh",
  padding: "1.5rem 1rem",
};

const BACKGROUND_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  overflow: "hidden",
};

const MAIN_STYLE: CSSProperties = {
  position: "relative",
  zIndex: 10,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  width: "100%",
  maxWidth: "28rem",
  gap: "1rem",
};

// Documented exception: the floating-bubbles animation lives in globals.css
// (keyframes + positional styles). Moving it inline is not practical;
// this is the single allowed external-CSS dependency in the component library.
export function ScreenLayout({ children }: ScreenLayoutProps) {
  return (
    <div style={CONTAINER_STYLE}>
      <div style={BACKGROUND_STYLE} className="floating-bubbles">
        <span className="bubble b1" />
        <span className="bubble b2" />
        <span className="bubble b3" />
        <span className="bubble b4" />
      </div>
      <main style={MAIN_STYLE}>{children}</main>
    </div>
  );
}
