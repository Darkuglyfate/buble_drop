"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import {
  useBubbleDropRuntime,
  withBubbleDropContext,
} from "../bubbledrop-runtime";
import { UnifiedIcon } from "../ui/unified-icons";

type BackButtonProps = {
  href?: string;
  skipIntro?: boolean;
};

// BackButton renders a Link (not <button>), so it can't reuse <Button>.
// Its styling mirrors Button variant="secondary", size="sm" — kept in sync manually.
const STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.375rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#425b8a",
  background: "rgba(255, 255, 255, 0.8)",
  border: "1px solid #dce6ff",
  borderRadius: "0.5rem",
  textDecoration: "none",
};

const ICON_STYLE: CSSProperties = {
  width: "0.875rem",
  height: "0.875rem",
  color: "currentColor",
  flexShrink: 0,
};

export function BackButton({ href = "/", skipIntro = true }: BackButtonProps) {
  const { profileId, walletAddress } = useBubbleDropRuntime();
  const target = withBubbleDropContext(href, { profileId, walletAddress }, { skipIntro });

  return (
    <Link href={target} style={STYLE}>
      <span style={ICON_STYLE}>
        <UnifiedIcon kind="back" />
      </span>
      Back
    </Link>
  );
}
