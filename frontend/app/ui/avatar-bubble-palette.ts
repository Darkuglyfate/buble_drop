"use client";

export type AvatarBubbleTone = {
  base: string;
  highlight: string;
  glow: string;
  ring: string;
};

const AVATAR_BUBBLE_PALETTES: Record<string, AvatarBubbleTone> = {
  blue: {
    base: "hsl(212 88% 82%)",
    highlight: "hsl(202 96% 90%)",
    glow: "hsla(214 84% 66% / 0.42)",
    ring: "hsla(206 96% 95% / 0.9)",
  },
  lilac: {
    base: "hsl(268 84% 84%)",
    highlight: "hsl(282 92% 91%)",
    glow: "hsla(272 72% 72% / 0.42)",
    ring: "hsla(286 96% 95% / 0.92)",
  },
  rose: {
    base: "hsl(336 88% 84%)",
    highlight: "hsl(350 96% 92%)",
    glow: "hsla(338 78% 70% / 0.42)",
    ring: "hsla(350 96% 95% / 0.92)",
  },
  mint: {
    base: "hsl(158 76% 82%)",
    highlight: "hsl(174 92% 90%)",
    glow: "hsla(164 62% 62% / 0.38)",
    ring: "hsla(176 92% 95% / 0.92)",
  },
  peach: {
    base: "hsl(24 92% 84%)",
    highlight: "hsl(38 98% 92%)",
    glow: "hsla(22 86% 70% / 0.38)",
    ring: "hsla(38 100% 95% / 0.92)",
  },
  amber: {
    base: "hsl(42 94% 78%)",
    highlight: "hsl(50 100% 90%)",
    glow: "hsla(40 90% 62% / 0.42)",
    ring: "hsla(52 100% 94% / 0.92)",
  },
  sky: {
    base: "hsl(192 94% 82%)",
    highlight: "hsl(198 100% 92%)",
    glow: "hsla(194 82% 68% / 0.4)",
    ring: "hsla(198 100% 95% / 0.92)",
  },
  violet: {
    base: "hsl(250 84% 82%)",
    highlight: "hsl(262 96% 91%)",
    glow: "hsla(252 76% 70% / 0.42)",
    ring: "hsla(264 96% 95% / 0.92)",
  },
};

function createHashFallbackTone(seed: string): AvatarBubbleTone {
  const hash = Array.from(seed).reduce((acc, char, index) => {
    return (acc + char.charCodeAt(0) * (index + 13)) % 360;
  }, 0);
  const hue = 180 + (hash % 120);
  return {
    base: `hsl(${hue} 85% 84%)`,
    highlight: `hsl(${(hue + 24) % 360} 90% 89%)`,
    glow: `hsla(${hue} 85% 68% / 0.42)`,
    ring: `hsla(${(hue + 18) % 360} 96% 95% / 0.9)`,
  };
}

export function getAvatarBubbleTone(
  paletteKey: string | null | undefined,
  fallbackSeed = "bubble-default",
): AvatarBubbleTone {
  if (paletteKey && AVATAR_BUBBLE_PALETTES[paletteKey]) {
    return AVATAR_BUBBLE_PALETTES[paletteKey];
  }
  return createHashFallbackTone(fallbackSeed);
}

export function getAvatarBubblePaletteKeys(): string[] {
  return Object.keys(AVATAR_BUBBLE_PALETTES);
}
