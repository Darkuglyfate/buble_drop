"use client";

import { useEffect, useState } from "react";
import {
  BUBBLEDROP_API_BASE,
  useBubbleDropRuntime,
  withBubbleDropContext,
} from "../bubbledrop-runtime";
import {
  loadBubbleDropFrontendSignInSession,
} from "../base-sign-in";
import { fetchBackendProfileSummary } from "./backend-profile-summary";
import {
  BackButton,
  Badge,
  EmptyState,
  ErrorMessage,
  Grid,
  IconButton,
  ListItem,
  LoadingState,
  NavLinkButton,
  ScreenLayout,
  Section,
  Stack,
  StatTile,
  Text,
} from "../components";
import { UnifiedIcon } from "./unified-icons";

function mapErrorMessage(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  if (raw === "Connect and sign in to view your referrals.") {
    return raw;
  }
  if (raw === "We couldn't load your referral access right now.") {
    return raw;
  }
  return "We couldn't open your referral progress right now.";
}

type ReferralItem = {
  referralId: string;
  invitedWalletAddress: string;
  invitedProfileId: string | null;
  status: "pending" | "successful";
  successfulAt: string | null;
  createdAt: string;
};

type ReferralProgressView = {
  inviterProfileId: string;
  totalReferrals: number;
  pendingReferrals: number;
  successfulReferrals: number;
  referrals: ReferralItem[];
};

function shortenWalletAddress(walletAddress: string): string {
  return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
}

function formatReferralStatus(status: ReferralItem["status"]): string {
  return status === "successful" ? "Completed" : "Pending";
}

async function fetchOnboardingStateForProfile(
  backendUrl: string,
  profileId: string,
  authSessionToken?: string | null,
): Promise<{ needsOnboarding: boolean } | null> {
  const payload = await fetchBackendProfileSummary(backendUrl, profileId, authSessionToken);
  if (!payload) {
    return null;
  }

  return {
    needsOnboarding: payload.onboardingState.needsOnboarding,
  };
}

export function ReferralProgressScreen() {
  const { profileId, walletAddress } = useBubbleDropRuntime();
  const [progress, setProgress] = useState<ReferralProgressView | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isResolvingOnboardingState, setIsResolvingOnboardingState] =
    useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const backendUrl = BUBBLEDROP_API_BASE;
  const authSessionToken = loadBubbleDropFrontendSignInSession()?.authSessionToken ?? null;

  const loadProgress = async (resolvedProfileId: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authSessionToken) {
        headers["x-bubbledrop-auth-session"] = authSessionToken;
      }
      const response = await fetch(
        `${backendUrl}/partner-token/referral/progress?profileId=${encodeURIComponent(resolvedProfileId)}`,
        {
          method: "GET",
          headers,
          cache: "no-store",
        },
      );

      if (!response.ok) {
        setProgress(null);
        setErrorMessage("Unable to load referral progress from backend.");
        return;
      }

      const payload = (await response.json()) as ReferralProgressView;
      setProgress(payload);
    } catch {
      setProgress(null);
      setErrorMessage("Backend connection failed while loading referral progress.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const resolvedProfileId = profileId;
    if (!resolvedProfileId) {
      setIsResolvingOnboardingState(false);
      setErrorMessage("Connect and sign in to view your referrals.");
      return;
    }

    void (async () => {
      const onboardingState = await fetchOnboardingStateForProfile(
        backendUrl,
        resolvedProfileId,
        authSessionToken,
      );
      if (!onboardingState) {
        setNeedsOnboarding(false);
        setIsResolvingOnboardingState(false);
        setErrorMessage("We couldn't load your referral access right now.");
        return;
      }

      setNeedsOnboarding(onboardingState.needsOnboarding);
      setIsResolvingOnboardingState(false);

      if (onboardingState.needsOnboarding) {
        setProgress(null);
        setErrorMessage(null);
        return;
      }

      await loadProgress(resolvedProfileId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, profileId]);

  return (
    <ScreenLayout>
      <Section
        kicker="Invite status"
        title="Referral progress"
        headingLevel="h1"
        description="Track your invites and see how many have moved from pending to completed."
        trailing={<BackButton />}
      />

      {needsOnboarding ? (
        <Section
          kicker="First entry required"
          title="Finish onboarding before referral access"
          description="Finish your first BubbleDrop setup on the home screen to unlock referrals."
        >
          <NavLinkButton
            href={withBubbleDropContext("/", { profileId, walletAddress }, { skipIntro: true })}
            variant="primary"
            size="md"
          >
            Go to onboarding
          </NavLinkButton>
        </Section>
      ) : null}

      <Section
        title="Progress summary"
        trailing={
          <IconButton
            label="Refresh referrals"
            variant="secondary"
            size="sm"
            disabled={!profileId || isLoading || needsOnboarding || isResolvingOnboardingState}
            onClick={() => {
              if (!profileId) {
                return;
              }
              void loadProgress(profileId);
            }}
          >
            <UnifiedIcon kind="refresh" />
          </IconButton>
        }
      >
        <LoadingState
          message={isResolvingOnboardingState ? "Checking your referral access..." : null}
        />

        <Grid columns={3} gap={2}>
          <StatTile label="Total" value={progress?.totalReferrals ?? "—"} />
          <StatTile label="Pending" value={progress?.pendingReferrals ?? "—"} />
          <StatTile label="Successful" value={progress?.successfulReferrals ?? "—"} />
        </Grid>
      </Section>

      <Section title="Referral list">
        {needsOnboarding ? (
          <Text variant="body" tone="muted">
            Referral activity appears here after onboarding is complete.
          </Text>
        ) : null}

        {!needsOnboarding && progress?.referrals.length ? (
          <Stack gap={2}>
            {progress.referrals.map((item) => (
              <ListItem
                key={item.referralId}
                title={shortenWalletAddress(item.invitedWalletAddress)}
                subtitle={item.invitedProfileId ? "Profile connected" : "Waiting for profile setup"}
                trailing={
                  <Badge tone={item.status === "successful" ? "success" : "neutral"} size="sm">
                    {formatReferralStatus(item.status)}
                  </Badge>
                }
              />
            ))}
          </Stack>
        ) : null}

        {!needsOnboarding && !progress?.referrals.length ? (
          <EmptyState message="You have no referrals yet. Invites will appear here once people join through your link." />
        ) : null}
      </Section>

      <ErrorMessage message={mapErrorMessage(errorMessage)} />
    </ScreenLayout>
  );
}
