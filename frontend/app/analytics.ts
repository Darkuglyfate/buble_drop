"use client";

import posthog from "posthog-js";

let isInitialized = false;

function getPostHogKey(): string | null {
  const value = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  return value && value.trim() ? value.trim() : null;
}

function getPostHogHost(): string {
  const value = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  return value && value.trim() ? value.trim() : "https://us.i.posthog.com";
}

export function initAnalytics(): void {
  if (typeof window === "undefined" || isInitialized) {
    return;
  }

  const key = getPostHogKey();
  if (!key) {
    return;
  }

  posthog.init(key, {
    api_host: getPostHogHost(),
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    persistence: "localStorage",
  });
  isInitialized = true;
}

export function analyticsEnabled(): boolean {
  return !!getPostHogKey();
}

export function identifyAnalyticsUser(
  distinctId: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (!analyticsEnabled()) {
    return;
  }
  initAnalytics();
  posthog.identify(distinctId, properties);
}

export function captureAnalyticsEvent(
  eventName: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (!analyticsEnabled()) {
    return;
  }
  initAnalytics();
  posthog.capture(eventName, properties);
}
