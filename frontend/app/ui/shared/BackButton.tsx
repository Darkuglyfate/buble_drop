"use client";

import Link from "next/link";
import {
  useBubbleDropRuntime,
  withBubbleDropContext,
} from "../../bubbledrop-runtime";
import { UnifiedIcon } from "../unified-icons";

type BackButtonProps = {
  href?: string;
  skipIntro?: boolean;
};

export function BackButton({ href = "/", skipIntro = true }: BackButtonProps) {
  const { profileId, walletAddress } = useBubbleDropRuntime();

  return (
    <Link
      href={withBubbleDropContext(href, { profileId, walletAddress }, { skipIntro })}
      className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#425b8a]"
    >
      <UnifiedIcon kind="back" className="ui-icon ui-icon-active text-[#425b8a]" />
      Back
    </Link>
  );
}
