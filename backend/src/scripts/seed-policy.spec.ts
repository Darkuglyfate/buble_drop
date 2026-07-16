import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import * as ts from 'typescript';

type DemoSeedModule = {
  buildDemoSeasons?: (seedNow?: Date) => Array<{
    key: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
  }>;
  seedDemoData: (options?: {
    allowProductionForTests?: boolean;
  }) => Promise<void>;
};

const scriptsDirectory = __dirname;

function readScript(fileName: string): string {
  return readFileSync(join(scriptsDirectory, fileName), 'utf8');
}

function loadDemoSeedModule(): DemoSeedModule {
  return jest.requireActual<DemoSeedModule>('./seed-demo-data');
}

function restoreNodeEnv(previousNodeEnv: string | undefined): void {
  if (previousNodeEnv === undefined) {
    delete process.env.NODE_ENV;
    return;
  }

  process.env.NODE_ENV = previousNodeEnv;
}

describe('seed policy', () => {
  it('builds the active demo season around the current UTC date', () => {
    jest.useFakeTimers().setSystemTime(new Date('2031-07-15T23:59:59.000Z'));
    const { buildDemoSeasons } = loadDemoSeedModule();

    try {
      expect(buildDemoSeasons).toEqual(expect.any(Function));
      if (!buildDemoSeasons) {
        return;
      }

      const seasons = buildDemoSeasons();
      const activeSeason = seasons.find((season) => season.isActive);
      const inactiveSeason = seasons.find((season) => !season.isActive);
      const currentUtcDate = new Date().toISOString().slice(0, 10);

      expect(seasons.map((season) => season.key)).toEqual([
        'genesis-bloom',
        'testnet-waves',
      ]);
      expect(activeSeason).toBeDefined();
      expect(activeSeason?.startDate <= currentUtcDate).toBe(true);
      expect(activeSeason?.endDate >= currentUtcDate).toBe(true);
      expect(inactiveSeason?.endDate < currentUtcDate).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('writes activeSeason.id on every season-scoped demo fixture', () => {
    const source = readScript('seed-demo-data.ts');
    const sourceFile = ts.createSourceFile(
      'seed-demo-data.ts',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const seasonScopedRepositories = new Set([
      'bubbleSessionRepository',
      'rewardEventRepository',
      'weeklyTokenTicketRepository',
      'qualificationStateRepository',
    ]);
    const writes: Array<{ repository: string; seasonId: string | null }> = [];

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'create' &&
        ts.isIdentifier(node.expression.expression) &&
        seasonScopedRepositories.has(node.expression.expression.text)
      ) {
        const repository = node.expression.expression.text;
        const fixture = node.arguments[0];
        const seasonId =
          fixture && ts.isObjectLiteralExpression(fixture)
            ? (fixture.properties
                .find(
                  (property): property is ts.PropertyAssignment =>
                    ts.isPropertyAssignment(property) &&
                    property.name.getText(sourceFile) === 'seasonId',
                )
                ?.initializer.getText(sourceFile) ?? null)
            : null;
        writes.push({ repository, seasonId });
      }

      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    expect(new Set(writes.map((write) => write.repository))).toEqual(
      seasonScopedRepositories,
    );
    expect(
      writes.filter((write) => write.seasonId !== 'activeSeason.id'),
    ).toEqual([]);
  });

  it('fails before demo progress writes when no active season was persisted', () => {
    const source = readScript('seed-demo-data.ts');
    const activeSeasonResolution = source.indexOf(
      'const activeSeason = seasons.find((season) => season.isActive) ?? null;',
    );
    const activeSeasonGuard = source.indexOf('if (!activeSeason)');
    const firstDemoIdentityWrite = source.indexOf(
      'for (const walletSeed of DEMO_WALLETS)',
    );

    expect(activeSeasonResolution).toBeGreaterThanOrEqual(0);
    expect(activeSeasonGuard).toBeGreaterThan(activeSeasonResolution);
    expect(activeSeasonGuard).toBeLessThan(firstDemoIdentityWrite);
    expect(source).toContain('Active demo season was not persisted.');
    expect(source).not.toContain('activeSeason?.id ?? null');
  });

  it('keeps the production reference seed limited to rank frames and starter avatars', () => {
    const source = readScript('seed-reference-data.ts');
    const forbiddenTerms = [
      'Season',
      'PartnerToken',
      'NftDefinition',
      'CosmeticDefinition',
      'UserWallet',
      'Profile',
      'Referral',
      'BubbleSession',
      'CheckInRecord',
      'QualificationState',
      'RewardEvent',
      'WeeklyTokenTicket',
      'ClaimableTokenBalance',
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
    ];

    expect(source).toContain('RankFrameDefinition');
    expect(source).toContain('Avatar');
    for (const forbiddenTerm of forbiddenTerms) {
      expect(source).not.toContain(forbiddenTerm);
    }
  });

  it('provides a separate demo seed command while keeping production bootstrap safe', () => {
    const packageJson = JSON.parse(
      readFileSync(join(scriptsDirectory, '..', '..', 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts['seed:demo']).toBe(
      'ts-node -r tsconfig-paths/register src/scripts/seed-demo-data.ts',
    );
    expect(packageJson.scripts['db:bootstrap:local']).toContain('seed:demo');
    expect(packageJson.scripts['seed:reference-data']).toContain(
      'seed-reference-data.ts',
    );
  });

  it('rejects production before opening the Nest application context', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const nestFactory = jest.mocked(NestFactory);
    const demoSeedModule = loadDemoSeedModule();

    try {
      await expect(demoSeedModule.seedDemoData()).rejects.toThrow(
        'Demo data seeding is disabled in production.',
      );
      expect(nestFactory.createApplicationContext.mock.calls).toHaveLength(0);
    } finally {
      restoreNodeEnv(previousNodeEnv);
    }
  });

  it('allows an explicit test-only production override', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const nestFactory = jest.mocked(NestFactory);
    nestFactory.createApplicationContext.mockRejectedValueOnce(
      new Error('context attempted'),
    );
    const demoSeedModule = loadDemoSeedModule();

    try {
      await expect(
        demoSeedModule.seedDemoData({ allowProductionForTests: true }),
      ).rejects.toThrow('context attempted');
      expect(nestFactory.createApplicationContext.mock.calls).toHaveLength(1);
    } finally {
      restoreNodeEnv(previousNodeEnv);
    }
  });
});

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    createApplicationContext: jest.fn(),
  },
}));
