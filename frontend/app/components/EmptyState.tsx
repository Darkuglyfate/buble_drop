"use client";

import { Card } from "./Card";
import { Text } from "./Text";

type EmptyStateProps = {
  message: string;
};

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <Card variant="muted" padding="md">
      <Text variant="body" tone="muted">
        {message}
      </Text>
    </Card>
  );
}
