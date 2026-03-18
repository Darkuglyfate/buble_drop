"use client";

const AVATAR_SELECTION_STORAGE_PREFIX = "bubbledrop.selected-avatar";

function getAvatarSelectionStorageKey(profileId: string): string {
  return `${AVATAR_SELECTION_STORAGE_PREFIX}.${profileId}`;
}

export function loadSelectedAvatarOverride(profileId: string): string | null {
  if (typeof window === "undefined" || !profileId) {
    return null;
  }
  try {
    const value = window.sessionStorage.getItem(getAvatarSelectionStorageKey(profileId));
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function saveSelectedAvatarOverride(profileId: string, avatarId: string): void {
  if (typeof window === "undefined" || !profileId || !avatarId) {
    return;
  }
  try {
    window.sessionStorage.setItem(getAvatarSelectionStorageKey(profileId), avatarId);
  } catch {
    // ignore session storage write failures
  }
}

