import { QueryRunner } from 'typeorm';
import { AddCheckInFinalityState1742410000000 } from './1742410000000-AddCheckInFinalityState';

describe('AddCheckInFinalityState1742410000000', () => {
  it('removes orphaned records before recreating the legacy daily unique index', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (query: string) => {
        queries.push(query);
      }),
    } as unknown as QueryRunner;

    await new AddCheckInFinalityState1742410000000().down(queryRunner);

    const orphanCleanupIndex = queries.findIndex((query) =>
      query.includes(
        `DELETE FROM "check_in_records" WHERE "status" = 'orphaned'`,
      ),
    );
    const legacyIndexCreationIndex = queries.findIndex((query) =>
      query.includes('CREATE UNIQUE INDEX "IDX_check_in_records_profile_date"'),
    );

    expect(orphanCleanupIndex).toBeGreaterThanOrEqual(0);
    expect(orphanCleanupIndex).toBeLessThan(legacyIndexCreationIndex);
  });
});
