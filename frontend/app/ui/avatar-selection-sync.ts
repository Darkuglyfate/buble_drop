"use client";

const AVATAR_SELECTION_STORAGE_PREFIX = "bubbledrop.selected-avatar";

export type SelectedAvatarOverride = {
  avatarId: string;
  paletteKey: string | null;
};

function getAvatarSelectionStorageKey(profileId: string): string {
  return `${AVATAR_SELECTION_STORAGE_PREFIX}.${profileId}`;
}

export function loadSelectedAvatarOverrideState(
  profileId: string,
): SelectedAvatarOverride | null {
  if (typeof window === "undefined" || !profileId) {
    return null;
  }
  try {
    const value = window.sessionStorage.getItem(getAvatarSelectionStorageKey(profileId));
    const normalizedValue = value?.trim();
    if (!normalizedValue) {
      return null;
    }
    if (!normalizedValue.startsWith("{")) {
      return {
        avatarId: normalizedValue,
        paletteKey: null,
      };
    }
    const parsed = JSON.parse(normalizedValue) as Partial<SelectedAvatarOverride>;
    if (typeof parsed.avatarId !== "string" || !parsed.avatarId.trim()) {
      return null;
    }
    return {
      avatarId: parsed.avatarId.trim(),
      paletteKey:
        typeof parsed.paletteKey === "string" && parsed.paletteKey.trim()
          ? parsed.paletteKey.trim()
          : null,
    };
  } catch {
    return null;
  }
}

export function loadSelectedAvatarOverride(profileId: string): string | null {
  return loadSelectedAvatarOverrideState(profileId)?.avatarId ?? null;
}

export function saveSelectedAvatarOverride(
  profileId: string,
  avatarId: string,
  paletteKey?: string | null,
): void {
  if (typeof window === "undefined" || !profileId || !avatarId) {
    return;
  }
  try {
    window.sessionStorage.setItem(
      getAvatarSelectionStorageKey(profileId),
      JSON.stringify({
        avatarId,
        paletteKey: paletteKey?.trim() || null,
      } satisfies SelectedAvatarOverride),
    );
  } catch {
    // ignore session storage write failures
  }
}

