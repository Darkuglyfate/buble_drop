import { expect, test, type Page } from "@playwright/test";

const walletAddress = "0x1000000000000000000000000000000000000001";
const smokeWalletQuery = `smokeWalletAddress=${walletAddress}&smokeChainId=8453`;
const activeProfileId = "20000000-0000-4000-8000-000000000001";
const onboardingProfileId = "20000000-0000-4000-8000-000000000099";
const claimGatedProfileId = "20000000-0000-4000-8000-000000000055";
const starterAvatarId = "avatar-starter-blue";
const tokenId = "token-bubl";

type SummaryOverrides = Partial<{
  needsOnboarding: boolean;
  nickname: string | null;
  totalXp: number;
  currentStreak: number;
  qualificationStatus:
    | "locked"
    | "in_progress"
    | "qualified"
    | "paused"
    | "restored";
  rareRewardAccessActive: boolean;
  claimableBalances: Array<{
    tokenSymbol: string;
    claimableAmount: string;
  }>;
}>;

function buildProfileSummary(
  profileId: string,
  overrides: SummaryOverrides = {},
) {
  return {
    onboardingState: {
      needsOnboarding: overrides.needsOnboarding ?? false,
      onboardingCompletedAt:
        overrides.needsOnboarding ?? false
          ? null
          : "2026-03-14T12:00:00.000Z",
    },
    profileIdentity: {
      profileId,
      walletAddress,
      nickname: overrides.nickname ?? "bubblecaptain",
    },
    avatarState: {
      currentAvatar:
        overrides.needsOnboarding ?? false
          ? null
          : {
              id: starterAvatarId,
              key: "starter-bubble-blue",
              label: "Starter Bubble Blue",
            },
    },
    xpSummary: {
      totalXp: overrides.totalXp ?? 710,
      currentStreak: overrides.currentStreak ?? 6,
    },
    rankFrameState: {
      currentFrame: {
        id: "rank-gold",
        key: "gold",
        label: "Gold",
        minLifetimeXp: 700,
      },
      nextFrame: {
        id: "rank-platinum",
        key: "platinum",
        label: "Platinum",
        minLifetimeXp: 1500,
        xpToReach: Math.max(0, 1500 - (overrides.totalXp ?? 710)),
      },
    },
    qualificationState: {
      status: overrides.qualificationStatus ?? "qualified",
    },
    rareRewardAccess: {
      active: overrides.rareRewardAccessActive ?? true,
    },
    claimableTokenBalanceSummary: {
      totalClaimableAmount: (
        overrides.claimableBalances ?? [
          { tokenSymbol: "BUBL", claimableAmount: "3" },
        ]
      )
        .reduce(
          (sum, balance) => sum + Number.parseInt(balance.claimableAmount, 10),
          0,
        )
        .toString(),
      tokenCount: (overrides.claimableBalances ?? [
        { tokenSymbol: "BUBL", claimableAmount: "3" },
      ]).length,
      balances:
        overrides.claimableBalances ?? [
          { tokenSymbol: "BUBL", claimableAmount: "3" },
        ],
    },
  };
}

