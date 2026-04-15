"use client";

import { useEffect, useState } from "react";
import { captureAnalyticsEvent } from "../analytics";
import {
  BUBBLEDROP_API_BASE,
  useBubbleDropRuntime,
} from "../bubbledrop-runtime";
import {
  BackButton,
  Card,
  ErrorMessage,
  ExternalLinkButton,
  IconButton,
  LoadingState,
  ScreenLayout,
  Section,
  Stack,
  Text,
} from "../components";
import { UnifiedIcon } from "./unified-icons";

function mapErrorMessage(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  if (raw === "Unable to load token details from backend.") {
    return "This token page is unavailable right now.";
  }
  return "We couldn't refresh this token page.";
}

type PartnerTokenDetailView = {
  id: string;
  symbol: string;
  name: string;
  contractAddress: string;
  twitterUrl: string;
  chartUrl: string | null;
  dexscreenerUrl: string | null;
  season: {
    id: string;
    key: string;
    title: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
  };
  pinCount: number;
};

export function TokenDetailScreen({ tokenId }: { tokenId: string }) {
  const runtimeContext = useBubbleDropRuntime();
  const [token, setToken] = useState<PartnerTokenDetailView | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const backendUrl = BUBBLEDROP_API_BASE;

  const loadToken = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${backendUrl}/partner-token/token/${encodeURIComponent(tokenId)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        setToken(null);
        setErrorMessage("Unable to load token details from backend.");
        return;
      }

      const payload = (await response.json()) as PartnerTokenDetailView;
      setToken(payload);
      captureAnalyticsEvent("bubbledrop_token_detail_viewed", {
        profile_id: runtimeContext.profileId,
        token_id: payload.id,
        token_symbol: payload.symbol,
        season_key: payload.season.key,
      });
    } catch {
      setToken(null);
      setErrorMessage("Backend connection failed while loading token details.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenId, runtimeContext.profileId]);

  const marketUrl = token?.chartUrl || token?.dexscreenerUrl || null;

  return (
    <ScreenLayout>
      <Section
        kicker="Partner token"
        title="Token detail"
        headingLevel="h1"
        description="View the token profile, season context, and official links for this featured drop."
        trailing={<BackButton href="/season" />}
      />

      <Section
        title="Token info"
        trailing={
          <IconButton
            label="Refresh token"
            variant="secondary"
            size="sm"
            disabled={isLoading}
            onClick={() => void loadToken()}
          >
            <UnifiedIcon kind="refresh" />
          </IconButton>
        }
      >
        <LoadingState message={isLoading ? "Loading token details..." : null} />

        {token ? (
          <Card variant="muted" padding="sm">
            <Stack gap={2}>
              <Text variant="body" tone="accent" weight="semibold">
                {token.name} ({token.symbol})
              </Text>
              <Text variant="mono" tone="muted">
                {token.contractAddress}
              </Text>
              <Text variant="caption" tone="muted">
                Season: {token.season.title}
              </Text>
              <Text variant="caption" tone="muted">
                Pins: {token.pinCount}
              </Text>
              <ExternalLinkButton
                href={token.twitterUrl}
                variant="secondary"
                size="sm"
                fullWidth
                icon={<UnifiedIcon kind="twitter" />}
              >
                Open X / Twitter
              </ExternalLinkButton>
              <ExternalLinkButton
                href={marketUrl}
                variant="primary"
                size="sm"
                fullWidth
                icon={<UnifiedIcon kind="chart" />}
                onClick={() =>
                  captureAnalyticsEvent("bubbledrop_token_market_link_opened", {
                    profile_id: runtimeContext.profileId,
                    token_id: token.id,
                    token_symbol: token.symbol,
                  })
                }
              >
                Open chart / DexScreener
              </ExternalLinkButton>
              {!token.twitterUrl && !marketUrl ? (
                <Card variant="muted" padding="sm">
                  <Text variant="caption" tone="muted">
                    Market links have not been added for this token yet.
                  </Text>
                </Card>
              ) : null}
            </Stack>
          </Card>
        ) : !isLoading ? (
          <Card variant="muted" padding="sm">
            <Text variant="body" tone="muted">
              Token details are not available yet.
            </Text>
          </Card>
        ) : null}
      </Section>

      <ErrorMessage message={mapErrorMessage(errorMessage)} />
    </ScreenLayout>
  );
}
