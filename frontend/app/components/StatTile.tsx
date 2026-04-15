"use client";

import type { ReactNode } from "react";
import { Card } from "./Card";
import { Row } from "./Row";
import { Stack } from "./Stack";
import { Text } from "./Text";

type StatTileProps = {
  label: string;
  value: string | number;
  icon?: ReactNode;
};

export function StatTile({ label, value, icon }: StatTileProps) {
  return (
    <Card variant="muted" padding="sm">
      <Stack gap={1}>
        <Row gap={1} align="center">
          {icon}
          <Text variant="caption" tone="muted">
            {label}
          </Text>
        </Row>
        <Text variant="body" tone="primary" weight="semibold">
          {String(value)}
        </Text>
      </Stack>
    </Card>
  );
}
