"use client";

import { useEffect, useMemo, useState } from "react";
import { isAddress, parseAbi, type Address, type Hash } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { base } from "wagmi/chains";
import {
  captureAnalyticsEvent,
} from "../../analytics";
import {
  classifyWalletFlowError,
} from "../../base-wallet-runtime";
import {
  createAuthenticatedJsonHeaders,
} from "../../base-sign-in";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DailyCheckInUiState =
  | "idle"
  | "preparing_transaction"
  | "wallet_confirmation_requested"
  | "pending_onchain"
  | "success_confirmed"
  | "user_rejected"
  | "insufficient_funds"
  | "wrong_network"
  | "generic_failure";

type DailyCheckInResponse = {
  success: boolean;
  checkInDate: string;
  xpAwarded?: number;
  newStreak?: number;
  rareAccessActive?: boolean;
  currentStreak?: number;
  rareRewardAccessActive?: boolean;
  onchain?: {
    mode: "user-paid";
    txHash: string | null;
  };
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAILY_CHECK_IN_STREAK_ABI = parseAbi([
  "function checkIn(address wallet, uint32 dayKey) returns (uint32)",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getUtcDayKey(date: Date): number {
  return Math.floor(Date.parse(`${getUtcDateKey(date)}T00:00:00.000Z`) / 1000 / (24 * 60 * 60));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

type UseDailyCheckInOptions = {
  backendUrl: string;
  profileId: string | null;
  connectedWalletAddress: string | null;
  activeWalletAddress: string | null;
  effectiveIsConnected: boolean;
  isConnectedToBase: boolean;
  authenticatedSessionToken: string | null;
  quickSessionHref: string;
  refreshProfileSummary: (targetProfileId: string) => Promise<unknown>;
};

export function useDailyCheckIn({
  backendUrl,
  profileId,
  connectedWalletAddress,
  activeWalletAddress,
  effectiveIsConnected,
  isConnectedToBase,
  authenticatedSessionToken,
  quickSessionHref,
  refreshProfileSummary,
}: UseDailyCheckInOptions) {
  const [dailyCheckInCompletedToday, setDailyCheckInCompletedToday] = useState(false);
  const [dailyCheckInUiState, setDailyCheckInUiState] =
    useState<DailyCheckInUiState>("idle");
  const [isSubmittingCheckIn, setIsSubmittingCheckIn] = useState(false);

  const publicClient = usePublicClient({ chainId: base.id });
  const { writeContractAsync } = useWriteContract();

  const dailyCheckInContractAddress = useMemo(() => {
    const configuredAddress =
      process.env.NEXT_PUBLIC_ONCHAIN_STREAK_CONTRACT_ADDRESS?.trim() ?? "";
    return isAddress(configuredAddress)
      ? (configuredAddress as Address)
      : null;
  }, []);

  // ---- effects ----

  useEffect(() => {
    if (!profileId || typeof window === "undefined") {
      setDailyCheckInCompletedToday(false);
      return;
    }
    const today = getUtcDateKey(new Date());
    const storageKey = `bubbledrop:daily-checkin:${profileId}`;
    const storedDate = window.localStorage.getItem(storageKey);
    setDailyCheckInCompletedToday(storedDate === today);
  }, [profileId]);

  // ---- handler ----

  const onDailyCheckIn = async (
    setActionMessage: (msg: string | null) => void,
    opts?: { openBubbleSessionAfter?: boolean },
  ) => {
    if (!profileId) {
      setDailyCheckInUiState("generic_failure");
      setActionMessage("Connect, sign in, and sync your profile before checking in.");
      return;
    }
    if (effectiveIsConnected && !isConnectedToBase) {
      setDailyCheckInUiState("wrong_network");
      setActionMessage("Switch to Base before daily check-in.");
      return;
    }
    if (!authenticatedSessionToken) {
      setDailyCheckInUiState("generic_failure");
      setActionMessage("Sign in with Base before daily check-in.");
      return;
    }
    if (!connectedWalletAddress) {
      setDailyCheckInUiState("generic_failure");
      setActionMessage("Connect your Base wallet before daily check-in.");
      return;
    }
    if (process.env.NEXT_PUBLIC_SMOKE_TEST_MODE !== "1" && !dailyCheckInContractAddress) {
      setDailyCheckInUiState("generic_failure");
      setActionMessage("Daily check-in contract is not configured for this app build.");
      return;
    }
    if (process.env.NEXT_PUBLIC_SMOKE_TEST_MODE !== "1" && !publicClient) {
      setDailyCheckInUiState("generic_failure");
      setActionMessage("Base client is not ready yet. Try daily check-in again in a moment.");
      return;
    }

    setIsSubmittingCheckIn(true);
    setDailyCheckInUiState("preparing_transaction");
    setActionMessage(null);
    try {
      let checkInTxHash: string | null = null;
      if (process.env.NEXT_PUBLIC_SMOKE_TEST_MODE !== "1") {
        const dayKey = getUtcDayKey(new Date());
        setDailyCheckInUiState("wallet_confirmation_requested");
        setActionMessage(
          "Confirm daily check-in in your wallet.\nThis is the only step where you pay gas.",
        );
        checkInTxHash = await writeContractAsync({
          abi: DAILY_CHECK_IN_STREAK_ABI,
          address: dailyCheckInContractAddress as Address,
          functionName: "checkIn",
          args: [connectedWalletAddress as Address, dayKey],
          chainId: base.id,
        });

        setDailyCheckInUiState("pending_onchain");
        setActionMessage("Waiting for Base confirmation...");
        const receipt = await publicClient!.waitForTransactionReceipt({
          hash: checkInTxHash as Hash,
        });
        if (receipt.status !== "success") {
          setDailyCheckInUiState("generic_failure");
          setActionMessage("Today's check-in transaction did not confirm on Base.");
          return;
        }
      }

      const response = await fetch(`${backendUrl}/check-in/daily`, {
        method: "POST",
        headers: createAuthenticatedJsonHeaders(authenticatedSessionToken),
        body: JSON.stringify({
          profileId,
          txHash: checkInTxHash ?? undefined,
        }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          if (profileId && typeof window !== "undefined") {
            window.localStorage.setItem(
              `bubbledrop:daily-checkin:${profileId}`,
              getUtcDateKey(new Date()),
            );
          }
          setDailyCheckInCompletedToday(true);
          setDailyCheckInUiState("success_confirmed");
          setActionMessage("Daily check-in is already done for today. Session is open.");
          if (quickSessionHref) {
            window.location.assign(quickSessionHref);
          }
          return;
        }
        setDailyCheckInUiState("generic_failure");
        setActionMessage("Daily check-in is unavailable right now. You can still play a session.");
        return;
      }

      const payload = (await response.json()) as DailyCheckInResponse;
      await refreshProfileSummary(profileId);
      if (profileId && typeof window !== "undefined") {
        window.localStorage.setItem(
          `bubbledrop:daily-checkin:${profileId}`,
          payload.checkInDate ?? getUtcDateKey(new Date()),
        );
      }
      setDailyCheckInCompletedToday(
        (payload.checkInDate ?? getUtcDateKey(new Date())) === getUtcDateKey(new Date()),
      );
      setDailyCheckInUiState("success_confirmed");
      captureAnalyticsEvent("bubbledrop_daily_check_in_completed", {
        profile_id: profileId,
        wallet_address: activeWalletAddress ?? connectedWalletAddress ?? "",
        check_in_date: payload.checkInDate,
        xp_awarded: payload.xpAwarded ?? 0,
        new_streak: payload.newStreak ?? payload.currentStreak ?? 0,
        rare_access_active:
          payload.rareAccessActive ?? payload.rareRewardAccessActive ?? false,
      });
      setActionMessage(
        payload.onchain?.txHash
          ? `Daily check-in complete. +${payload.xpAwarded ?? 0} XP. Streak: ${
              payload.newStreak ?? payload.currentStreak ?? 0
            }. Wallet transaction confirmed on Base.`
          : `Daily check-in complete. +${payload.xpAwarded ?? 0} XP. Streak: ${
              payload.newStreak ?? payload.currentStreak ?? 0
            }.`,
      );
      if (opts?.openBubbleSessionAfter && quickSessionHref) {
        window.location.assign(quickSessionHref);
      }
    } catch (error) {
      const walletError = classifyWalletFlowError(error);
      if (walletError.kind === "rejected") {
        setDailyCheckInUiState("user_rejected");
        setActionMessage("Daily check-in was cancelled in your wallet.");
      } else if (walletError.kind === "wrong_chain") {
        setDailyCheckInUiState("wrong_network");
        setActionMessage("Switch your wallet to Base before daily check-in.");
      } else if (walletError.kind === "insufficient_funds") {
        setDailyCheckInUiState("insufficient_funds");
        setActionMessage("Your Base wallet does not have enough ETH for this daily check-in.");
      } else if (walletError.kind === "unsupported_runtime") {
        setDailyCheckInUiState("generic_failure");
        setActionMessage("This wallet runtime could not prepare the Base check-in transaction.");
      } else if (walletError.kind === "tx_generation_failed") {
        setDailyCheckInUiState("generic_failure");
        setActionMessage("The wallet could not generate the daily check-in transaction. Try again.");
      } else {
        setDailyCheckInUiState("generic_failure");
        setActionMessage("Today's check-in did not land. Try again in a moment.");
      }
    } finally {
      setIsSubmittingCheckIn(false);
    }
  };

  return {
    dailyCheckInCompletedToday,
    dailyCheckInUiState,
    isSubmittingCheckIn,
    onDailyCheckIn,
    setDailyCheckInCompletedToday,
  };
}
