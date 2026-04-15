"use client";

import type { ReactNode } from "react";
import { Card } from "./Card";
import { Heading, type HeadingLevel } from "./Heading";
import { Row } from "./Row";
import { Stack } from "./Stack";
import { Text } from "./Text";

type SectionProps = {
  children?: ReactNode;
  title?: string;
  kicker?: string;
  description?: string;
  trailing?: ReactNode;
  headingLevel?: HeadingLevel;
  variant?: "default" | "muted" | "accent" | "warning" | "success";
  padding?: "sm" | "md" | "lg";
};

export function Section({
  children,
  title,
  kicker,
  description,
  trailing,
  headingLevel = "h2",
  variant = "default",
  padding = "md",
}: SectionProps) {
  const hasHeader = Boolean(title || kicker || trailing);

  return (
    <Card variant={variant} padding={padding}>
      <Stack gap={3}>
        {hasHeader ? (
          <Row justify="between" align="start" gap={3}>
            <Stack gap={1} fullWidth={false}>
              {kicker ? (
                <Text variant="overline" tone="accent">
                  {kicker}
                </Text>
              ) : null}
              {title ? <Heading level={headingLevel}>{title}</Heading> : null}
            </Stack>
            {trailing}
          </Row>
        ) : null}
        {description ? (
          <Text variant="body" tone="secondary">
            {description}
          </Text>
        ) : null}
        {children}
      </Stack>
    </Card>
  );
}
