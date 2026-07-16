import { QueryRunner } from 'typeorm';
import { AddUnknownPayoutState1742420000000 } from '../../database/migrations/1742420000000-AddUnknownPayoutState';

describe('AddUnknownPayoutState1742420000000', () => {
  it('does not use the newly added unknown enum value in the active-claim index predicate', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn().mockImplementation((query: string) => {
        queries.push(query);
        return Promise.resolve();
      }),
    } as unknown as QueryRunner;

    await new AddUnknownPayoutState1742420000000().up(queryRunner);

    const activeClaimIndexQuery = queries.find((query) =>
      query.includes(
        'CREATE UNIQUE INDEX "IDX_token_claims_one_pending_per_profile_token"',
      ),
    );
    expect(activeClaimIndexQuery).toContain(`"status" <> 'confirmed'`);
    expect(activeClaimIndexQuery).not.toContain(`'unknown'`);
    expect(queries.join('\n')).toContain(
      'ALTER TABLE "token_claims" ADD "serializedPayoutTransaction" text',
    );
    expect(queries.join('\n')).toContain(
      'CREATE INDEX "IDX_token_claims_payout_sender_nonce"',
    );
  });

  it('blocks rollback before removing recovery state when unknown payouts exist', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn().mockImplementation((query: string) => {
        queries.push(query);
        return Promise.resolve();
      }),
    } as unknown as QueryRunner;

    await new AddUnknownPayoutState1742420000000().down(queryRunner);

    const rollbackGuardIndex = queries.findIndex(
      (query) =>
        query.includes('RAISE EXCEPTION') &&
        query.includes('WHERE "status" = \'unknown\''),
    );
    const rawDropIndex = queries.findIndex((query) =>
      query.includes('DROP COLUMN "serializedPayoutTransaction"'),
    );
    const advisoryLockIndex = queries.findIndex((query) =>
      query.includes('pg_advisory_xact_lock(174245001)'),
    );
    const tableLockIndex = queries.findIndex((query) =>
      query.includes('LOCK TABLE "token_claims" IN ACCESS EXCLUSIVE MODE'),
    );
    expect(advisoryLockIndex).toBeGreaterThanOrEqual(0);
    expect(tableLockIndex).toBeGreaterThan(advisoryLockIndex);
    expect(rollbackGuardIndex).toBeGreaterThan(tableLockIndex);
    expect(rollbackGuardIndex).toBeGreaterThanOrEqual(0);
    expect(rollbackGuardIndex).toBeLessThan(rawDropIndex);
  });
});