async function mockBubbleDropApi(page: Page) {
  const state = {
    onboardingCompleted: false,
    currentStreak: 6,
  };

  await page.route("**/api/bubbledrop/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname.replace(/^\/api\/bubbledrop/, "");
    const { searchParams } = url;

    if (pathname === "/profile/summary" && request.method() === "GET") {
      const profileId = searchParams.get("profileId");
      if (profileId === onboardingProfileId) {
        await route.fulfill({
          json: buildProfileSummary(onboardingProfileId, {
            needsOnboarding: !state.onboardingCompleted,
            nickname: state.onboardingCompleted ? "newbie" : null,
            totalXp: state.onboardingCompleted ? 20 : 0,
            currentStreak: 0,
            qualificationStatus: "locked",
            rareRewardAccessActive: false,
            claimableBalances: [],
          }),
        });
        return;
      }

      if (profileId === claimGatedProfileId) {
        await route.fulfill({
          json: buildProfileSummary(claimGatedProfileId, {
            qualificationStatus: "paused",
            rareRewardAccessActive: false,
            claimableBalances: [{ tokenSymbol: "BUBL", claimableAmount: "3" }],
          }),
        });
        return;
      }

      await route.fulfill({
        json: buildProfileSummary(activeProfileId, {
          currentStreak: state.currentStreak,
          claimableBalances: [{ tokenSymbol: "BUBL", claimableAmount: "3" }],
        }),
      });
      return;
    }

    if (pathname === "/profile/starter-avatars" && request.method() === "GET") {
      await route.fulfill({
        json: [
          {
            id: starterAvatarId,
            key: "starter-bubble-blue",
            label: "Starter Bubble Blue",
          },
          {
            id: "avatar-starter-lilac",
            key: "starter-bubble-lilac",
            label: "Starter Bubble Lilac",
          },
        ],
      });
      return;
    }

    if (
      pathname === "/profile/onboarding/complete" &&
      request.method() === "POST"
    ) {
      state.onboardingCompleted = true;
      await route.fulfill({
        json: {
          profileId: onboardingProfileId,
          nickname: "newbie",
          avatarId: starterAvatarId,
          onboardingXpGranted: 20,
          totalXp: 20,
        },
      });
      return;
    }

    if (pathname === "/check-in/daily" && request.method() === "POST") {
      state.currentStreak += 1;
      await route.fulfill({
        json: {
          success: true,
          checkInDate: "2026-03-15",
          xpAwarded: 20,
          newStreak: state.currentStreak,
          rareAccessActive: true,
        },
      });
      return;
    }

    if (pathname === "/claim/balances" && request.method() === "GET") {
      const profileId = searchParams.get("profileId");
      await route.fulfill({
        json:
          profileId === claimGatedProfileId
            ? [{ tokenSymbol: "BUBL", claimableAmount: "3" }]
            : [{ tokenSymbol: "BUBL", claimableAmount: "3" }],
      });
      return;
    }

    if (pathname === "/bubble-session/start" && request.method() === "POST") {
      await route.fulfill({
        json: {
          sessionId: "session-1",
          profileId: activeProfileId,
          startedAt: "2026-03-15T12:00:00.000Z",
        },
      });
      return;
    }

    if (
      pathname === "/bubble-session/activity" &&
      request.method() === "POST"
    ) {
      await route.fulfill({
        json: {
          sessionId: "session-1",
          profileId: activeProfileId,
          recordedAt: "2026-03-15T12:00:12.000Z",
        },
      });
      return;
    }

    if (
      pathname === "/bubble-session/complete" &&
      request.method() === "POST"
    ) {
      await route.fulfill({
        json: {
          success: true,
          sessionId: "session-1",
          profileId: activeProfileId,
          endedAt: "2026-03-15T12:10:00.000Z",
          sessionDurationSeconds: 600,
          activeSeconds: 360,
          activePlayXp: 12,
          completionBonusXp: 20,
          xpAwarded: 62,
          newStreak: state.currentStreak,
          rareAccessActive: true,
          grantedXp: 62,
          totalXp: 772,
          qualificationStatus: "qualified",
          rareRewardAccessActive: true,
          rareRewardOutcome: {
            tokenSymbolAwarded: "BUBL",
            tokenAmountAwarded: "1",
            weeklyTicketsIssued: 1,
            nftIdsAwarded: ["nft-1"],
            cosmeticIdsAwarded: ["cosmetic-1"],
            tokenReward: {
              tokenSymbol: "BUBL",
              tokenAmountAwarded: "1",
              weeklyTicketsIssued: 1,
              seasonId: "season-1",
              weekStartDate: "2026-03-10",
            },
            nftRewards: [{ id: "nft-1", key: "genesis-spark" }],
            cosmeticRewards: [{ id: "cosmetic-1", key: "glossy-aura" }],
          },
        },
      });
      return;
    }

    if (
      pathname === "/partner-token/season-hub" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        json: {
          season: {
            id: "season-1",
            key: "genesis-bloom",
            title: "Genesis Bloom",
            startDate: "2026-03-01",
            endDate: "2026-04-30",
            isActive: true,
          },
          tokenCount: 1,
          tokens: [
            {
              id: tokenId,
              symbol: "BUBL",
              name: "Bubble Bloom",
            },
          ],
        },
      });
      return;
    }

    if (
      pathname === `/partner-token/token/${tokenId}` &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        json: {
          id: tokenId,
          symbol: "BUBL",
          name: "Bubble Bloom",
          contractAddress: "0x1111111111111111111111111111111111111111",
          twitterUrl: "https://x.com/bubbledrop_bloom",
          chartUrl: "https://charts.example.com/bubl",
          dexscreenerUrl: "https://dexscreener.com/base/bubl",
          season: {
            id: "season-1",
            key: "genesis-bloom",
            title: "Genesis Bloom",
            startDate: "2026-03-01",
            endDate: "2026-04-30",
            isActive: true,
          },
          pinCount: 2,
        },
      });
      return;
    }

    if (
      pathname === "/partner-token/transparency" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        json: [
          {
            id: tokenId,
            name: "Bubble Bloom",
            contractAddress: "0x1111111111111111111111111111111111111111",
            twitterUrl: "https://x.com/bubbledrop_bloom",
            chartUrl: "https://charts.example.com/bubl",
            dexscreenerUrl: "https://dexscreener.com/base/bubl",
            seasonTitle: "Genesis Bloom",
          },
        ],
      });
      return;
    }

    if (pathname === "/profile/connect-wallet" && request.method() === "POST") {
      await route.fulfill({
        json: {
          profileId: activeProfileId,
          walletAddress,
        },
      });
      return;
    }

    await route.fulfill({
      status: 404,
      json: {
        error: `Unhandled mock route for ${request.method()} ${pathname}`,
      },
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockBubbleDropApi(page);
});

