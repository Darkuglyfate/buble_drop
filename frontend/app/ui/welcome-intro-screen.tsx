import type { CSSProperties, MouseEvent } from "react";

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

  return (
    <section className="intro-welcome-overlay">
      <div className="intro-welcome-card">
        <div className="intro-welcome-shell">
          <div className="intro-welcome-head">
            <div className="intro-welcome-head-copy">
              <p className="intro-welcome-kicker">Pearl portal entry</p>
              <p className="intro-welcome-headline">A polished entrance into BubbleDrop</p>
            </div>
            <button type="button" onClick={onSkipIntro} className="intro-welcome-skip">
              Skip
            </button>
          </div>

          <div className="intro-welcome-center">
            <div className="intro-welcome-hero">
              <p className="intro-welcome-brandline">Luxury drop sequence</p>
              <h1 className="intro-welcome-wordmark" aria-label="BUBBLE DROP">
                <span className="intro-welcome-word intro-welcome-word-bubble">BUBBLE</span>
                <span className="intro-welcome-word intro-welcome-word-drop">DROP</span>
              </h1>
              <p className="intro-welcome-title">Wake the pearl portal and step into the drop.</p>
              <p className="intro-welcome-subtitle">
                Pop the glowing marked bubbles to unlock your entrance. The ritual stays the same,
                only the welcome now feels worthy of the world behind it.
              </p>
            </div>

            <div className="intro-welcome-portal-cluster">
              <div className="intro-welcome-portal-ring" style={{ "--intro-progress-ratio": `${progressRatio * 100}%` } as CSSProperties}>
                <div className="intro-welcome-portal-core-shell">
                  <div className="intro-welcome-portal-core">
                    <span className="intro-welcome-portal-overline">Portal status</span>
                    <span className="intro-welcome-portal-state">
                      {introBubblesRemaining > 0 ? "Awaiting touch" : "Opening"}
                    </span>
                    <span className="intro-welcome-portal-caption">
                      {introProgressCount}/{requiredIntroPops} pearls awakened
                    </span>
                  </div>
                </div>
              </div>

              <div className="intro-welcome-progress-panel">
                <div className="intro-welcome-progress-stack">
                  <span className="intro-welcome-progress-label">Entry progress</span>
                  <span className="intro-welcome-progress">{introProgressCount}/{requiredIntroPops}</span>
                </div>
                <p className="intro-welcome-helper">
                  {introBubblesRemaining > 0
                    ? "Pop the glowing pearls around the portal to enter Bubble World."
                    : "Portal unlocked. Entering Bubble World..."}
                </p>
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
            return (
              <button
                key={bubble.id}
                type="button"
                onClick={(event) => onPopIntroBubble(bubble.id, event)}
                className={`intro-bubble intro-bubble-${bubble.role} ${
                  introNudgedBubbleIds.includes(bubble.id) ? "intro-bubble-nudged" : ""
                } ${isPopping ? "intro-bubble-popping" : ""}`}
                aria-label="Tap bubble to enter Bubble World"
                style={
                  {
                    top: `${bubble.topPct}%`,
                    left: `${bubble.leftPct}%`,
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
                  } as CSSProperties
                }
              >
                {bubble.role === "ambient" ? (
                  <span className="intro-bubble-beacon" />
                ) : (
                  <span className="intro-bubble-signal">TAP</span>
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
