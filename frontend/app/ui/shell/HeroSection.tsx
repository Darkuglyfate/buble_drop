"use client";

import {
  Badge,
  Button,
  Card,
  Heading,
  Row,
  Section,
  Stack,
  Text,
} from "../../components";
import type { WalletFlowState } from "../../hooks/shell/useWalletFlow";

export type HeroSectionProps = {
  effectiveIsConnected: boolean;
  isRareRewardAccessActive: boolean;
  heroStatusLabel: string;
  heroTitle: string;
  heroBody: string;
  heroPortalCopy: string;
  homeStatusPills: string[];
  walletFlowTitle: string | null;
  walletFlowState: WalletFlowState;
  showConnectRecovery: boolean;
  showSignInRecovery: boolean;
  isWalletFlowBusy: boolean;
  isSubmittingAction: boolean;
  preferredConnectorUsesCoinbaseWallet: boolean;
  preferredConnectorUsesBaseAccount: boolean;
  fallbackWalletConnector: unknown | null;
  fallbackConnectorUsesCoinbaseWallet: boolean;
  onConnectWallet: () => void;
  onConnectCoinbaseWallet: () => void;
  onSignInWithBase: () => void;
  showHeroSecondaryAction: boolean;
  secondaryHeroActionLabel: string | null;
  secondaryHeroActionDisabled: boolean;
  secondaryHeroActionHandler: (() => void) | null;
};

export function HeroSection({
  effectiveIsConnected,
  isRareRewardAccessActive,
  heroStatusLabel,
  heroTitle,
  heroBody,
  heroPortalCopy,
  homeStatusPills,
  walletFlowTitle,
  walletFlowState,
  showConnectRecovery,
  showSignInRecovery,
  isWalletFlowBusy,
  isSubmittingAction,
  preferredConnectorUsesCoinbaseWallet,
  preferredConnectorUsesBaseAccount,
  fallbackWalletConnector,
  fallbackConnectorUsesCoinbaseWallet,
  onConnectWallet,
  onConnectCoinbaseWallet,
  onSignInWithBase,
  showHeroSecondaryAction,
  secondaryHeroActionLabel,
  secondaryHeroActionDisabled,
  secondaryHeroActionHandler,
}: HeroSectionProps) {
  const heroVariant = isRareRewardAccessActive ? "accent" : "default";

  return (
    <Section variant={heroVariant} padding="lg">
      <Stack gap={3}>
        {!effectiveIsConnected ? (
          <Row justify="between" align="baseline" gap={3} wrap>
            <Text variant="overline" tone="muted">
              {heroStatusLabel}
            </Text>
            <Text variant="overline" tone="muted">
              {heroPortalCopy}
            </Text>
          </Row>
        ) : (
          <Text variant="overline" tone="muted">
            {heroStatusLabel}
          </Text>
        )}

        <Heading level="h1">{heroTitle}</Heading>
        <Text variant="body" tone="secondary">
          {heroBody}
        </Text>

        {effectiveIsConnected ? (
          <Text variant="overline" tone="accent">
            {heroPortalCopy}
          </Text>
        ) : null}

        {homeStatusPills.length > 0 ? (
          <Row gap={2} wrap>
            {homeStatusPills.map((pill) => (
              <Badge key={pill} tone="info">
                {pill}
              </Badge>
            ))}
          </Row>
        ) : null}

        {!effectiveIsConnected ? (
          <Card variant="muted" padding="sm">
            <Stack gap={1}>
              <Text variant="overline" tone="accent">
                Do this next
              </Text>
              <Text variant="body" tone="primary" weight="semibold">
                Connect your wallet first, then use the profile card action above to sign in.
              </Text>
            </Stack>
          </Card>
        ) : null}

        {showHeroSecondaryAction && secondaryHeroActionLabel && secondaryHeroActionHandler ? (
          <Button
            variant="secondary"
            size="md"
            fullWidth
            disabled={secondaryHeroActionDisabled}
            onClick={secondaryHeroActionHandler}
          >
            {secondaryHeroActionLabel}
          </Button>
        ) : null}

        {walletFlowTitle && walletFlowState.message ? (
          <Card variant="muted" padding="sm">
            <Stack gap={1}>
              <Text variant="overline" tone="muted">
                {walletFlowTitle}
              </Text>
              <Text variant="body" tone="primary" weight="semibold">
                {walletFlowState.message}
              </Text>
            </Stack>
          </Card>
        ) : null}

        {showConnectRecovery ? (
          <Stack gap={2}>
            <Button
              variant="primary"
              size="md"
              fullWidth
              disabled={isWalletFlowBusy || isSubmittingAction}
              onClick={onConnectWallet}
            >
              {`Retry ${
                preferredConnectorUsesCoinbaseWallet
                  ? "Coinbase Wallet"
                  : preferredConnectorUsesBaseAccount
                    ? "Base connection"
                    : "in-app Base"
              }`}
            </Button>
            {fallbackWalletConnector ? (
              <Button
                variant="secondary"
                size="md"
                fullWidth
                disabled={isWalletFlowBusy || isSubmittingAction}
                onClick={onConnectCoinbaseWallet}
              >
                {fallbackConnectorUsesCoinbaseWallet
                  ? "Try Coinbase Wallet fallback"
                  : "Try alternate Base route"}
              </Button>
            ) : null}
          </Stack>
        ) : null}

        {showSignInRecovery ? (
          <Button
            variant="primary"
            size="md"
            fullWidth
            disabled={isWalletFlowBusy || isSubmittingAction}
            onClick={onSignInWithBase}
          >
            Retry Base sign-in
          </Button>
        ) : null}
      </Stack>
    </Section>
  );
}
