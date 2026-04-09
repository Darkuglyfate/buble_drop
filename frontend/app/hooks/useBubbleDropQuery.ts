"use client";

import { useCallback, useEffect, useState } from "react";
import { BUBBLEDROP_API_BASE } from "../bubbledrop-runtime";

type UseBubbleDropQueryResult<T> = {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
};

export function useBubbleDropQuery<T>(
  path: string | null,
  options?: {
    authSessionToken?: string | null;
  },
): UseBubbleDropQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const refetch = useCallback(() => {
    setFetchTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!path) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (options?.authSessionToken) {
          headers["x-bubbledrop-auth-session"] = options.authSessionToken;
        }

        const response = await fetch(`${BUBBLEDROP_API_BASE}${path}`, {
          method: "GET",
          headers,
          cache: "no-store",
        });

        if (!cancelled) {
          if (!response.ok) {
            setData(null);
            setError("Unable to load data from backend.");
            return;
          }
          const payload = (await response.json()) as T;
          setData(payload);
        }
      } catch {
        if (!cancelled) {
          setData(null);
          setError("Backend connection failed.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchData();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, fetchTrigger]);

  return { data, isLoading, error, refetch };
}
