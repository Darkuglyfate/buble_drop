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
              paletteKey: "blue",
            },
      unlockedAvatarCount: overrides.needsOnboarding ?? false ? 0 : 2,
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
    seasonProgress: {
      qualificationStatus: overrides.qualificationStatus ?? "qualified",
      eligibleAtSeasonEnd: overrides.rareRewardAccessActive ?? true,
      streak: overrides.currentStreak ?? 6,
      xp: overrides.totalXp ?? 710,
      activeSessions: overrides.rareRewardAccessActive === false ? 2 : 5,
      requiredStreak: 5,
      requiredXp: 300,
      requiredActiveSessions: 4,
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
    styleState: {
      equippedStyle: null,
      testingOverrideActive: false,
      previewOnly: true,
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
            paletteKey: "blue",
          },
          {
            id: "avatar-starter-lilac",
            key: "starter-bubble-lilac",
            label: "Starter Bubble Lilac",
            paletteKey: "lilac",
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

    if (
      pathname === "/profile/rewards-inventory" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        json: {
          profileId: activeProfileId,
          nftCount: 2,
          cosmeticCount: 3,
          nfts: [
            {
              id: "nft-1",
              key: "genesis-spark",
              label: "Genesis Spark",
              tier: "rare",
              owned: true,
              previewOnly: true,
              acquiredAt: "2026-03-14T12:00:00.000Z",
            },
            {
              id: "nft-2",
              key: "starter-bubble-shell",
              label: "Starter Bubble Shell",
              tier: "simple",
              owned: true,
              previewOnly: true,
              acquiredAt: "2026-03-12T12:00:00.000Z",
            },
          ],
          cosmetics: [
            {
              id: "cosmetic-1",
              key: "glossy-aura",
              label: "Glossy Aura",
              owned: true,
              previewOnly: true,
              unlockedAt: "2026-03-14T12:05:00.000Z",
            },
            {
              id: "cosmetic-2",
              key: "comet-trail",
              label: "Comet Trail",
              owned: true,
              previewOnly: true,
              unlockedAt: "2026-03-14T12:06:00.000Z",
            },
            {
              id: "cosmetic-3",
              key: "founder-badge",
              label: "Founder Badge",
              owned: true,
              previewOnly: true,
              unlockedAt: "2026-03-14T12:07:00.000Z",
            },
          ],
        },
      });
      return;
    }

    if (pathname === "/profile/avatar/select" && request.method() === "POST") {
      const requestBody = (await request.postDataJSON()) as {
        profileId: string;
        avatarId: string;
      };
      await route.fulfill({
        json: {
          profileId: requestBody.profileId,
          avatarId: requestBody.avatarId,
          avatarLabel:
            requestBody.avatarId === starterAvatarId
              ? "Starter Bubble Blue"
              : "Starter Bubble Lilac",
        },
      });
      return;
    }

    if (pathname === "/profile/leaderboard" && request.method() === "GET") {
      await route.fulfill({
        json: [
          {
            rank: 1,
            profileId: activeProfileId,
            nickname: "bubblecaptain",
            totalXp: 710,
            currentStreak: 6,
          },
          {
            rank: 2,
            profileId: "20000000-0000-4000-8000-000000000002",
            nickname: "ripplepilot",
            totalXp: 680,
            currentStreak: 5,
          },
        ],
      });
      return;
    }

    if (
      pathname === "/partner-token/referral/progress" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        json: {
          inviterProfileId: activeProfileId,
          totalReferrals: 2,
          pendingReferrals: 1,
          successfulReferrals: 1,
          referrals: [
            {
              referralId: "ref-1",
              invitedWalletAddress:
                "0x2000000000000000000000000000000000000001",
              invitedProfileId: "20000000-0000-4000-8000-000000000003",
              status: "successful",
              successfulAt: "2026-03-15T10:00:00.000Z",
              createdAt: "2026-03-14T10:00:00.000Z",
            },
            {
              referralId: "ref-2",
              invitedWalletAddress:
                "0x2000000000000000000000000000000000000002",
              invitedProfileId: null,
              status: "pending",
              successfulAt: null,
              createdAt: "2026-03-16T10:00:00.000Z",
            },
          ],
        },
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
          seasonProgress: {
            qualificationStatus: "qualified",
            eligibleAtSeasonEnd: true,
            streak: 6,
            xp: 772,
            activeSessions: 5,
            requiredStreak: 5,
            requiredXp: 300,
            requiredActiveSessions: 4,
          },
          rareRewardOutcome: {
            tokenSymbolAwarded: null,
            tokenAmountAwarded: "0",
            weeklyTicketsIssued: 0,
            nftIdsAwarded: [],
            cosmeticIdsAwarded: [],
            tokenReward: null,
            nftRewards: [],
            cosmeticRewards: [],
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
  await page.addInitScript(() => {
    window.localStorage.setItem("bubbledrop:intro-seen:v2", "1");
  });
  await mockBubbleDropApi(page);
});

