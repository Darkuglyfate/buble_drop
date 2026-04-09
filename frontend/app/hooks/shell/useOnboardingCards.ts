"use client";

import { useState } from "react";

export type OnboardingCard = {
  id: string;
  title: string;
  question: string;
  options: [string, string];
  correctIndex: 0 | 1;
  wrongExplanation: string;
};

export const ONBOARDING_CARDS: OnboardingCard[] = [
  {
    id: "daily-checkin",
    title: "Daily rhythm",
    question: "What keeps season reward progress active in BubbleDrop?",
    options: ["Daily Base check-in", "Opening the app only"],
    correctIndex: 0,
    wrongExplanation:
      "Season reward progress is tied to daily Base check-ins, not passive app opens.",
  },
  {
    id: "active-play",
    title: "Active session",
    question: "When is XP earned in bubble sessions?",
    options: ["Only during active play", "While idle in the app"],
    correctIndex: 0,
    wrongExplanation:
      "XP is active-play based. Idle presence must not grant session XP.",
  },
  {
    id: "qualified-overlay",
    title: "Status logic",
    question: "How does Qualified Status work with Rank Frame?",
    options: ["It overlays Rank Frame", "It replaces Rank Frame"],
    correctIndex: 0,
    wrongExplanation:
      "Qualified is a live overlay. Rank Frame remains long-term profile status.",
  },
];

export function useOnboardingCards() {
  const [cardIndex, setCardIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showWrongExplanation, setShowWrongExplanation] = useState(false);

  const currentCard = ONBOARDING_CARDS[cardIndex];
  const totalCards = ONBOARDING_CARDS.length;

  const goNextCard = () => {
    setSelectedOption(null);
    setShowWrongExplanation(false);

    if (cardIndex < ONBOARDING_CARDS.length - 1) {
      setCardIndex((prev) => prev + 1);
      return true;
    }

    return false;
  };

  const resetCards = () => {
    setCardIndex(0);
    setSelectedOption(null);
    setShowWrongExplanation(false);
  };

  return {
    cardIndex,
    selectedOption,
    showWrongExplanation,
    currentCard,
    totalCards,
    setSelectedOption,
    setShowWrongExplanation,
    goNextCard,
    resetCards,
  };
}
