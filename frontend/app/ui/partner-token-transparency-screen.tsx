"use client";

import { useEffect, useMemo, useState } from "react";
import { captureAnalyticsEvent } from "../analytics";
import {
  BUBBLEDROP_API_BASE,
  useBubbleDropRuntime,
} from "../bubbledrop-runtime";
import {
  BackButton,
  Card,
  EmptyState,
  ErrorMessage,
  ExternalLinkButton,
  LoadingState,
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
  if (raw === "Unable to load partner token transparency data from backend.") {
    return "Partner token details are unavailable right now.";
  }
  if (raw === "Partner token data is unavailable right now.") {
    return raw;
  }
  return "We couldn't refresh the partner token view.";
}

type PartnerTokenView = {
  id: string;
  name: string;
  contractAddress: string;
  twitterUrl: string;
  chartUrl: string | null;
  dexscreenerUrl: string | null;
  seasonTitle: string;
};

export function PartnerTokenTransparencyScreen() {
  const runtimeContext = useBubbleDropRuntime();
  const [tokens, setTokens] = useState<PartnerTokenView[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const backendUrl = BUBBLEDROP_API_BASE;
  const endpoint = backendUrl ? `${backendUrl}/partner-token/transparency` : null;

  useEffect(() => {
    const resolvedProfileId = runtimeContext.profileId;

    const loadTokens = async () => {
      if (!endpoint) {
        setErrorMessage("Partner token data is unavailable right now.");
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch(endpoint, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        if (!response.ok) {
          setTokens([]);
          setErrorMessage("Unable to load partner token transparency data from backend.");
          return;
        }

        const payload = (await response.json()) as PartnerTokenView[];
        setTokens(payload);
        captureAnalyticsEvent("bubbledrop_partner_transparency_viewed", {
          profile_id: resolvedProfileId,
          token_count: payload.length,
        });
      } catch {
        setTokens([]);
        setErrorMessage("Backend connection failed while loading partner token data.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadTokens();
  }, [endpoint, runtimeContext.profileId]);

  const tokenCount = useMemo(() => tokens.length, [tokens]);

  return (
    <ScreenLayout>
      <Section
        kicker="Partner spotlight"
        title="Partner token transparency"
        headingLevel="h1"
        description="Explore the featured partner tokens for this season, with quick access to official links and market context."
        trailing={<BackButton />}
      />

      <Section title="Season token overview">
        <StatTile label="Loaded tokens" value={tokenCount} />
      </Section>

      <Section title="Token list">
        <LoadingState message={isLoading ? "Loading featured partner tokens..." : null} />

        {!isLoading && tokens.length === 0 && !errorMessage ? (
          <EmptyState message="No featured partner tokens are live right now." />
        ) : null}

        {!isLoading && tokens.length > 0 ? (
          <Stack gap={3}>
            {tokens.map((token) => {
              const marketUrl = token.chartUrl || token.dexscreenerUrl;
              return (
                <Card key={token.id} variant="muted" padding="sm">
                  <Stack gap={2}>
                    <Text variant="body" tone="accent" weight="semibold">
                      {token.name}
                    </Text>
                    <Text variant="caption" tone="muted">
                      Season: {token.seasonTitle}
                    </Text>

                    <Card variant="muted" padding="sm">
                      <Stack gap={1}>
                        <Text variant="caption" tone="accent" weight="semibold">
                          Contract
                        </Text>
                        <Text variant="mono" tone="muted">
                          {token.contractAddress}
                        </Text>
                      </Stack>
                    </Card>

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
                        captureAnalyticsEvent("bubbledrop_partner_market_link_opened", {
                          profile_id: runtimeContext.profileId,
                          token_id: token.id,
                          token_name: token.name,
                        })
                      }
                    >
                      Open chart / DexScreener
                    </ExternalLinkButton>

                    {!token.twitterUrl && !marketUrl ? (
                      <Card variant="muted" padding="sm">
                        <Text variant="caption" tone="muted">
                          Market links have not been shared for this token yet.
                        </Text>
                      </Card>
                    ) : null}
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        ) : null}
      </Section>

      <ErrorMessage message={mapErrorMessage(errorMessage)} />
    </ScreenLayout>
  );
}
