"use client";

import { Text } from "./Text";

type LoadingStateProps = {
  message?: string | null;
};

// Renders null when message is nullish; otherwise a muted caption.
// API matches ErrorMessage for consistency.
export function LoadingState({ message }: LoadingStateProps) {
  if (!message) {
    return null;
  }

  return (
    <Text variant="body" tone="muted">
      {message}
    </Text>
  );
}
