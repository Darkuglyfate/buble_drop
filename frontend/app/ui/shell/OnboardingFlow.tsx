"use client";

import {
  Button,
  Card,
  Heading,
  Input,
  Section,
  Stack,
  Text,
} from "../../components";
import type { OnboardingCard } from "../../hooks/shell/useOnboardingCards";

export type OnboardingFlowProps = {
  /** Whether to show the learning cards phase */
  onboardingVisible: boolean;
  /** Whether to show the completion/nickname phase */
  onboardingCompletionVisible: boolean;
  cardIndex: number;
  totalCards: number;
  currentCard: OnboardingCard;
  selectedOption: number | null;
  showWrongExplanation: boolean;
  nicknameInput: string;
  isSubmittingAction: boolean;
  authenticatedSessionToken: string | null;
  actionMessage: string | null;
  onAnswer: (index: number) => void;
  goNextCard: () => void;
  onNicknameChange: (value: string) => void;
  onCompleteOnboarding: () => void;
};

export function OnboardingFlow({
  onboardingVisible,
  onboardingCompletionVisible,
  cardIndex,
  totalCards,
  currentCard,
  selectedOption,
  showWrongExplanation,
  nicknameInput,
  isSubmittingAction,
  authenticatedSessionToken,
  actionMessage,
  onAnswer,
  goNextCard,
  onNicknameChange,
  onCompleteOnboarding,
}: OnboardingFlowProps) {
  if (onboardingVisible) {
    return (
      <Section>
        <Stack gap={4}>
          <Card variant="accent" padding="md">
            <Stack gap={2}>
              <Text variant="overline" tone="accent">
                Learning card {cardIndex + 1}/{totalCards}
              </Text>
              <Heading level="h1">{currentCard.title}</Heading>
              <Text variant="body" tone="secondary">
                {currentCard.question}
              </Text>
            </Stack>
          </Card>

          <Stack gap={2}>
            {currentCard.options.map((option, index) => {
              const isSelected = selectedOption === index;
              const isCorrect = index === currentCard.correctIndex;
              const variant = isSelected
                ? isCorrect
                  ? "accent"
                  : "danger"
                : "secondary";
              return (
                <Button
                  key={option}
                  variant={variant}
                  size="md"
                  fullWidth
                  onClick={() => onAnswer(index)}
                >
                  {option}
                </Button>
              );
            })}
          </Stack>

          {showWrongExplanation ? (
            <Card variant="warning" padding="sm">
              <Stack gap={2}>
                <Text variant="overline" tone="danger">
                  Correct answer note
                </Text>
                <Text variant="body" tone="danger">
                  {currentCard.wrongExplanation}
                </Text>
                <Button variant="secondary" size="sm" onClick={goNextCard}>
                  Continue
                </Button>
              </Stack>
            </Card>
          ) : null}
        </Stack>
      </Section>
    );
  }

  if (onboardingCompletionVisible) {
    return (
      <Section>
        <Stack gap={4}>
          <Card variant="accent" padding="md">
            <Stack gap={2}>
              <Text variant="overline" tone="accent">
                Complete onboarding
              </Text>
              <Heading level="h1">Set your BubbleDrop identity</Heading>
              <Text variant="body" tone="secondary">
                Finish first entry with a nickname. Starter Bubble Blue is applied automatically.
              </Text>
            </Stack>
          </Card>

          <Stack gap={2}>
            <Text variant="overline" tone="muted">
              Nickname
            </Text>
            <Input
              value={nicknameInput}
              onChange={onNicknameChange}
              placeholder="Choose your nickname"
              maxLength={32}
            />
          </Stack>

          <Button
            variant="primary"
            size="md"
            fullWidth
            disabled={isSubmittingAction || !authenticatedSessionToken}
            onClick={onCompleteOnboarding}
          >
            {isSubmittingAction ? "Submitting..." : "Complete onboarding"}
          </Button>

          {actionMessage ? (
            <Card variant="muted" padding="sm">
              <Text variant="caption" tone="accent" weight="semibold">
                {actionMessage}
              </Text>
            </Card>
          ) : null}
        </Stack>
      </Section>
    );
  }

  return null;
}