test("renders wallet/bootstrap entry affordances on home", async ({ page }) => {
  await page.goto(
    `/?profileId=${activeProfileId}&walletAddress=${walletAddress}&${smokeWalletQuery}&skipIntro=1`,
  );

  await expect(page.getByText("Signed in")).toBeVisible();
  await expect(page.getByText("0x1000...0001")).toBeVisible();
  await expect(page.getByText("Season chance live")).toBeVisible();
  await expect(page.getByRole("button", { name: "Daily check-in (+20 XP)", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Daily check-in (+20 XP)", exact: true })).toBeEnabled();
  await expect(page.getByRole("link", { name: "Season" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tokens" })).toBeVisible();
});

test("completes onboarding flow with mocked backend confirmation", async ({
  page,
}) => {
  await page.goto(
    `/?profileId=${onboardingProfileId}&walletAddress=${walletAddress}&${smokeWalletQuery}&skipIntro=1`,
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
    .getByRole("button", { name: "Complete onboarding" })
    .click();

  await expect(
    page.getByText("Onboarding completed. 20 XP granted. Total XP: 20."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open vault" })).toBeVisible();
});

test("runs daily check-in and shows refreshed summary state", async ({
  page,
}) => {
  await page.goto(
    `/?profileId=${activeProfileId}&walletAddress=${walletAddress}&${smokeWalletQuery}&skipIntro=1`,
  );

  await page
    .getByRole("button", { name: /Next move.*Daily check-in \(\+20 XP\)/ })
    .click();

  await expect(page.getByText("Daily check-in complete. +20 XP. Streak: 7.")).toBeVisible();
});

test("completes session and reveals confirmed season progress", async ({
  page,
}) => {
  await page.goto(
    `/session?profileId=${activeProfileId}&walletAddress=${walletAddress}&${smokeWalletQuery}`,
  );

  await page.getByRole("button", { name: "Start session" }).click();
  await page.getByRole("button", { name: "Pop bubble" }).first().click({ force: true });
  const seasonProgressUpdatedHeading = page.getByText("Season progress updated");
  const finishRunButton = page.getByRole("button", { name: "Finish run" });
  const finishRunVisible = await finishRunButton
    .waitFor({ state: "visible", timeout: 3500 })
    .then(() => true)
    .catch(() => false);
  if (finishRunVisible) {
    await finishRunButton.click();
  } else {
    const resultAlreadyVisible = await seasonProgressUpdatedHeading
      .waitFor({ state: "visible", timeout: 2200 })
      .then(() => true)
      .catch(() => false);
    if (!resultAlreadyVisible) {
      await page.getByRole("button", { name: "Complete" }).first().click({ force: true });
    }
  }

  await expect(seasonProgressUpdatedHeading).toBeVisible();
  await expect(page.getByText("XP awarded")).toBeVisible();
  await expect(page.getByText("Season chance", { exact: true })).toBeVisible();
  await expect(page.getByText("Season progress", { exact: true })).toBeVisible();
});

test("shows legacy claim flow even when season chance is still building", async ({
  page,
}) => {
  await page.goto(
    `/claim?profileId=${claimGatedProfileId}&walletAddress=${walletAddress}`,
  );

  await expect(page.getByRole("heading", { name: "Season chance building" })).toBeVisible();
  await expect(
    page.getByText(/Legacy token claims stay available/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request full claim amount" }),
  ).toBeEnabled();
});

test("navigates season hub, token detail, and partner transparency", async ({
  page,
}) => {
  await page.goto(
    `/?profileId=${activeProfileId}&walletAddress=${walletAddress}&${smokeWalletQuery}&skipIntro=1`,
  );

  await page.getByRole("link", { name: "Season" }).click();
  await expect(page.getByRole("heading", { name: "Season hub" })).toBeVisible();
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

test("supports inventory filters and preview-only collection state", async ({
  page,
}) => {
  await page.goto(
    `/inventory?profileId=${activeProfileId}&walletAddress=${walletAddress}&${smokeWalletQuery}`,
  );

  await expect(
    page.getByRole("heading", { name: "Rewards inventory" }),
  ).toBeVisible();
  await expect(page.getByText("Drop preview")).toBeVisible();

  await page.getByRole("button", { name: /Trail/ }).click();
  await expect(page.getByText("Comet Trail")).toBeVisible();
  await expect(page.getByText("Collected on this profile · Preview only").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Collected" }).first()).toBeDisabled();
  await expect(page.getByText("Preview only").first()).toBeVisible();
});

test("loads all world menu screens", async ({ page }) => {
  await page.goto(
    `/season?profileId=${activeProfileId}&walletAddress=${walletAddress}`,
  );
  await expect(page.getByRole("heading", { name: "Season hub" })).toBeVisible();

  await page.goto(
    `/leaderboard?profileId=${activeProfileId}&walletAddress=${walletAddress}`,
  );
  await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();

  await page.goto(
    `/referrals?profileId=${activeProfileId}&walletAddress=${walletAddress}`,
  );
  await expect(page.getByRole("heading", { name: "Referral progress" })).toBeVisible();

  await page.goto(
    `/partner-tokens?profileId=${activeProfileId}&walletAddress=${walletAddress}`,
  );
  await expect(
    page.getByRole("heading", { name: "Partner token transparency" }),
  ).toBeVisible();
});
