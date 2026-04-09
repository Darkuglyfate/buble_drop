"use client";

import { useCallback, useRef, useState } from "react";

const COMBO_WINDOW_MS = 1500;
const TAP_FEEDBACK_XP_PER_UNIT = 12;

export function useActivePlayTracking() {
  const [activeTapCount, setActiveTapCount] = useState(0);
  const [tapCombo, setTapCombo] = useState(0);
  const [bestTapCombo, setBestTapCombo] = useState(0);
  const [lastTapRewardXp, setLastTapRewardXp] = useState(TAP_FEEDBACK_XP_PER_UNIT);
  const [lastTapFeedbackAtMs, setLastTapFeedbackAtMs] = useState<number | null>(null);
  const lastTapAtMsRef = useRef<number | null>(null);
  const tapComboRef = useRef(0);

  const onRecordTap = useCallback(
    (tapUnits: number): { nextCombo: number; tapRewardXp: number } => {
      const now = Date.now();
      const tapRewardXp = tapUnits * TAP_FEEDBACK_XP_PER_UNIT;
      const nextCombo =
        lastTapAtMsRef.current !== null && now - lastTapAtMsRef.current <= COMBO_WINDOW_MS
          ? tapComboRef.current + 1
          : 1;

      setActiveTapCount((prev) => prev + tapUnits);
      setLastTapRewardXp(tapRewardXp);
      setLastTapFeedbackAtMs(now);
      setTapCombo(nextCombo);
      tapComboRef.current = nextCombo;
      setBestTapCombo((prevBest) => Math.max(prevBest, nextCombo));
      lastTapAtMsRef.current = now;

      return { nextCombo, tapRewardXp };
    },
    [],
  );

  const resetPlayTracking = useCallback(() => {
    setActiveTapCount(0);
    setTapCombo(0);
    tapComboRef.current = 0;
    setBestTapCombo(0);
    setLastTapRewardXp(TAP_FEEDBACK_XP_PER_UNIT);
    setLastTapFeedbackAtMs(null);
    lastTapAtMsRef.current = null;
  }, []);

  return {
    activeTapCount,
    tapCombo,
    bestTapCombo,
    lastTapRewardXp,
    lastTapFeedbackAtMs,
    onRecordTap,
    resetPlayTracking,
  };
}
