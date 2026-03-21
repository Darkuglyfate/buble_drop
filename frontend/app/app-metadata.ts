const fallbackAppUrl = "https://bubledrop.vercel.app";
const fallbackBaseAppId = "69b7314fd6271e8cedf2addb";

export const bubbleDropAppIdentity = {
  name: "BubbleDrop",
  titleTemplate: "%s | BubbleDrop",
  tagline: "Daily Base check-ins, active bubble sessions, and gated rare rewards.",
  description:
    "BubbleDrop is a mobile-first Base app where players return for daily check-ins, active bubble sessions, XP progression, and transparent partner token reward paths.",
  categorySuggestion: "games",
  productionUrlEnvVar: "NEXT_PUBLIC_APP_URL",
  productionUrlPlaceholder: fallbackAppUrl,
  baseAppIdEnvVar: "NEXT_PUBLIC_BASE_APP_ID",
  baseAppIdPlaceholder: fallbackBaseAppId,
  builderCodePlacement:
    "Register the builder code in Base.dev project settings instead of hardcoding it into the frontend runtime.",
  assetInventory: {
    repoIconPath: "frontend/app/favicon.ico",
    miniAppIconPath: "frontend/public/miniapp-icon.png",
    miniAppSplashPath: "frontend/public/miniapp-splash.png",
    missingAssets: [
      "A polished square app icon asset for Base.dev listing",
      "At least one real BubbleDrop screenshot from the production UI",
      "A social or preview image for richer link sharing",
    ],
  },
} as const;

export function getBubbleDropAppUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  return fallbackAppUrl;
}

export function getBubbleDropBaseAppId(): string {
  const configuredBaseAppId = process.env.NEXT_PUBLIC_BASE_APP_ID?.trim();
  if (configuredBaseAppId) {
    return configuredBaseAppId;
  }

  return fallbackBaseAppId;
}

