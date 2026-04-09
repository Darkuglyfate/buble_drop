"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type IntroBubbleRole = "ambient" | "interactive" | "heroTarget";

type IntroBubbleSpec = {
  id: string;
  role: IntroBubbleRole;
  topPct: number;
  leftPct: number;
  sizeRem: number;
  delayMs: number;
  driftDurationMs: number;
  pulseDurationMs: number;
  driftX1: string;
  driftY1: string;
  driftX2: string;
  driftY2: string;
  driftX3: string;
  driftY3: string;
  driftX4: string;
  driftY4: string;
  hue: number;
  alpha: number;
};

export type { IntroBubbleRole, IntroBubbleSpec };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUIRED_INTRO_POPS = 4;
const INTRO_SKIP_SESSION_KEY = "bubbledrop:intro-skip-once";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function createIntroBubbles(count = 26, patternSeed = 0): IntroBubbleSpec[] {
  return Array.from({ length: count }, (_, index) => {
    const idx = index + 1;
    const seedOffset = patternSeed * 0.61803398875;
    const majorSeed = seededUnit(idx * 1.73 + seedOffset);
    const speedSeed = seededUnit(idx * 2.31 + seedOffset);
    const directionSeed = seededUnit(idx * 3.17 + seedOffset);
    const toneSeed = seededUnit(idx * 4.09 + seedOffset);
    const roleSeed = seededUnit(idx * 5.67 + seedOffset);
    const pathSeedA = seededUnit(idx * 10.11 + seedOffset);
    const pathSeedB = seededUnit(idx * 11.17 + seedOffset);
    const pathSeedC = seededUnit(idx * 12.23 + seedOffset);
    const pathSeedD = seededUnit(idx * 13.19 + seedOffset);
    const pathSeedE = seededUnit(idx * 14.27 + seedOffset);
    const role: IntroBubbleRole =
      roleSeed > 0.88 || idx % 11 === 0
        ? "heroTarget"
        : roleSeed > 0.42
          ? "interactive"
          : "ambient";
    const rolePalette =
      role === "heroTarget"
        ? [202, 214, 224, 272, 316]
        : role === "interactive"
          ? [198, 208, 220, 266, 308]
          : [192, 204, 214, 258, 294];
    const hue = rolePalette[Math.floor(toneSeed * rolePalette.length) % rolePalette.length];
    const baseTop =
      role === "heroTarget"
        ? 26 + majorSeed * 56
        : role === "interactive"
          ? 18 + majorSeed * 70
          : 12 + majorSeed * 82;
    const baseLeft = 7 + seededUnit(idx * 9.13 + seedOffset) * 86;
    const sizeRem =
      role === "heroTarget"
        ? 3.55 + majorSeed * 1.35
        : role === "interactive"
          ? 2.2 + majorSeed * 1.3
          : 1.2 + majorSeed * 1.5;
    const driftDurationMs =
      role === "heroTarget"
        ? 7600 + Math.round(speedSeed * 2800)
        : role === "interactive"
          ? 9800 + Math.round(speedSeed * 3600)
          : 14000 + Math.round(speedSeed * 5200);
    const pulseDurationMs =
      role === "heroTarget"
        ? 1900 + Math.round(pathSeedA * 900)
        : role === "interactive"
          ? 2400 + Math.round(pathSeedA * 1200)
          : 3200 + Math.round(pathSeedA * 1400);
    const driftScale = role === "ambient" ? 0.45 : role === "interactive" ? 0.8 : 1;

    return {
      id: `intro-${idx}`,
      role,
      topPct: Number(baseTop.toFixed(2)),
      leftPct: Number(baseLeft.toFixed(2)),
      sizeRem,
      delayMs: Math.round(speedSeed * 1600),
      driftDurationMs,
      pulseDurationMs,
      driftX1: `${Math.round((pathSeedA - 0.5) * 44 * driftScale)}vw`,
      driftY1: `${Math.round((pathSeedB - 0.5) * 32 * driftScale)}vh`,
      driftX2: `${Math.round((directionSeed - 0.5) * 40 * driftScale)}vw`,
      driftY2: `${Math.round((pathSeedC - 0.5) * 28 * driftScale)}vh`,
      driftX3: `${Math.round((pathSeedD - 0.5) * 36 * driftScale)}vw`,
      driftY3: `${Math.round((pathSeedE - 0.5) * 34 * driftScale)}vh`,
      driftX4: `${Math.round((pathSeedB - 0.5) * 26 * driftScale)}vw`,
      driftY4: `${Math.round((pathSeedD - 0.5) * 22 * driftScale)}vh`,
      hue,
      alpha:
        role === "ambient"
          ? 0.22 + seededUnit(idx * 8.21 + seedOffset) * 0.12
          : role === "interactive"
            ? 0.34 + seededUnit(idx * 8.21 + seedOffset) * 0.18
            : 0.46 + seededUnit(idx * 8.21 + seedOffset) * 0.2,
    };
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

type UseIntroBubbleGameOptions = {
  onIntroComplete: () => void;
};

export function useIntroBubbleGame({ onIntroComplete }: UseIntroBubbleGameOptions) {
  // ---- state ----
  const [welcomeIntroVisible, setWelcomeIntroVisible] = useState(true);
  const [introPoppedBubbleIds, setIntroPoppedBubbleIds] = useState<string[]>([]);
  const [introPoppingBubbleIds, setIntroPoppingBubbleIds] = useState<string[]>([]);
  const [introNudgedBubbleIds, setIntroNudgedBubbleIds] = useState<string[]>([]);
  const [introPopBursts, setIntroPopBursts] = useState<
    Array<{ id: string; x: number; y: number; hue: number }>
  >([]);
  const [introPatternSeed, setIntroPatternSeed] = useState(0);

  // ---- derived ----
  const introBubbles = useMemo(
    () => createIntroBubbles(26, introPatternSeed),
    [introPatternSeed],
  );
  const introBubbleMap = useMemo(
    () => new Map(introBubbles.map((bubble) => [bubble.id, bubble])),
    [introBubbles],
  );

  // ---- refs (audio) ----
  const introAudioContextRef = useRef<AudioContext | null>(null);
  const introAudioUnavailableRef = useRef(false);

  // ---- progress ----
  const introProgressCount = Math.min(REQUIRED_INTRO_POPS, introPoppedBubbleIds.length);
  const introBubblesRemaining = REQUIRED_INTRO_POPS - introProgressCount;

  // ---- effects ----

  // Cleanup audio context on unmount
  useEffect(() => {
    return () => {
      const currentAudioContext = introAudioContextRef.current;
      if (currentAudioContext) {
        void currentAudioContext.close();
      }
      introAudioContextRef.current = null;
    };
  }, []);

  // Seed the pattern & detect skipIntro on mount
  useEffect(() => {
    const nextSeed = Math.floor(Math.random() * 1_000_000);
    setIntroPatternSeed(nextSeed);
    if (typeof window === "undefined") {
      setWelcomeIntroVisible(true);
      return;
    }

    const url = new URL(window.location.href);
    const skipIntroFromQuery = url.searchParams.get("skipIntro") === "1";
    const skipIntroFromSession =
      window.sessionStorage.getItem(INTRO_SKIP_SESSION_KEY) === "1";
    const skipIntro = skipIntroFromQuery || skipIntroFromSession;
    setWelcomeIntroVisible(!skipIntro);

    if (skipIntroFromQuery) {
      window.sessionStorage.setItem(INTRO_SKIP_SESSION_KEY, "1");
      url.searchParams.delete("skipIntro");
      window.history.replaceState(null, "", url.toString());
    }
    if (skipIntroFromSession) {
      window.sessionStorage.removeItem(INTRO_SKIP_SESSION_KEY);
    }
  }, []);

  // Auto-hide when all required bubbles are popped
  useEffect(() => {
    if (!welcomeIntroVisible) {
      return;
    }
    if (introBubblesRemaining > 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setWelcomeIntroVisible(false);
      onIntroComplete();
    }, 320);
    return () => window.clearTimeout(timer);
  }, [introBubblesRemaining, welcomeIntroVisible, onIntroComplete]);

  // ---- audio ----

  const playIntroPopSound = () => {
    if (typeof window === "undefined") {
      return;
    }
    if (introAudioUnavailableRef.current) {
      return;
    }
    try {
      const contextCandidate = window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioContextCtor = window.AudioContext || contextCandidate.webkitAudioContext;
      if (!AudioContextCtor) {
        introAudioUnavailableRef.current = true;
        return;
      }
      let audioContext = introAudioContextRef.current;
      if (!audioContext) {
        audioContext = new AudioContextCtor();
        introAudioContextRef.current = audioContext;
      }
      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(640, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(210, audioContext.currentTime + 0.06);
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.06, audioContext.currentTime + 0.012);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.08);
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.09);
    } catch {
      // Sound is optional: keep interaction smooth even if audio fails.
      introAudioUnavailableRef.current = true;
    }
  };

  // ---- handlers ----

  const onPopIntroBubble = (bubbleId: string, event: MouseEvent<HTMLButtonElement>) => {
    if (!welcomeIntroVisible) {
      return;
    }
    const bubble = introBubbleMap.get(bubbleId);
    if (!bubble) {
      return;
    }
    if (
      introPoppedBubbleIds.includes(bubbleId) ||
      introPoppingBubbleIds.includes(bubbleId) ||
      introPoppedBubbleIds.length + introPoppingBubbleIds.length >= REQUIRED_INTRO_POPS
    ) {
      return;
    }
    setIntroPoppingBubbleIds((current) => [...current, bubbleId]);
    if ("vibrate" in navigator) {
      navigator.vibrate(12);
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const playfieldRect = event.currentTarget.parentElement?.getBoundingClientRect();
    const burstX = playfieldRect
      ? rect.left - playfieldRect.left + rect.width / 2
      : rect.width / 2;
    const burstY = playfieldRect
      ? rect.top - playfieldRect.top + rect.height / 2
      : rect.height / 2;
    const burstId = `${bubbleId}-${Date.now()}`;
    setIntroPopBursts((current) => [
      ...current,
      { id: burstId, x: burstX, y: burstY, hue: bubble.hue },
    ]);
    const nudgedIds = introBubbles
      .filter((candidate) => candidate.id !== bubbleId)
      .filter((candidate) => {
        const dx = candidate.leftPct - bubble.leftPct;
        const dy = candidate.topPct - bubble.topPct;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < 24;
      })
      .map((candidate) => candidate.id);
    setIntroNudgedBubbleIds(nudgedIds);
    window.setTimeout(() => {
      setIntroPoppingBubbleIds((current) => current.filter((id) => id !== bubbleId));
      setIntroPoppedBubbleIds((current) => {
        if (current.includes(bubbleId)) {
          return current;
        }
        return [...current, bubbleId];
      });
    }, 220);
    window.setTimeout(() => {
      setIntroPopBursts((current) => current.filter((burst) => burst.id !== burstId));
    }, 550);
    window.setTimeout(() => {
      setIntroNudgedBubbleIds((current) =>
        current.filter((candidateId) => !nudgedIds.includes(candidateId)),
      );
    }, 420);
    playIntroPopSound();
  };

  const onSkipIntro = () => {
    setWelcomeIntroVisible(false);
  };

  // ---- public API ----

  return {
    welcomeIntroVisible,
    introBubbles,
    introPoppedBubbleIds,
    introPoppingBubbleIds,
    introNudgedBubbleIds,
    introPopBursts,
    introProgressCount,
    requiredIntroPops: REQUIRED_INTRO_POPS,
    introBubblesRemaining,
    onPopIntroBubble,
    onSkipIntro,
  };
}
