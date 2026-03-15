"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useMemo,
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
    const searchParams = new URLSearchParams(window.location.search);
    const urlProfileId = searchParams.get("profileId")?.trim() || null;
    const urlWalletAddress =
      searchParams.get("walletAddress")?.trim().toLowerCase() || null;

    return {
      profileId:
        urlProfileId ||
        (typeof parsed?.profileId === "string" && parsed.profileId.trim()
          ? parsed.profileId.trim()
          : null),
      walletAddress:
        urlWalletAddress ||
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
  context: BubbleDropAppContextState,
): string {
  const searchParams = new URLSearchParams();
  if (context.profileId) {
    searchParams.set("profileId", context.profileId);
  }
  if (context.walletAddress) {
    searchParams.set("walletAddress", context.walletAddress);
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export function BubbleDropRuntimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [appContext, setAppContextState] = useState<BubbleDropAppContextState>(
    () => loadInitialAppContext(),
  );

  const value = useMemo<BubbleDropRuntimeContextValue>(
    () => ({
      ...appContext,
      setAppContext: (nextValue) => {
        const normalizedValue = {
          profileId: nextValue.profileId?.trim() || null,
          walletAddress: nextValue.walletAddress?.trim().toLowerCase() || null,
        };
        setAppContextState(normalizedValue);
        saveStoredAppContext(normalizedValue);
      },
      clearAppContext: () => {
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

