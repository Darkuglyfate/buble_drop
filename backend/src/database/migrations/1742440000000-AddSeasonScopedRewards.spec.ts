import { QueryRunner } from 'typeorm';
import { AddSeasonScopedRewards1742440000000 } from './1742440000000-AddSeasonScopedRewards';

describe('AddSeasonScopedRewards1742440000000', () => {
  it('scopes claimable balances and claims to a season without guessing ambiguous legacy rows', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((query: string) => {
        queries.push(query);
        return Promise.resolve();
      }),
    } as unknown as QueryRunner;

    await new AddSeasonScopedRewards1742440000000().up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain(
      'ALTER TABLE "claimable_token_balances" ADD "seasonId" uuid',
    );
    expect(sql).toContain('ALTER TABLE "token_claims" ADD "seasonId" uuid');
    expect(sql).toContain('HAVING COUNT(DISTINCT "seasonId") = 1');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "UQ_claimable_token_balances_profile_season_token"',
    );
    expect(sql).toContain('WHERE "seasonId" IS NOT NULL');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "UQ_claimable_token_balances_legacy_profile_token"',
    );
    expect(sql).toContain('WHERE "seasonId" IS NULL');
  });

  it('removes only known demo fixtures in foreign-key-safe order', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((query: string) => {
        queries.push(query);
        return Promise.resolve();
      }),
    } as unknown as QueryRunner;

    await new AddSeasonScopedRewards1742440000000().up(queryRunner);

    const cleanupQueries = queries.filter((query) =>
      query.trimStart().startsWith('DELETE FROM'),
    );
    const cleanupSql = cleanupQueries.join('\n');
    const expectedMarkers = [
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      'genesis-bloom',
      'testnet-waves',
      'BUBL',
      'POP',
      'genesis-spark',
      'glossy-aura',
    ];

    for (const marker of expectedMarkers) {
      expect(cleanupSql).toContain(marker);
    }
    for (const query of cleanupQueries) {
      expect(query).toMatch(/\bWHERE\b/);
    }

    const tableOrder = [
      'rare_reward_entitlements',
      'reward_events',
      'weekly_token_tickets',
      'claimable_token_balances',
      'token_claims',
      'profile_nft_ownerships',
      'profile_cosmetic_unlocks',
      'profile_avatar_unlocks',
      'qualification_states',
      'check_in_records',
      'bubble_sessions',
      'referrals',
      'profiles',
      'user_wallets',
      'nft_definitions',
      'cosmetic_definitions',
      'partner_tokens',
      'seasons',
    ];
    const cleanupIndexes = tableOrder.map((tableName) =>
      cleanupQueries.findIndex((query) =>
        query.includes(`DELETE FROM "${tableName}"`),
      ),
    );

    expect(cleanupIndexes.every((index) => index >= 0)).toBe(true);
    expect(cleanupIndexes).toEqual([...cleanupIndexes].sort((a, b) => a - b));
  });

  it('collapses qualification rows deterministically before restoring profile uniqueness', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((query: string) => {
        queries.push(query);
        return Promise.resolve();
      }),
    } as unknown as QueryRunner;

    await new AddSeasonScopedRewards1742440000000().down(queryRunner);

    const collapseIndex = queries.findIndex(
      (query) =>
        query.includes('DELETE FROM "qualification_states"') &&
        query.includes('PARTITION BY "profileId"') &&
        query.includes('ORDER BY "updatedAt" DESC, "id" DESC'),
    );
    const seasonDropIndex = queries.findIndex((query) =>
      query.includes(
        'ALTER TABLE "qualification_states" DROP COLUMN "seasonId"',
      ),
    );
    const legacyUniqueIndex = queries.findIndex((query) =>
      query.includes(
        'CREATE UNIQUE INDEX "IDX_qualification_states_profile_id"',
      ),
    );

    expect(collapseIndex).toBeGreaterThanOrEqual(0);
    expect(collapseIndex).toBeLessThan(seasonDropIndex);
    expect(collapseIndex).toBeLessThan(legacyUniqueIndex);
  });
});
