"use client";

import { useEffect, useState } from "react";

export type GlassMode = "soft" | "medium" | "strong";

const GLASS_MODE_STORAGE_KEY = "bubbledrop.glass-mode";

export function useGlassMode() {
  const [glassMode, setGlassMode] = useState<GlassMode>("medium");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedMode = window.localStorage.getItem(GLASS_MODE_STORAGE_KEY);
    if (storedMode === "soft" || storedMode === "medium" || storedMode === "strong") {
      const timeoutId = window.setTimeout(() => {
        setGlassMode(storedMode);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const body = window.document.body;
    body.classList.remove("glass-soft", "glass-medium", "glass-strong");
    body.classList.add(`glass-${glassMode}`);
    window.localStorage.setItem(GLASS_MODE_STORAGE_KEY, glassMode);
  }, [glassMode]);

  return { glassMode, setGlassMode } as const;
}
