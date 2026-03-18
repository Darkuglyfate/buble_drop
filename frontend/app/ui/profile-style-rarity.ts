/**
 * Five cosmetic tiers for profile / equipped style.
 * API may still send only common|rare|epic|legendary; unknown strings normalize to common.
 */
export const PROFILE_STYLE_RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
] as const;

export type ProfileStyleRarity = (typeof PROFILE_STYLE_RARITIES)[number];

const VALID = new Set<string>(PROFILE_STYLE_RARITIES);

export function normalizeProfileStyleRarity(
  raw: string | null | undefined,
): ProfileStyleRarity {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (VALID.has(s)) {
    return s as ProfileStyleRarity;
  }
  return "common";
}
