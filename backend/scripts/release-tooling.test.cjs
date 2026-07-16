const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { execFileSync } = childProcess;
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');

const backendRoot = resolve(__dirname, '..');
const repositoryRoot = resolve(backendRoot, '..');
const frontendRoot = resolve(repositoryRoot, 'frontend');
const releaseRunnerPath = resolve(
  repositoryRoot,
  'scripts',
  'release-check.cjs',
);

const originalSpawnSync = childProcess.spawnSync;
childProcess.spawnSync = () => ({ status: 0 });
let runReleaseChecks;
try {
  ({ runReleaseChecks } = require(releaseRunnerPath));
} finally {
  childProcess.spawnSync = originalSpawnSync;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('backend release checks are non-mutating and include contract verification', () => {
  const packageJson = readJson(resolve(backendRoot, 'package.json'));
  const lintCheck = packageJson.scripts['lint:check'];
  const releaseCheck = packageJson.scripts['release:check'];

  assert.equal(typeof lintCheck, 'string');
  assert.doesNotMatch(lintCheck, /--fix\b/);
  assert.match(releaseCheck, /lint:check/);
  assert.match(releaseCheck, /contracts:check/);
});

test('offline contract harness uses EthereumJS VM without Ganache or deployment credentials', () => {
  const packageJson = readJson(resolve(backendRoot, 'package.json'));
  const packageLock = readJson(resolve(backendRoot, 'package-lock.json'));
  const harnessPath = resolve(backendRoot, 'scripts', 'check-contracts.cjs');
  const harness = readFileSync(harnessPath, 'utf8');

  for (const contractName of [
    'BubbleDropRewardLedger',
    'BubbleDropSessionOutcomeRegistry',
    'DailyCheckInStreak',
  ]) {
    assert.match(harness, new RegExp(contractName));
  }

  assert.equal(packageJson.devDependencies['@ethereumjs/vm'], '10.1.2');
  assert.equal(packageJson.devDependencies.ganache, undefined);
  assert.equal(
    packageLock.packages['node_modules/@ethereumjs/vm'].version,
    '10.1.2',
  );
  assert.equal(
    Object.keys(packageLock.packages).some((path) =>
      path.startsWith('node_modules/ganache'),
    ),
    false,
  );
  assert.match(harness, /@ethereumjs\/vm/);
  assert.match(harness, /createVM/);
  assert.match(harness, /evm\.runCall/);
  assert.doesNotMatch(
    harness,
    /ganache|createPublicClient|createWalletClient|PRIVATE_KEY|privateKey|process\.env/,
  );
});

test('contract harness verifies six authorization and duplicate reverts in the EVM', () => {
  const output = execFileSync(
    process.execPath,
    [resolve(backendRoot, 'scripts', 'check-contracts.cjs')],
    {
      cwd: backendRoot,
      encoding: 'utf8',
    },
  );

  assert.match(output, /Verified 6 expected EVM reverts\./);
});

test('production Playwright config builds Next and retains the real mock backend', () => {
  const packageJson = readJson(resolve(frontendRoot, 'package.json'));
  const configPath = resolve(frontendRoot, 'playwright.production.config.ts');
  const config = readFileSync(configPath, 'utf8');

  assert.match(
    packageJson.scripts['smoke:production'],
    /playwright\.production\.config\.ts/,
  );
  assert.match(config, /node smoke\/mock-backend\.mjs/);
  assert.match(config, /next build/);
  assert.match(config, /next start/);
  assert.match(config, /BACKEND_URL:\s*["']http:\/\/127\.0\.0\.1:4010["']/);
  assert.match(config, /grep:\s*\/@security\//);
  assert.doesNotMatch(config, /NEXT_PUBLIC_SMOKE_TEST_MODE/);
});

test('repository release command and rollout checklist document aggregate checks', () => {
  const checklistPath = resolve(
    repositoryRoot,
    'PRODUCTION_ROLLOUT_CHECKLIST.md',
  );
  const frontendChecklistPath = resolve(
    frontendRoot,
    'PRODUCTION_ENV_CHECKLIST.md',
  );
  const backendReadmePath = resolve(backendRoot, 'README.md');
  const runner = readFileSync(releaseRunnerPath, 'utf8');
  const checklist = readFileSync(checklistPath, 'utf8');
  const frontendChecklist = readFileSync(frontendChecklistPath, 'utf8');
  const backendReadme = readFileSync(backendReadmePath, 'utf8');

  assert.match(runner, /backend/);
  assert.match(runner, /frontend/);
  assert.match(runner, /release:check/);
  assert.match(checklist, /node scripts\/release-check\.cjs/);
  assert.match(checklist, /npm run contracts:check/);
  assert.match(checklist, /npm run smoke:production/);
  assert.match(checklist, /npm --prefix backend ci/);
  assert.match(checklist, /npm --prefix frontend ci/);
  assert.doesNotMatch(checklist, /npm install/);
  assert.doesNotMatch(backendReadme, /# build command\r?\nnpm install/);
  assert.match(backendReadme, /# build command\r?\nnpm ci/);
  assert.doesNotMatch(checklist, /RUN_MIGRATIONS_ON_START/);
  assert.doesNotMatch(checklist, /npm run db:migration:run/);
  assert.match(checklist, /npm run start:prod/);
  assert.match(
    checklist,
    /Required Frontend Env Variables[\s\S]*FRONTEND_ORIGIN=/,
  );
  assert.match(
    frontendChecklist,
    /Set these on the deployed Next\.js app:[\s\S]*FRONTEND_ORIGIN=/,
  );
  assert.doesNotMatch(
    `${checklist}\n${frontendChecklist}`,
    /NEXT_PUBLIC_BACKEND_URL/,
  );
  assert.doesNotMatch(checklist, /npm run lint(?:\r?\n|$)/);
  assert.match(checklist, /EthereumJS VM/);
  assert.match(frontendChecklist, /EthereumJS VM/);
  assert.doesNotMatch(`${checklist}\n${frontendChecklist}`, /Ganache/i);
});

test('aggregate runner stops after a backend failure and propagates its code', () => {
  const workspaces = [];
  const exitCode = runReleaseChecks((workspace) => {
    workspaces.push(workspace);
    return { status: 7 };
  });

  assert.equal(exitCode, 7);
  assert.deepEqual(workspaces, ['backend']);
});

test('aggregate runner propagates a frontend failure after backend success', () => {
  const workspaces = [];
  const exitCode = runReleaseChecks((workspace) => {
    workspaces.push(workspace);
    return { status: workspace === 'backend' ? 0 : 9 };
  });

  assert.equal(exitCode, 9);
  assert.deepEqual(workspaces, ['backend', 'frontend']);
});

test('aggregate runner returns zero after both workspaces succeed', () => {
  const workspaces = [];
  const exitCode = runReleaseChecks((workspace) => {
    workspaces.push(workspace);
    return { status: 0 };
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(workspaces, ['backend', 'frontend']);
});
