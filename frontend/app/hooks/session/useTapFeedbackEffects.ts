"use client";

import { useCallback, useState } from "react";

const PLAYFIELD_TOUCH_CUE_DURATION_MS = 620;
const COMBO_BURST_DURATION_MS = 980;
const FUN_OVERLAY_ITEM_DURATION_MS = 1180;

const COMBO_BURST_TIER_CONFIG = [
  { combo: 3, label: "Combo rise", accent: "x3", hue: 198, scale: 1 },
  { combo: 5, label: "Flow locked", accent: "x5", hue: 286, scale: 1.16 },
  { combo: 8, label: "Pop frenzy", accent: "x8", hue: 38, scale: 1.32 },
] as const;

const FUN_OVERLAY_ITEM_CONFIG = [
  { kind: "pearl-shard" as const, hue: 196, label: "Pearl shard" },
  { kind: "xp-crystal" as const, hue: 42, label: "XP crystal" },
  { kind: "season-sigil" as const, hue: 318, label: "Season sigil" },
] as const;

type SpecialBubbleKind = "cat" | "heart" | "star" | "balloon" | "cloud" | "crown" | "gem" | "golden";

export type PopBurst = {
  id: number;
  xPercent: number;
  yPercent: number;
  hue: number;
  sizeRem: number;
  isBonus: boolean;
  specialKind: SpecialBubbleKind | null;
  comboTier: number | null;
  source: "user" | "helper" | "chain";
};

export type ComboBurst = {
  id: number;
  xPercent: number;
  yPercent: number;
  label: string;
  accent: string;
  hue: number;
  scale: number;
};

export type FunOverlayItem = {
  id: number;
  xPercent: number;
  yPercent: number;
  kind: "pearl-shard" | "xp-crystal" | "season-sigil";
  hue: number;
  label: string;
};

export type PlayfieldTouchCue = {
  id: number;
  topPercent: number;
  leftPercent: number;
  tone: "assist" | "miss" | "helper";
};

const HELPER_SHOT_CUE_DURATION_MS = 1_080;

export function useTapFeedbackEffects() {
  const [popBursts, setPopBursts] = useState<PopBurst[]>([]);
  const [comboBursts, setComboBursts] = useState<ComboBurst[]>([]);
  const [funOverlayItems, setFunOverlayItems] = useState<FunOverlayItem[]>([]);
  const [playfieldTouchCue, setPlayfieldTouchCue] = useState<PlayfieldTouchCue | null>(null);
  const [tapFeedbackPoint, setTapFeedbackPoint] = useState<{
    topPercent: number;
    leftPercent: number;
  } | null>(null);

  const queuePopBurst = useCallback(
    (params: {
      xPercent: number;
      yPercent: number;
      hue: number;
      sizeRem: number;
      isBonus: boolean;
      specialKind: SpecialBubbleKind | null;
      comboTier: number | null;
      source: PopBurst["source"];
    }) => {
      const burstId = Math.floor(Math.random() * 1_000_000_000);
      setPopBursts((current) => [
        ...current,
        {
          id: burstId,
          xPercent: params.xPercent,
          yPercent: params.yPercent,
          hue: params.hue,
          sizeRem: params.sizeRem,
          isBonus: params.isBonus,
          specialKind: params.specialKind,
          comboTier: params.comboTier,
          source: params.source,
        },
      ]);
      window.setTimeout(() => {
        setPopBursts((current) => current.filter((burst) => burst.id !== burstId));
      }, params.source === "helper" ? HELPER_SHOT_CUE_DURATION_MS : 620);
    },
    [],
  );

  const triggerComboBurst = useCallback(
    (
      comboValue: number,
      point: { xPercent: number; yPercent: number },
    ): number | null => {
      const comboTier =
        [...COMBO_BURST_TIER_CONFIG]
          .reverse()
          .find((tier) => comboValue >= tier.combo) ?? null;
      if (!comboTier) {
        return null;
      }
      const comboBurstId = Math.floor(Math.random() * 1_000_000_000);
      setComboBursts((current) => [
        ...current,
        {
          id: comboBurstId,
          xPercent: point.xPercent,
          yPercent: point.yPercent,
          label: comboTier.label,
          accent: comboTier.accent,
          hue: comboTier.hue,
          scale: comboTier.scale,
        },
      ]);
      window.setTimeout(() => {
        setComboBursts((current) => current.filter((burst) => burst.id !== comboBurstId));
      }, COMBO_BURST_DURATION_MS);
      return comboTier.combo;
    },
    [],
  );

  const spawnFunOverlayItem = useCallback(
    (
      point: { xPercent: number; yPercent: number },
      isBonusSource: boolean,
      comboValue: number,
    ) => {
      const shouldSpawnItem =
        isBonusSource || comboValue >= 5 || Math.random() < 0.34;
      if (!shouldSpawnItem) {
        return;
      }
      const config =
        FUN_OVERLAY_ITEM_CONFIG[
          Math.floor(Math.random() * FUN_OVERLAY_ITEM_CONFIG.length)
        ];
      const itemId = Math.floor(Math.random() * 1_000_000_000);
      setFunOverlayItems((current) => [
        ...current,
        {
          id: itemId,
          xPercent: point.xPercent,
          yPercent: point.yPercent,
          kind: config.kind,
          hue: config.hue,
          label: config.label,
        },
      ]);
      window.setTimeout(() => {
        setFunOverlayItems((current) => current.filter((item) => item.id !== itemId));
      }, FUN_OVERLAY_ITEM_DURATION_MS);
    },
    [],
  );

  const showPlayfieldTouchCue = useCallback(
    (
      tone: PlayfieldTouchCue["tone"],
      point: { topPercent: number; leftPercent: number },
    ) => {
      const cueId = Math.floor(Math.random() * 1_000_000_000);
      setPlayfieldTouchCue({
        id: cueId,
        topPercent: point.topPercent,
        leftPercent: point.leftPercent,
        tone,
      });
      window.setTimeout(() => {
        setPlayfieldTouchCue((current) => (current?.id === cueId ? null : current));
      }, PLAYFIELD_TOUCH_CUE_DURATION_MS);
    },
    [],
  );

  const resetFeedbackEffects = useCallback(() => {
    setPopBursts([]);
    setComboBursts([]);
    setFunOverlayItems([]);
    setPlayfieldTouchCue(null);
    setTapFeedbackPoint(null);
  }, []);

  return {
    popBursts,
    comboBursts,
    funOverlayItems,
    playfieldTouchCue,
    tapFeedbackPoint,
    setTapFeedbackPoint,
    queuePopBurst,
    triggerComboBurst,
    spawnFunOverlayItem,
    showPlayfieldTouchCue,
    resetFeedbackEffects,
  };
}
