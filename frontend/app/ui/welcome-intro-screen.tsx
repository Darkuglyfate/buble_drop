import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";

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

type IntroPopBurst = {
  id: string;
  x: number;
  y: number;
  hue: number;
};

type WelcomeIntroScreenProps = {
  introProgressCount: number;
  requiredIntroPops: number;
  introBubblesRemaining: number;
  introBubbles: IntroBubbleSpec[];
  introPoppedBubbleIds: string[];
  introPoppingBubbleIds: string[];
  introNudgedBubbleIds: string[];
  introPopBursts: IntroPopBurst[];
  onSkipIntro: () => void;
  onPopIntroBubble: (bubbleId: string, event: MouseEvent<HTMLButtonElement>) => void;
};

export function WelcomeIntroScreen({
  introProgressCount,
  requiredIntroPops,
  introBubblesRemaining,
  introBubbles,
  introPoppedBubbleIds,
  introPoppingBubbleIds,
  introNudgedBubbleIds,
  introPopBursts,
  onSkipIntro,
  onPopIntroBubble,
}: WelcomeIntroScreenProps) {
  const progressRatio = Math.min(1, Math.max(0, introProgressCount / requiredIntroPops));
  const [portalPressed, setPortalPressed] = useState(false);
  const [portalWakeActive, setPortalWakeActive] = useState(false);
  const activeTargetBubbles = introBubbles.filter((bubble) => bubble.role !== "ambient");

  useEffect(() => {
    if (introPopBursts.length === 0) {
      return;
    }
    setPortalWakeActive(true);
    const timeoutId = window.setTimeout(() => {
      setPortalWakeActive(false);
    }, 460);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [introPopBursts.length]);

  const triggerPortalWake = () => {
    setPortalWakeActive(true);
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
    }
    window.setTimeout(() => {
      setPortalWakeActive(false);
    }, 320);
  };

  const getAmbientDisplayPosition = (bubble: IntroBubbleSpec) => {
    let topPct = bubble.topPct;
    let leftPct = bubble.leftPct;

    const insideTitleSafeZone = topPct <= 31 && leftPct >= 18 && leftPct <= 82;
    const insidePortalSafeZone = topPct >= 34 && topPct <= 72 && leftPct >= 28 && leftPct <= 72;

    if (insideTitleSafeZone) {
      topPct = Math.max(8, topPct - 10);
      leftPct += leftPct < 50 ? -12 : 12;
    }

    if (insidePortalSafeZone) {
      leftPct += leftPct < 50 ? -14 : 14;
      topPct += topPct < 53 ? -6 : 8;
    }

    return {
      topPct: Math.min(90, Math.max(6, topPct)),
      leftPct: Math.min(92, Math.max(8, leftPct)),
    };
  };

  const getTargetDisplayPosition = (bubble: IntroBubbleSpec, targetIndex: number) => {
    const targetSlots = [
      { topPct: 39, leftPct: 28 },
      { topPct: 40, leftPct: 72 },
      { topPct: 70, leftPct: 26 },
      { topPct: 69, leftPct: 74 },
    ];
    const fallbackSlot = targetSlots[targetIndex % targetSlots.length];
    const heroSlot = { topPct: 27, leftPct: 72 };

    if (bubble.role === "heroTarget") {
      return heroSlot;
    }

    return fallbackSlot;
  };

  return (
    <section className="intro-welcome-overlay">
      <div className="intro-welcome-card">
        <div className="intro-welcome-shell">
          <div className="intro-welcome-head">
            <p className="intro-welcome-kicker">Pearl portal entry</p>
            <button type="button" onClick={onSkipIntro} className="intro-welcome-skip">
              Skip
            </button>
          </div>

          <div className="intro-welcome-center">
            <div className="intro-welcome-hero">
              <h1 className="intro-welcome-title">BUBBLEDROP</h1>
              <p className="intro-welcome-subtitle">Wake four glowing pearls to open the portal.</p>
            </div>

            <div className="intro-welcome-portal-cluster">
              <button
                type="button"
                className={`intro-welcome-portal-button ${portalPressed ? "intro-welcome-portal-button-pressed" : ""} ${
                  portalWakeActive ? "intro-welcome-portal-button-waking" : ""
                }`}
                onPointerDown={() => {
                  setPortalPressed(true);
                  triggerPortalWake();
                }}
                onPointerUp={() => {
                  setPortalPressed(false);
                }}
                onPointerLeave={() => {
                  setPortalPressed(false);
                }}
                aria-label="Pearl portal"
              >
                <div
                  className="intro-welcome-portal-ring"
                  style={{ "--intro-progress-ratio": `${progressRatio * 100}%` } as CSSProperties}
                >
                  <div className="intro-welcome-portal-halo" />
                  <div className="intro-welcome-portal-core-shell">
                    <div className="intro-welcome-portal-core">
                      <span className="intro-welcome-portal-specular" />
                      <span className="intro-welcome-portal-heart" />
                    </div>
                  </div>
                </div>
              </button>

              <div className="intro-welcome-progress-chip">
                <span className="intro-welcome-progress-label">Entry</span>
                <span className="intro-welcome-progress-value">
                  {introBubblesRemaining > 0
                    ? `${introProgressCount}/${requiredIntroPops}`
                    : "Opening"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="intro-welcome-playfield" aria-hidden="false">
          <div className="intro-welcome-ambient intro-welcome-ambient-a" />
          <div className="intro-welcome-ambient intro-welcome-ambient-b" />
          <div className="intro-welcome-ambient intro-welcome-ambient-c" />
          {introBubbles.map((bubble) => {
            const popped = introPoppedBubbleIds.includes(bubble.id);
            if (popped) {
              return null;
            }
            const isPopping = introPoppingBubbleIds.includes(bubble.id);
            const targetIndex = activeTargetBubbles.findIndex((candidate) => candidate.id === bubble.id);
            const displayPosition =
              bubble.role === "ambient"
                ? getAmbientDisplayPosition(bubble)
                : getTargetDisplayPosition(bubble, Math.max(0, targetIndex));
            const bubbleStyle = {
              top: `${displayPosition.topPct}%`,
              left: `${displayPosition.leftPct}%`,
              width: `${bubble.sizeRem}rem`,
              height: `${bubble.sizeRem}rem`,
              "--intro-delay": `${bubble.delayMs}ms`,
              "--intro-drift-duration": `${bubble.driftDurationMs}ms`,
              "--intro-pulse-duration": `${bubble.pulseDurationMs}ms`,
              "--intro-drift-x1": bubble.driftX1,
              "--intro-drift-y1": bubble.driftY1,
              "--intro-drift-x2": bubble.driftX2,
              "--intro-drift-y2": bubble.driftY2,
              "--intro-drift-x3": bubble.driftX3,
              "--intro-drift-y3": bubble.driftY3,
              "--intro-drift-x4": bubble.driftX4,
              "--intro-drift-y4": bubble.driftY4,
              "--intro-bubble-hue": `${bubble.hue}`,
              "--intro-bubble-alpha": `${bubble.alpha}`,
            } as CSSProperties;

            if (bubble.role === "ambient") {
              return (
                <span
                  key={bubble.id}
                  className="intro-bubble intro-bubble-ambient"
                  aria-hidden="true"
                  style={bubbleStyle}
                >
                  <span className="intro-bubble-beacon" />
                </span>
              );
            }

            return (
              <button
                key={bubble.id}
                type="button"
                onClick={(event) => onPopIntroBubble(bubble.id, event)}
                className={`intro-bubble intro-bubble-${bubble.role} ${
                  introNudgedBubbleIds.includes(bubble.id) ? "intro-bubble-nudged" : ""
                } ${isPopping ? "intro-bubble-popping" : ""}`}
                aria-label="Tap bubble to enter Bubble World"
                style={bubbleStyle}
              >
                {bubble.role === "heroTarget" ? (
                  <span className="intro-bubble-signal">TAP</span>
                ) : (
                  <span className="intro-bubble-indicator" />
                )}
              </button>
            );
          })}
          {introPopBursts.map((burst) => (
            <span
              key={burst.id}
              className="intro-pop-burst"
              style={
                {
                  left: `${burst.x}px`,
                  top: `${burst.y}px`,
                  "--intro-burst-hue": `${burst.hue}`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}
