"use client";

import { Card } from "./Card";
import { Text } from "./Text";

type ErrorMessageProps = {
  message: string | null;
};

export function ErrorMessage({ message }: ErrorMessageProps) {
  if (!message) {
    return null;
  }

  return (
    <Card variant="warning" padding="sm">
      <Text variant="body" tone="danger">
        {message}
      </Text>
    </Card>
  );
}
