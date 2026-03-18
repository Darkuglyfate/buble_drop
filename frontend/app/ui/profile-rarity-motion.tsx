"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import type { TargetAndTransition, Transition } from "framer-motion";
import {
  normalizeProfileStyleRarity,
  type ProfileStyleRarity,
} from "./profile-style-rarity";

type BubbleShellProps = {
  rarity: ProfileStyleRarity | string | null | undefined;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & Pick<
  HTMLMotionProps<"div">,
  "onPointerDown" | "onPointerUp" | "onPointerLeave" | "onPointerCancel"
>;

const enter = { duration: 0.35, ease: "easeOut" as const };

/** Кольцевая рамка как у Legendary: conic за аватаром + контрблик (видна только кайма). */
function rarityConicFrame({
  outerBlurClass,
  outerBlurAnimate,
  outerBlurTransition,
  mainGradient,
  mainInset,
  mainRotateSec,
  mainOpacity,
  shineGradient,
  shineInset,
  shineRotateSec,
  shineOpacity,
  reduce,
}: {
  outerBlurClass: string;
  outerBlurAnimate: TargetAndTransition;
  outerBlurTransition: Transition;
  mainGradient: string;
  mainInset: string;
  mainRotateSec: number;
  mainOpacity: string;
  shineGradient: string;
  shineInset: string;
  shineRotateSec: number;
  shineOpacity: string;
  reduce: boolean;
}) {
  if (reduce) return null;
  return (
    <>
      <motion.div
        aria-hidden
        className={`pointer-events-none absolute z-[-2] rounded-[2.85rem] ${outerBlurClass}`}
        style={{ inset: "-12px" }}
        animate={outerBlurAnimate}
        transition={outerBlurTransition}
      />
      <motion.div
        aria-hidden
        className={`pointer-events-none absolute z-0 rounded-[2.52rem] ${mainOpacity}`}
        style={{
          inset: mainInset,
          background: mainGradient,
        }}
        animate={{ rotate: 360 }}
        transition={{
          duration: mainRotateSec,
          repeat: Infinity,
          ease: "linear",
        }}
      />
      <motion.div
        aria-hidden
        className={`pointer-events-none absolute z-0 rounded-[2.56rem] ${shineOpacity}`}
        style={{
          inset: shineInset,
          background: shineGradient,
        }}
        animate={{ rotate: -360 }}
        transition={{
          duration: shineRotateSec,
          repeat: Infinity,
          ease: "linear",
        }}
      />
    </>
  );
}

function orbitSpark(
  deg: number,
  radius: number,
  duration: number,
  delay: number,
  colorClass: string,
) {
  const rad = (deg * Math.PI) / 180;
  return (
    <motion.span
      key={`${deg}-${radius}`}
      aria-hidden
      className={`pointer-events-none absolute left-1/2 top-1/2 z-[2] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${colorClass} shadow-[0_0_10px_currentColor]`}
      animate={{
        x: [0, Math.cos(rad) * radius, 0],
        y: [0, Math.sin(rad) * radius, 0],
        opacity: [0.25, 1, 0.25],
        scale: [0.6, 1.15, 0.6],
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: "easeInOut",
        delay,
      }}
    />
  );
}

/** Маленькие золотые пузыри на настоящей круговой орбите (фаза + вращение). */
function LegendOrbitBubble({
  phaseDeg,
  radiusPx,
  durationSec,
  reverse,
  sizePx,
}: {
  phaseDeg: number;
  radiusPx: number;
  durationSec: number;
  reverse?: boolean;
  sizePx: number;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 z-[3]"
      style={{
        width: 0,
        height: 0,
        transform: `translate(-50%, -50%) rotate(${phaseDeg}deg)`,
      }}
    >
      <motion.div
        className="relative"
        style={{ width: 0, height: 0 }}
        animate={{ rotate: reverse ? -360 : 360 }}
        transition={{
          duration: durationSec,
          repeat: Infinity,
          ease: "linear",
        }}
      >
        <motion.span
          className="absolute left-0 top-0 block rounded-full -translate-x-1/2 border border-amber-100/50"
          style={{
            width: sizePx,
            height: sizePx,
            top: -radiusPx,
            background:
              "radial-gradient(circle at 32% 28%, #fffef5, #fde68a 42%, #f59e0b 72%, #b45309)",
            boxShadow:
              "0 0 10px rgba(251,191,36,0.65), inset 0 1px 3px rgba(255,255,255,0.55)",
          }}
          animate={{
            scale: [0.94, 1.06, 0.94],
            opacity: [0.88, 1, 0.88],
          }}
          transition={{
            duration: 2.2 + (sizePx % 3) * 0.15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </motion.div>
    </div>
  );
}

const LEGEND_ORBIT_BUBBLES: Array<{
  phaseDeg: number;
  radiusPx: number;
  durationSec: number;
  reverse?: boolean;
  sizePx: number;
}> = [
  { phaseDeg: 0, radiusPx: 58, durationSec: 10, sizePx: 7 },
  { phaseDeg: 51, radiusPx: 64, durationSec: 14, reverse: true, sizePx: 5 },
  { phaseDeg: 103, radiusPx: 54, durationSec: 8, sizePx: 6 },
  { phaseDeg: 162, radiusPx: 61, durationSec: 11.5, reverse: true, sizePx: 5 },
  { phaseDeg: 218, radiusPx: 56, durationSec: 9.2, sizePx: 8 },
  { phaseDeg: 275, radiusPx: 66, durationSec: 16, sizePx: 4 },
  { phaseDeg: 312, radiusPx: 59, durationSec: 12, reverse: true, sizePx: 6 },
];

export function ProfileBubbleMotionShell({
  rarity,
  className = "",
  style,
  children,
  ...pointerHandlers
}: BubbleShellProps) {
  const reduce = useReducedMotion();
  const r = normalizeProfileStyleRarity(rarity ?? "common");

  if (r === "common") {
    if (reduce) {
      return (
        <motion.div
          className={className}
          style={style}
          initial={{ opacity: 0.92, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={enter}
          {...pointerHandlers}
        >
          {children}
        </motion.div>
      );
    }
    return (
      <div className="relative h-24 w-24 shrink-0">
        {rarityConicFrame({
          reduce: false,
          outerBlurClass: "bg-slate-400/12 blur-xl",
          outerBlurAnimate: {
            opacity: [0.35, 0.55, 0.35],
            scale: [0.96, 1.06, 0.96],
          },
          outerBlurTransition: {
            duration: 4.5,
            repeat: Infinity,
            ease: "easeInOut",
          },
          mainGradient:
            "conic-gradient(from 0deg, #94a3b8, #cbd5e1, #64748b, #e2e8f0, #94a3b8)",
          mainInset: "-5px",
          mainRotateSec: 28,
          mainOpacity: "opacity-70",
          shineGradient:
            "conic-gradient(from 90deg, rgba(255,255,255,0.35), transparent, rgba(148,163,184,0.5), transparent, rgba(255,255,255,0.25))",
          shineInset: "-7px",
          shineRotateSec: 19,
          shineOpacity: "opacity-40",
        })}
        <motion.div
          className={`relative z-[1] ${className}`}
          style={style}
          initial={{ opacity: 0.94, scale: 0.98 }}
          animate={{
            opacity: [0.97, 1, 0.97],
            scale: [1, 1.014, 1],
          }}
          transition={{
            duration: 4.2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          {...pointerHandlers}
        >
          {children}
        </motion.div>
      </div>
    );
  }

  if (r === "uncommon") {
    return (
      <div className="relative h-24 w-24 shrink-0">
        {rarityConicFrame({
          reduce: !!reduce,
          outerBlurClass: "bg-cyan-400/22 blur-xl",
          outerBlurAnimate: {
            opacity: [0.45, 0.82, 0.45],
            scale: [0.94, 1.1, 0.94],
          },
          outerBlurTransition: {
            duration: 2.6,
            repeat: Infinity,
            ease: "easeInOut",
          },
          mainGradient:
            "conic-gradient(from 0deg, #22d3ee, #14b8a6, #2dd4bf, #06b6d4, #5eead4, #22d3ee)",
          mainInset: "-6px",
          mainRotateSec: 13,
          mainOpacity: "opacity-90",
          shineGradient:
            "conic-gradient(from 120deg, rgba(255,255,255,0.55), transparent, rgba(34,211,238,0.45), transparent, rgba(255,255,255,0.4))",
          shineInset: "-8px",
          shineRotateSec: 8,
          shineOpacity: "opacity-50",
        })}
        <motion.div
          className={`relative z-[1] ${className}`}
          style={style}
          initial={reduce ? false : { opacity: 0.96, scale: 0.99 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={enter}
          {...pointerHandlers}
        >
          {children}
        </motion.div>
      </div>
    );
  }

  if (r === "rare") {
    return (
      <div className="relative h-24 w-24 shrink-0">
        {!reduce ? (
          <>
            {rarityConicFrame({
              reduce: false,
              outerBlurClass: "bg-sky-400/28 blur-xl",
              outerBlurAnimate: {
                opacity: [0.4, 0.78, 0.4],
                scale: [0.95, 1.11, 0.95],
              },
              outerBlurTransition: {
                duration: 2.4,
                repeat: Infinity,
                ease: "easeInOut",
              },
              mainGradient:
                "conic-gradient(from 0deg, #38bdf8, #818cf8, #a78bfa, #c084fc, #60a5fa, #38bdf8)",
              mainInset: "-6px",
              mainRotateSec: 9,
              mainOpacity: "opacity-90",
              shineGradient:
                "conic-gradient(from 60deg, rgba(255,255,255,0.5), transparent, rgba(186,230,253,0.55), transparent, rgba(196,181,253,0.45))",
              shineInset: "-8px",
              shineRotateSec: 6.5,
              shineOpacity: "opacity-55",
            })}
            {[0, 90, 180, 270].map((deg, i) =>
              orbitSpark(deg, 44, 3.2 + i * 0.15, i * 0.35, "bg-sky-300 text-sky-200"),
            )}
          </>
        ) : null}
        <motion.div
          className={`relative z-[1] ${className}`}
          style={style}
          initial={reduce ? false : { opacity: 0.95, scale: 0.99 }}
          animate={
            reduce
              ? { opacity: 1, scale: 1 }
              : { opacity: 1, scale: [1, 1.02, 1] }
          }
          transition={
            reduce
              ? enter
              : { scale: { duration: 2.4, repeat: Infinity, ease: "easeInOut" } }
          }
          {...pointerHandlers}
        >
          {children}
        </motion.div>
      </div>
    );
  }

  if (r === "epic") {
    const epicAngles = [0, 60, 120, 180, 240, 300];
    return (
      <div className="relative h-24 w-24 shrink-0">
        {!reduce ? (
          <>
            {rarityConicFrame({
              reduce: false,
              outerBlurClass: "bg-violet-500/30 blur-xl",
              outerBlurAnimate: {
                opacity: [0.42, 0.88, 0.42],
                scale: [0.94, 1.12, 0.94],
              },
              outerBlurTransition: {
                duration: 2.2,
                repeat: Infinity,
                ease: "easeInOut",
              },
              mainGradient:
                "conic-gradient(from 30deg, #6d28d9, #a78bfa, #c4b5fd, #8b5cf6, #9333ea, #ddd6fe, #6d28d9)",
              mainInset: "-6px",
              mainRotateSec: 14,
              mainOpacity: "opacity-90",
              shineGradient:
                "conic-gradient(from 100deg, rgba(255,255,255,0.55), transparent, rgba(196,181,253,0.6), transparent, rgba(255,255,255,0.45))",
              shineInset: "-8px",
              shineRotateSec: 7,
              shineOpacity: "opacity-50",
            })}
            {epicAngles.map((deg, i) =>
              orbitSpark(
                deg,
                48,
                4.2,
                i * 0.28,
                "bg-violet-200 text-violet-300",
              ),
            )}
          </>
        ) : null}
        <motion.div
          className={`relative z-[1] ${className}`}
          style={style}
          initial={reduce ? false : { opacity: 0.9, y: 5, rotate: -2 }}
          animate={
            reduce
              ? { opacity: 1, y: 0, rotate: 0 }
              : {
                  opacity: 1,
                  y: [0, -4, 0],
                  rotate: [-1.2, 1.2, -1.2],
                }
          }
          transition={
            reduce
              ? enter
              : {
                  y: { duration: 3.6, repeat: Infinity, ease: "easeInOut" },
                  rotate: { duration: 5.5, repeat: Infinity, ease: "easeInOut" },
                }
          }
          {...pointerHandlers}
        >
          {children}
        </motion.div>
      </div>
    );
  }

  /* legendary — рамка + мини-пузыри на орбитах */
  return (
    <div className="relative h-24 w-24 shrink-0">
      {!reduce ? (
        <>
          {rarityConicFrame({
            reduce: false,
            outerBlurClass: "bg-amber-400/25 blur-xl",
            outerBlurAnimate: {
              opacity: [0.4, 0.85, 0.4],
              scale: [0.95, 1.12, 0.95],
            },
            outerBlurTransition: {
              duration: 2.2,
              repeat: Infinity,
              ease: "easeInOut",
            },
            mainGradient:
              "conic-gradient(from 0deg, #fcd34d, #f59e0b, #fbbf24, #fde68a, #d97706, #fcd34d)",
            mainInset: "-6px",
            mainRotateSec: 11,
            mainOpacity: "opacity-90",
            shineGradient:
              "conic-gradient(from 90deg, rgba(255,255,255,0.5), transparent, rgba(255,200,120,0.4), transparent, rgba(255,255,255,0.45))",
            shineInset: "-8px",
            shineRotateSec: 7,
            shineOpacity: "opacity-45",
          })}
          {LEGEND_ORBIT_BUBBLES.map((b, i) => (
            <LegendOrbitBubble key={i} {...b} />
          ))}
        </>
      ) : null}
      <motion.div
        className={`relative z-[1] ${className}`}
        style={style}
        animate={
          reduce
            ? {}
            : {
                filter: [
                  "saturate(1.08) brightness(1.04) hue-rotate(0deg)",
                  "saturate(1.14) brightness(1.08) hue-rotate(22deg)",
                  "saturate(1.1) brightness(1.06) hue-rotate(-8deg)",
                  "saturate(1.08) brightness(1.04) hue-rotate(0deg)",
                ],
                scale: [1, 1.035, 1.02, 1],
              }
        }
        transition={
          reduce
            ? {}
            : {
                duration: 6.5,
                repeat: Infinity,
                ease: "easeInOut",
              }
        }
        whileTap={reduce ? undefined : { scale: 0.96 }}
        {...pointerHandlers}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function ProfileRarityChipMotion({
  rarity,
  className,
  children,
}: {
  rarity: ProfileStyleRarity | string | null | undefined;
  className: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const r = normalizeProfileStyleRarity(rarity ?? "common");

  if (r === "common" || r === "uncommon") {
    if (reduce || r === "common") {
      return <span className={className}>{children}</span>;
    }
    return (
      <motion.span
        className={className}
        animate={{ opacity: [0.88, 1, 0.88] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        {children}
      </motion.span>
    );
  }

  if (r === "rare" || r === "epic" || r === "legendary") {
    const dur = r === "legendary" ? 1.8 : r === "epic" ? 2.4 : 3.2;
    return (
      <motion.span
        className={className}
        animate={
          reduce
            ? {}
            : r === "legendary"
              ? {
                  scale: [1, 1.06, 1.02, 1],
                  boxShadow: [
                    "0 0 0 0 rgba(255,200,120,0)",
                    "0 0 14px 2px rgba(255,200,120,0.45)",
                    "0 0 8px 1px rgba(255,180,80,0.3)",
                    "0 0 0 0 rgba(255,200,120,0)",
                  ],
                }
              : { scale: [1, 1.055, 1] }
        }
        transition={{
          duration: r === "legendary" ? 2.4 : dur,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        {children}
      </motion.span>
    );
  }

  return <span className={className}>{children}</span>;
}
