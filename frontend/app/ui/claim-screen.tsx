"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { captureAnalyticsEvent } from "../analytics";
import {
  BUBBLEDROP_API_BASE,
  useBubbleDropRuntime,
} from "../bubbledrop-runtime";
import {
  createAuthenticatedJsonHeaders,
  getSmokeSignInSessionFromCurrentUrl,
  loadBubbleDropFrontendSignInSession,
  type BubbleDropFrontendSignInSession,
} from "../base-sign-in";
import {
  BackButton,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Grid,
  IconButton,
  LoadingState,
  NavLinkButton,
  Row,
  ScreenLayout,
  Section,
  Stack,
  StatTile,
  Text,
} from "../components";
import {
  type BackendProfileSummary,
  fetchBackendProfileSummary,
} from "./backend-profile-summary";
import { UnifiedIcon } from "./unified-icons";

type ClaimableBalance = {
  tokenSymbol: string;
  claimableAmount: string;
  updatedAt?: string;
};

type ClaimResponse = {
  claimId: string;
  profileId: string;
  tokenSymbol: string;
  amount: string;
  status: "pending" | "confirmed" | "failed";
  txHash: string | null;
  remainingClaimableBalance: string;
  relay?: {
    action: "claim";
    relayKind: "backend-sponsored";
    available: boolean;
    userPaysGas: false;
    reason: string | null;
  };
  settlementRecordedOnchain?: boolean;
  settlementRecordTxHash?: string | null;
};

type QualificationStatus = BackendProfileSummary["qualificationState"]["status"];
type BadgeTone = "neutral" | "info" | "muted" | "rare" | "qualified";

function normalizeIntegerString(value: string): string {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return "0";
  }
  return normalized.replace(/^0+(?=\d)/, "");
}

function addIntegerStrings(a: string, b: string): string {
  const aa = normalizeIntegerString(a);
  const bb = normalizeIntegerString(b);
  let i = aa.length - 1;
  let j = bb.length - 1;
  let carry = 0;
  let out = "";

  while (i >= 0 || j >= 0 || carry > 0) {
    const da = i >= 0 ? Number(aa[i]) : 0;
    const db = j >= 0 ? Number(bb[j]) : 0;
    const sum = da + db + carry;
    out = String(sum % 10) + out;
    carry = Math.floor(sum / 10);
    i -= 1;
    j -= 1;
  }

  return out || "0";
}

async function fetchOnboardingStateForProfile(
  backendUrl: string,
  profileId: string,
  authSessionToken?: string | null,
): Promise<BackendProfileSummary | null> {
  return fetchBackendProfileSummary(backendUrl, profileId, authSessionToken);
}

const QUALIFICATION_BADGE: Record<
  QualificationStatus,
  { label: string; tone: BadgeTone }
> = {
  locked: { label: "Locked", tone: "neutral" },
  in_progress: { label: "In progress", tone: "info" },
  paused: { label: "Paused", tone: "muted" },
  restored: { label: "Restored", tone: "rare" },
  qualified: { label: "Qualified", tone: "qualified" },
};

function mapErrorMessage(raw: string | null): string | null {
  if (raw === null) {
    return null;
  }
  if (raw === "Unable to load claimable balances from backend.") {
    return "Claimable balances are unavailable right now.";
  }
  if (raw === "Backend connection failed while loading claimable balances.") {
    return "We couldn't refresh your balances.";
  }
  return raw;
}

