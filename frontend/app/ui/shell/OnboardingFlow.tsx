"use client";

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
      <section className="bubble-card p-4">
        <div className="gloss-pill rounded-2xl bg-gradient-to-r from-[#99dbff] to-[#d6c8ff] p-4 text-[#1d2f57]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#3d5686]">
            Learning card {cardIndex + 1}/{totalCards}
          </p>
          <h1 className="mt-1 text-xl font-bold">{currentCard.title}</h1>
          <p className="mt-2 text-sm text-[#425b8a]">{currentCard.question}</p>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {currentCard.options.map((option, index) => {
            const isSelected = selectedOption === index;
            const isCorrect = index === currentCard.correctIndex;
            const style = isSelected
              ? isCorrect
                ? "from-[#bef8de] to-[#d8ffe9] text-[#1f5943]"
                : "from-[#ffd9e7] to-[#ffe6ef] text-[#7c3550]"
              : "from-white to-white text-[#324d7a]";

            return (
              <button
                key={option}
                type="button"
                onClick={() => onAnswer(index)}
                className={`gloss-pill rounded-xl bg-gradient-to-r px-4 py-3 text-left text-sm font-semibold ${style}`}
              >
                {option}
              </button>
            );
          })}
        </div>

        {showWrongExplanation ? (
          <div className="mt-3 rounded-xl border border-[#f6c2d4] bg-[#fff2f7] p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9f4b67]">
              Correct answer note
            </p>
            <p className="mt-1 text-sm text-[#7f3a53]">{currentCard.wrongExplanation}</p>
            <button
              type="button"
              onClick={goNextCard}
              className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#6d466e]"
            >
              Continue
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  if (onboardingCompletionVisible) {
    return (
      <section className="bubble-card p-4">
        <div className="gloss-pill rounded-2xl bg-gradient-to-r from-[#99dbff] to-[#d6c8ff] p-4 text-[#1d2f57]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#3d5686]">
            Complete onboarding
          </p>
          <h1 className="mt-1 text-xl font-bold">Set your BubbleDrop identity</h1>
          <p className="mt-2 text-sm text-[#425b8a]">
            Finish first entry with a nickname. Starter Bubble Blue is applied automatically.
          </p>
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6074a0]">Nickname</label>
          <input
            value={nicknameInput}
            onChange={(event) => onNicknameChange(event.target.value)}
            maxLength={32}
            placeholder="Choose your nickname"
            className="mt-2 w-full rounded-xl border border-[#d6e3ff] bg-white/80 px-3 py-3 text-sm text-[#2d4578] outline-none"
          />
        </div>

        <button
          type="button"
          onClick={onCompleteOnboarding}
          disabled={
            isSubmittingAction ||
            !authenticatedSessionToken
          }
          className="gloss-pill mt-4 w-full rounded-xl bg-gradient-to-r from-[#a7efff] to-[#c0ccff] px-4 py-3 text-left text-sm font-semibold text-[#1f3561] disabled:opacity-60"
        >
          {isSubmittingAction ? "Submitting..." : "Complete onboarding"}
        </button>
        {actionMessage ? (
          <p className="mt-3 whitespace-pre-line rounded-xl bg-white/80 p-3 text-xs font-semibold text-[#4f648f]">
            {actionMessage}
          </p>
        ) : null}
      </section>
    );
  }

  return null;
}