test("renders wallet/bootstrap entry affordances on home", async ({ page }) => {
  await page.goto(`/?${smokeWalletQuery}`);

  await expect(page.getByText("Signed in")).toBeVisible();
  await expect(page.getByText("0x1000...0001")).toBeVisible();
  await expect(page.getByText("Rare lane live")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Enter today's bubble run" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Lock today's streak" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "Enter bubble session" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open season spotlight" })).toBeVisible();
});

test("completes onboarding flow with mocked backend confirmation", async ({
  page,
}) => {
  await page.goto(
    `/?profileId=${onboardingProfileId}&walletAddress=${walletAddress}&${smokeWalletQuery}`,
  );

  await expect(page.getByRole("heading", { name: "Daily rhythm" })).toBeVisible();
  await page.getByRole("button", { name: "Daily Base check-in" }).click();
  await expect(page.getByRole("heading", { name: "Active session" })).toBeVisible();
  await page.getByRole("button", { name: "Only during active play" }).click();
  await expect(page.getByRole("heading", { name: "Status logic" })).toBeVisible();
  await page
    .getByRole("button", { name: "It overlays Rank Frame" })
    .click();

  await expect(page.getByText("Set your BubbleDrop identity")).toBeVisible();
  await page.getByPlaceholder("Choose your nickname").fill("newbie");
  await page
    .getByRole("button", { name: "Starter Bubble Blue" })
    .click();
  await page
    .getByRole("button", { name: "Complete onboarding" })
    .click();

  await expect(
    page.getByText("Onboarding completed. 20 XP granted. Total XP: 20."),
  ).toBeVisible();
  await expect(page.getByText("XP-first day")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open reward vault" })).toBeVisible();
});

test("runs daily check-in and shows refreshed summary state", async ({
  page,
}) => {
  await page.goto(
    `/?profileId=${activeProfileId}&walletAddress=${walletAddress}&${smokeWalletQuery}`,
  );

  await page.getByRole("button", { name: "Lock today's streak" }).click();

  await expect(page.getByText("Daily check-in complete. +20 XP. Streak: 7.")).toBeVisible();
  await expect(
    page.locator("section").first().getByText("7", { exact: true }),
  ).toBeVisible();
});

test("completes session and reveals confirmed reward outcome", async ({
  page,
}) => {
  await page.goto(
    `/session?profileId=${activeProfileId}&walletAddress=${walletAddress}`,
  );

  await page.getByRole("button", { name: "Start session" }).click();
  await page.getByRole("button", { name: "Tap bubble" }).click();
  await page.getByRole("button", { name: "Complete session" }).click();

  await expect(page.getByText("Issued rewards for this session")).toBeVisible();
  await expect(page.getByText("XP awarded")).toBeVisible();
  await expect(page.getByText("Rare access", { exact: true })).toBeVisible();
  await expect(page.getByText("Claimable token reward")).toBeVisible();
  await expect(page.getByText("genesis-spark")).toBeVisible();
  await expect(page.getByText("glossy-aura")).toBeVisible();
});

test("keeps claim UI gated when rare reward access is inactive", async ({
  page,
}) => {
  await page.goto(
    `/claim?profileId=${claimGatedProfileId}&walletAddress=${walletAddress}`,
  );

  await expect(
    page.getByRole("heading", { name: "XP-only mode" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Claim requests are blocked before submit/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Claim unavailable in XP-only mode" }),
  ).toBeDisabled();
});

test("navigates season hub, token detail, and partner transparency", async ({
  page,
}) => {
  await page.goto(
    `/?profileId=${activeProfileId}&walletAddress=${walletAddress}&${smokeWalletQuery}`,
  );

  await page.getByRole("link", { name: "Open season spotlight" }).click();
  await expect(page.getByText("Season hub")).toBeVisible();
  await expect(page.getByText("Genesis Bloom")).toBeVisible();

  await page.getByRole("link", { name: "Details" }).click();
  await page.waitForURL(/\/token\/token-bubl/);
  await expect(page.getByRole("heading", { name: "Token detail" })).toBeVisible();
  await expect(page.getByText("Bubble Bloom (BUBL)")).toBeVisible();

  await page.goto(
    `/partner-tokens?profileId=${activeProfileId}&walletAddress=${walletAddress}`,
  );
  await expect(page.getByText("Partner token transparency")).toBeVisible();
  await expect(page.getByText("Season token overview")).toBeVisible();
  await expect(page.getByText("Bubble Bloom")).toBeVisible();
});