export function ClaimScreen() {
  const runtimeContext = useBubbleDropRuntime();
  const { address } = useAccount();
  const [balances, setBalances] = useState<ClaimableBalance[]>([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [claimingToken, setClaimingToken] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<ClaimResponse | null>(null);
  const [authSession, setAuthSession] =
    useState<BubbleDropFrontendSignInSession | null>(null);
  const [isResolvingOnboardingState, setIsResolvingOnboardingState] =
    useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [profileSummary, setProfileSummary] =
    useState<BackendProfileSummary | null>(null);

  const backendUrl = BUBBLEDROP_API_BASE;
  const connectedWalletAddress = address?.trim().toLowerCase() ?? null;
  const profileId = runtimeContext.profileId;
  const walletAddress = connectedWalletAddress ?? runtimeContext.walletAddress;
  const authSessionToken =
    authSession &&
    (!walletAddress || authSession.address === walletAddress) &&
    (!connectedWalletAddress || authSession.address === connectedWalletAddress)
      ? authSession.authSessionToken
      : null;

  const totalClaimable = useMemo(() => {
    return balances.reduce((sum, item) => addIntegerStrings(sum, item.claimableAmount), "0");
  }, [balances]);

  const canUseBackend = !!backendUrl && !!profileId;
  const qualificationStatus = profileSummary?.qualificationState.status;
  const canRequestClaims =
    canUseBackend &&
    !needsOnboarding &&
    !isResolvingOnboardingState &&
    !!authSessionToken;
  const qualificationBadge: { label: string; tone: BadgeTone } = qualificationStatus
    ? QUALIFICATION_BADGE[qualificationStatus]
    : { label: "Pending", tone: "neutral" };

  const loadBalances = async (resolvedProfileId: string) => {
    setIsLoadingBalances(true);
    setErrorMessage(null);
    try {
      const response = await fetch(
        `${backendUrl}/claim/balances?profileId=${encodeURIComponent(resolvedProfileId)}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        },
      );

      if (!response.ok) {
        setBalances([]);
        setErrorMessage("Unable to load claimable balances from backend.");
        return;
      }

      const payload = (await response.json()) as ClaimableBalance[];
      setBalances(payload);
    } catch {
      setBalances([]);
      setErrorMessage("Backend connection failed while loading claimable balances.");
    } finally {
      setIsLoadingBalances(false);
    }
  };

  useEffect(() => {
    setAuthSession(
      getSmokeSignInSessionFromCurrentUrl() ??
        loadBubbleDropFrontendSignInSession(),
    );
  }, [connectedWalletAddress, walletAddress]);

  useEffect(() => {
    const resolvedProfileId = profileId;
    setIsResolvingOnboardingState(true);
    if (resolvedProfileId) {
      void (async () => {
        const summary = await fetchOnboardingStateForProfile(
          backendUrl,
          resolvedProfileId,
          authSessionToken,
        );
        if (!summary) {
          setProfileSummary(null);
          setNeedsOnboarding(false);
          setErrorMessage("We couldn't load your claim access right now.");
          setIsResolvingOnboardingState(false);
          return;
        }

        setProfileSummary(summary);
        runtimeContext.setAppContext({
          profileId: summary.profileIdentity.profileId,
          walletAddress: summary.profileIdentity.walletAddress,
        });
        setNeedsOnboarding(summary.onboardingState.needsOnboarding);
        setIsResolvingOnboardingState(false);

        if (!summary.onboardingState.needsOnboarding) {
          await loadBalances(resolvedProfileId);
          return;
        }

        setBalances([]);
        setErrorMessage(null);
      })();
    } else {
      setProfileSummary(null);
      setBalances([]);
      setNeedsOnboarding(false);
      setIsResolvingOnboardingState(false);
      setErrorMessage("Connect and sign in on the home screen to claim rewards.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, profileId]);

  const onClaimToken = async (tokenSymbol: string, amount: string) => {
    if (!backendUrl || !profileId || needsOnboarding) {
      return;
    }
    if (!authSessionToken) {
      setErrorMessage("Sign in with Base on the home screen before requesting a claim.");
      return;
    }

    setClaimingToken(tokenSymbol);
    setErrorMessage(null);
    setClaimResult(null);

    try {
      const response = await fetch(`${backendUrl}/claim/request`, {
        method: "POST",
        headers: createAuthenticatedJsonHeaders(authSessionToken),
        body: JSON.stringify({
          profileId,
          tokenSymbol,
          amount,
        }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          setErrorMessage("Claim requests are currently unavailable for this balance.");
          return;
        }
        setErrorMessage("Claim request failed. Check pending claims or requested amount.");
        return;
      }

      const result = (await response.json()) as ClaimResponse;
      setClaimResult(result);
      captureAnalyticsEvent("bubbledrop_claim_requested", {
        profile_id: result.profileId,
        claim_id: result.claimId,
        token_symbol: result.tokenSymbol,
        amount: result.amount,
        status: result.status,
      });
      await loadBalances(profileId);
    } catch {
      setErrorMessage("We couldn't submit that claim right now.");
    } finally {
      setClaimingToken(null);
    }
  };

  const seasonTitle = profileSummary?.seasonProgress.eligibleAtSeasonEnd
    ? "Season-end chance active"
    : "Season chance building";
  const seasonDescription = isResolvingOnboardingState
    ? "Loading season status."
    : needsOnboarding
      ? "Claim requests stay locked until backend confirms onboarding completion."
      : "Legacy token claims stay available when a balance already exists. New season rewards are decided at season end.";

  return (
    <ScreenLayout>
      <Section
        kicker="MVP claims"
        title="Legacy token claims"
        headingLevel="h1"
        description="Season rewards no longer mint per run. This screen only handles any already-issued legacy token balances still waiting to be claimed."
        trailing={<BackButton />}
      />

      {needsOnboarding ? (
        <Section
          kicker="First entry required"
          title="Finish onboarding before claim access"
          description="Backend still marks this profile as first-entry. Return home to complete the onboarding learning cards and identity setup before opening claim flow."
        >
          <NavLinkButton href="/" variant="primary">
            Go to onboarding
          </NavLinkButton>
        </Section>
      ) : null}

      <Section
        kicker="Season status"
        title={seasonTitle}
        description={seasonDescription}
        trailing={<Badge tone={qualificationBadge.tone}>{qualificationBadge.label}</Badge>}
      >
        {profileSummary ? (
          <Grid columns={2} gap={3}>
            <StatTile label="Qualification" value={qualificationBadge.label} />
            <StatTile
              label="Claim requests"
              value={needsOnboarding ? "Locked" : "Legacy only"}
            />
          </Grid>
        ) : null}
      </Section>

      <Section variant="accent" padding="md">
        <Text variant="overline" tone="accent">
          Season reward flow
        </Text>
        <Text variant="body" tone="primary" weight="semibold">
          Daily check-in, streak, and XP now feed a season-end chance instead of instant run-by-run token issuance.
        </Text>
      </Section>

      <Section
        title="Claimable balance summary"
        trailing={
          canUseBackend && !needsOnboarding ? (
            <IconButton
              label="Refresh balances"
              variant="secondary"
              size="sm"
              disabled={isLoadingBalances}
              onClick={() => {
                if (!profileId) {
                  return;
                }
                void loadBalances(profileId);
              }}
            >
              <UnifiedIcon kind="refresh" />
            </IconButton>
          ) : undefined
        }
      >
        <Grid columns={2} gap={3}>
          <StatTile
            label="Tokens"
            value={canUseBackend ? balances.length : "—"}
            icon={<UnifiedIcon kind="tokens" />}
          />
          <StatTile
            label="Total claimable"
            value={canUseBackend ? totalClaimable : "—"}
            icon={<UnifiedIcon kind="vault" />}
          />
        </Grid>
        {profileId ? (
          <Text variant="caption" tone="muted">
            Profile: {profileId}
          </Text>
        ) : null}
      </Section>

      <Section title="Claimable legacy balances">
        <Text variant="caption" tone="muted" weight="semibold">
          Sponsored payout • No gas from you
        </Text>

        <LoadingState
          message={
            isResolvingOnboardingState
              ? "Loading backend onboarding state..."
              : !isLoadingBalances
                ? null
                : "Loading balances..."
          }
        />

        {!isResolvingOnboardingState &&
        !isLoadingBalances &&
        canUseBackend &&
        !needsOnboarding &&
        balances.length === 0 ? (
          <EmptyState message="No claimable balances available." />
        ) : null}

        {!isResolvingOnboardingState && !isLoadingBalances && canUseBackend && !needsOnboarding ? (
          <Stack gap={3}>
            {balances.map((item) => {
              const isClaiming = claimingToken === item.tokenSymbol;
              return (
                <Card key={item.tokenSymbol} variant="muted" padding="sm">
                  <Stack gap={2}>
                    <Row justify="between" align="center">
                      <Text variant="body" tone="primary" weight="semibold">
                        {item.tokenSymbol}
                      </Text>
                      <Text variant="body" tone="primary" weight="bold">
                        {item.claimableAmount}
                      </Text>
                    </Row>
                    <Button
                      variant="primary"
                      size="sm"
                      fullWidth
                      disabled={isClaiming || !canRequestClaims}
                      onClick={() => onClaimToken(item.tokenSymbol, item.claimableAmount)}
                    >
                      {isClaiming
                        ? "Submitting claim..."
                        : canRequestClaims
                          ? "Request full claim amount"
                          : "Sign in to claim"}
                    </Button>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        ) : null}

        {!canUseBackend ? (
          <Text variant="body" tone="muted">
            Connect and sign in on the home screen to load live claim data.
          </Text>
        ) : null}
        {canUseBackend && needsOnboarding ? (
          <Text variant="body" tone="muted">
            Claim flow is locked until backend confirms onboarding completion.
          </Text>
        ) : null}
      </Section>

      {claimResult ? (
        <Section title="Latest claim request" headingLevel="h3">
          <Card variant="muted" padding="sm">
            <Stack gap={2}>
              <Text variant="body" tone="accent">
                {`Claim ${claimResult.claimId} for ${claimResult.tokenSymbol} ${claimResult.amount}`}
              </Text>
              <Row gap={1} align="baseline">
                <Text variant="label" tone="accent">Status:</Text>
                <Text variant="label" tone="primary" weight="semibold">
                  {claimResult.status.toUpperCase()}
                </Text>
              </Row>
              {claimResult.txHash ? (
                <Row gap={1} align="baseline" wrap>
                  <Text variant="label" tone="accent">Gasless relay tx:</Text>
                  <Text variant="label" tone="primary" weight="semibold">
                    {claimResult.txHash}
                  </Text>
                </Row>
              ) : null}
              {claimResult.settlementRecordTxHash ? (
                <Row gap={1} align="baseline" wrap>
                  <Text variant="label" tone="accent">Claim ledger tx:</Text>
                  <Text variant="label" tone="primary" weight="semibold">
                    {claimResult.settlementRecordTxHash}
                  </Text>
                </Row>
              ) : null}
              <Row gap={1} align="baseline" wrap>
                <Text variant="label" tone="accent">
                  Remaining claimable balance after this claim:
                </Text>
                <Text variant="label" tone="primary" weight="semibold">
                  {claimResult.remainingClaimableBalance}
                </Text>
              </Row>
              <Text variant="caption" tone="muted">
                Sponsored payout • No gas from you
              </Text>
            </Stack>
          </Card>
        </Section>
      ) : null}

      <ErrorMessage message={mapErrorMessage(errorMessage)} />
    </ScreenLayout>
  );
}
