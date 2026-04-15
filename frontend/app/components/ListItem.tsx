"use client";

import type { ReactNode } from "react";
import { Card } from "./Card";
import { Row } from "./Row";
import { Stack } from "./Stack";
import { Text } from "./Text";

type ListItemProps = {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
};

export function ListItem({ title, subtitle, trailing }: ListItemProps) {
  return (
    <Card variant="muted" padding="sm">
      <Row justify="between" align="center" gap={3} fullWidth>
        <Stack gap={1} fullWidth>
          <Text variant="body" tone="accent" weight="semibold">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" tone="muted">
              {subtitle}
            </Text>
          ) : null}
        </Stack>
        {trailing}
      </Row>
    </Card>
  );
}
