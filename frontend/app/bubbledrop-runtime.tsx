"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export const BUBBLEDROP_API_BASE = "/api/bubbledrop";

const APP_CONTEXT_STORAGE_KEY = "bubbledrop.app-context";

type BubbleDropAppContextState = {
  profileId: string | null;
  walletAddress: string | null;
};

type BubbleDropRuntimeContextValue = BubbleDropAppContextState & {
  setAppContext: (value: BubbleDropAppContextState) => void;
  clearAppContext: () => void;
};

const BubbleDropRuntimeContext =
  createContext<BubbleDropRuntimeContextValue | null>(null);

function loadInitialAppContext(): BubbleDropAppContextState {
  if (typeof window === "undefined") {
    return { profileId: null, walletAddress: null };
  }

  try {
    const rawValue = window.sessionStorage.getItem(APP_CONTEXT_STORAGE_KEY);
    const parsed = rawValue
      ? (JSON.parse(rawValue) as BubbleDropAppContextState)
      : null;
    const smokeTestMode =
      process.env.NODE_ENV !== "production" &&
      process.env.NEXT_PUBLIC_SMOKE_TEST_MODE === "1";
    const searchParams = new URLSearchParams(window.location.search);
    const smokeProfileId = smokeTestMode
      ? searchParams.get("smokeProfileId")?.trim() || null
      : null;
    const smokeWalletAddress = smokeTestMode
      ? searchParams.get("smokeWalletAddress")?.trim().toLowerCase() || null
      : null;

    return {
      profileId:
        smokeProfileId ||
        (typeof parsed?.profileId === "string" && parsed.profileId.trim()
          ? parsed.profileId.trim()
          : null),
      walletAddress:
        smokeWalletAddress ||
        (typeof parsed?.walletAddress === "string" && parsed.walletAddress.trim()
          ? parsed.walletAddress.trim().toLowerCase()
          : null),
    };
  } catch {
    return { profileId: null, walletAddress: null };
  }
}

function saveStoredAppContext(value: BubbleDropAppContextState): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(APP_CONTEXT_STORAGE_KEY, JSON.stringify(value));
}

export function withBubbleDropContext(
  path: string,
  _context: BubbleDropAppContextState,
  options?: { skipIntro?: boolean },
): string {
  void _context;
  if (!options?.skipIntro) {
    return path;
  }

  return `${path}${path.includes("?") ? "&" : "?"}skipIntro=1`;
}

export function BubbleDropRuntimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [appContext, setAppContextState] = useState<BubbleDropAppContextState>({
    profileId: null,
    walletAddress: null,
  });
  const hasExplicitContextUpdateRef = useRef(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!hasExplicitContextUpdateRef.current) {
        setAppContextState(loadInitialAppContext());
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const value = useMemo<BubbleDropRuntimeContextValue>(
    () => ({
      ...appContext,
      setAppContext: (nextValue) => {
        hasExplicitContextUpdateRef.current = true;
        const normalizedValue = {
          profileId: nextValue.profileId?.trim() || null,
          walletAddress: nextValue.walletAddress?.trim().toLowerCase() || null,
        };
        setAppContextState(normalizedValue);
        saveStoredAppContext(normalizedValue);
      },
      clearAppContext: () => {
        hasExplicitContextUpdateRef.current = true;
        const emptyValue = { profileId: null, walletAddress: null };
        setAppContextState(emptyValue);
        saveStoredAppContext(emptyValue);
      },
    }),
    [appContext],
  );

  return (
    <BubbleDropRuntimeContext.Provider value={value}>
      {children}
    </BubbleDropRuntimeContext.Provider>
  );
}

export function useBubbleDropRuntime(): BubbleDropRuntimeContextValue {
  const value = useContext(BubbleDropRuntimeContext);
  if (!value) {
    throw new Error("BubbleDrop runtime context is unavailable.");
  }

  return value;
}

