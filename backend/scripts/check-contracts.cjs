const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createAddressFromString } = require('@ethereumjs/util');
const { createVM } = require('@ethereumjs/vm');
const solc = require('solc');
const {
  bytesToHex,
  decodeErrorResult,
  decodeFunctionResult,
  encodeDeployData,
  encodeFunctionData,
  hexToBytes,
  keccak256,
  toHex,
} = require('viem');

const CONTRACTS = [
  'BubbleDropRewardLedger',
  'BubbleDropSessionOutcomeRegistry',
  'DailyCheckInStreak',
];
const CALL_GAS_LIMIT = 10_000_000n;

function compileContracts() {
  const sources = Object.fromEntries(
    CONTRACTS.map((contractName) => [
      `${contractName}.sol`,
      {
        content: readFileSync(
          resolve(__dirname, '..', 'contracts', `${contractName}.sol`),
          'utf8',
        ),
      },
    ]),
  );
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      evmVersion: 'shanghai',
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object'],
        },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter(
    (entry) => entry.severity === 'error',
  );

  assert.equal(
    errors.length,
    0,
    errors.map((entry) => entry.formattedMessage).join('\n'),
  );

  return Object.fromEntries(
    CONTRACTS.map((contractName) => {
      const artifact =
        output.contracts?.[`${contractName}.sol`]?.[contractName];
      assert.ok(artifact?.abi, `${contractName} ABI was not generated`);
      assert.ok(
        artifact?.evm?.bytecode?.object,
        `${contractName} bytecode was not generated`,
      );
      return [
        contractName,
        {
          abi: artifact.abi,
          bytecode: `0x${artifact.evm.bytecode.object}`,
        },
      ];
    }),
  );
}

function createTestAddress(value) {
  const address = `0x${value.toString(16).padStart(40, '0')}`;
  return {
    address,
    evmAddress: createAddressFromString(address),
  };
}

function assertEvmSuccess(result, label) {
  assert.equal(
    result.execResult.exceptionError,
    undefined,
    `${label} reverted unexpectedly`,
  );
}

function assertEvmRevert(result, artifact, errorName, label) {
  assert.equal(
    result.execResult.exceptionError?.error,
    'revert',
    `${label} did not revert`,
  );
  const data = bytesToHex(result.execResult.returnValue);
  assert.notEqual(data, '0x', `${label} returned no custom error data`);
  const decoded = decodeErrorResult({ abi: artifact.abi, data });
  assert.equal(decoded.errorName, errorName, `${label} reverted incorrectly`);
}

async function deployContract(context, artifact, args) {
  const result = await context.vm.evm.runCall({
    caller: context.owner.evmAddress,
    data: hexToBytes(
      encodeDeployData({
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        args,
      }),
    ),
    gasLimit: CALL_GAS_LIMIT,
  });
  assertEvmSuccess(result, 'contract deployment');
  assert.ok(result.createdAddress, 'deployment did not return an address');
  return result.createdAddress;
}

async function callContract(
  context,
  artifact,
  address,
  caller,
  functionName,
  args,
  isStatic = false,
) {
  return context.vm.evm.runCall({
    caller: caller.evmAddress,
    to: address,
    data: hexToBytes(
      encodeFunctionData({
        abi: artifact.abi,
        functionName,
        args,
      }),
    ),
    gasLimit: CALL_GAS_LIMIT,
    isStatic,
  });
}

function decodeCallResult(result, artifact, functionName, label) {
  assertEvmSuccess(result, label);
  return decodeFunctionResult({
    abi: artifact.abi,
    functionName,
    data: bytesToHex(result.execResult.returnValue),
  });
}

async function checkDailyStreak(context) {
  const artifact = context.artifacts.DailyCheckInStreak;
  const address = await deployContract(context, artifact, [
    context.owner.address,
    context.writer.address,
  ]);
  const unauthorized = await callContract(
    context,
    artifact,
    address,
    context.outsider,
    'checkIn',
    [context.wallet.address, 20_000],
  );
  assertEvmRevert(
    unauthorized,
    artifact,
    'NotWriter',
    'unauthorized daily check-in',
  );

  const firstCheckIn = await callContract(
    context,
    artifact,
    address,
    context.writer,
    'checkIn',
    [context.wallet.address, 20_000],
  );
  assert.equal(
    decodeCallResult(firstCheckIn, artifact, 'checkIn', 'first daily check-in'),
    1,
  );

  const duplicate = await callContract(
    context,
    artifact,
    address,
    context.writer,
    'checkIn',
    [context.wallet.address, 20_000],
  );
  assertEvmRevert(
    duplicate,
    artifact,
    'AlreadyCheckedInForDay',
    'duplicate same-day check-in',
  );

  const secondCheckIn = await callContract(
    context,
    artifact,
    address,
    context.wallet,
    'checkIn',
    [context.wallet.address, 20_001],
  );
  assert.equal(
    decodeCallResult(
      secondCheckIn,
      artifact,
      'checkIn',
      'second daily check-in',
    ),
    2,
  );

  const stateResult = await callContract(
    context,
    artifact,
    address,
    context.owner,
    'getStreakState',
    [context.wallet.address],
    true,
  );
  const state = decodeCallResult(
    stateResult,
    artifact,
    'getStreakState',
    'streak state read',
  );
  assert.equal(Number(state[0]), 2);
  assert.equal(Number(state[1]), 20_001);
  return 2;
}

async function checkSessionRegistry(context) {
  const artifact = context.artifacts.BubbleDropSessionOutcomeRegistry;
  const address = await deployContract(context, artifact, [
    context.owner.address,
    context.writer.address,
  ]);
  const sessionIdHash = keccak256(toHex('release-session'));
  const integrityHash = keccak256(toHex('release-integrity'));
  const args = [
    sessionIdHash,
    context.wallet.address,
    25,
    1_000,
    7,
    45,
    60,
    3,
    integrityHash,
  ];

  const unauthorized = await callContract(
    context,
    artifact,
    address,
    context.outsider,
    'recordOutcome',
    args,
  );
  assertEvmRevert(
    unauthorized,
    artifact,
    'NotWriter',
    'unauthorized session outcome',
  );

  const recorded = await callContract(
    context,
    artifact,
    address,
    context.writer,
    'recordOutcome',
    args,
  );
  assertEvmSuccess(recorded, 'session outcome recording');

  const duplicate = await callContract(
    context,
    artifact,
    address,
    context.writer,
    'recordOutcome',
    args,
  );
  assertEvmRevert(
    duplicate,
    artifact,
    'OutcomeAlreadyRecorded',
    'duplicate session outcome',
  );

  const outcomeResult = await callContract(
    context,
    artifact,
    address,
    context.owner,
    'getOutcome',
    [sessionIdHash],
    true,
  );
  const latestResult = await callContract(
    context,
    artifact,
    address,
    context.owner,
    'getLatestOutcome',
    [context.wallet.address],
    true,
  );
  const outcome = decodeCallResult(
    outcomeResult,
    artifact,
    'getOutcome',
    'session outcome read',
  );
  const latest = decodeCallResult(
    latestResult,
    artifact,
    'getLatestOutcome',
    'latest session outcome read',
  );
  assert.equal(outcome[0], true);
  assert.equal(outcome[1].toLowerCase(), context.wallet.address.toLowerCase());
  assert.equal(Number(outcome[3]), 1_000);
  assert.equal(latest[0], true);
  assert.equal(latest[1], sessionIdHash);
  return 2;
}

async function checkRewardLedger(context) {
  const artifact = context.artifacts.BubbleDropRewardLedger;
  const address = await deployContract(context, artifact, [
    context.owner.address,
    context.writer.address,
  ]);
  const claimIdHash = keccak256(toHex('release-claim'));
  const symbolHash = keccak256(toHex('BUBBLE'));
  const payoutHash = keccak256(toHex('release-payout'));
  const rewardKeyHash = keccak256(toHex('release-reward'));
  const sourceIdHash = keccak256(toHex('release-source'));
  const settlementArgs = [
    claimIdHash,
    context.wallet.address,
    context.token.address,
    symbolHash,
    500n,
    payoutHash,
  ];

  const unauthorized = await callContract(
    context,
    artifact,
    address,
    context.outsider,
    'recordClaimSettlement',
    settlementArgs,
  );
  assertEvmRevert(
    unauthorized,
    artifact,
    'NotWriter',
    'unauthorized claim settlement',
  );

  const recorded = await callContract(
    context,
    artifact,
    address,
    context.writer,
    'recordClaimSettlement',
    settlementArgs,
  );
  assertEvmSuccess(recorded, 'claim settlement recording');

  const duplicate = await callContract(
    context,
    artifact,
    address,
    context.writer,
    'recordClaimSettlement',
    settlementArgs,
  );
  assertEvmRevert(
    duplicate,
    artifact,
    'ClaimAlreadyRecorded',
    'duplicate claim settlement',
  );

  const granted = await callContract(
    context,
    artifact,
    address,
    context.writer,
    'grantOwnership',
    [context.wallet.address, rewardKeyHash, 2, sourceIdHash],
  );
  assertEvmSuccess(granted, 'ownership grant');

  const settlementResult = await callContract(
    context,
    artifact,
    address,
    context.owner,
    'getClaimSettlement',
    [claimIdHash],
    true,
  );
  const ownershipResult = await callContract(
    context,
    artifact,
    address,
    context.owner,
    'hasOwnership',
    [context.wallet.address, rewardKeyHash],
    true,
  );
  const settlement = decodeCallResult(
    settlementResult,
    artifact,
    'getClaimSettlement',
    'claim settlement read',
  );
  const owned = decodeCallResult(
    ownershipResult,
    artifact,
    'hasOwnership',
    'ownership read',
  );
  assert.equal(settlement[0], true);
  assert.equal(
    settlement[1].toLowerCase(),
    context.wallet.address.toLowerCase(),
  );
  assert.equal(settlement[4], 500n);
  assert.equal(owned, true);
  return 2;
}

async function runBehaviorChecks(artifacts) {
  const context = {
    artifacts,
    vm: await createVM(),
    owner: createTestAddress(1),
    writer: createTestAddress(2),
    wallet: createTestAddress(3),
    token: createTestAddress(4),
    outsider: createTestAddress(5),
  };

  return (
    (await checkDailyStreak(context)) +
    (await checkSessionRegistry(context)) +
    (await checkRewardLedger(context))
  );
}

async function main() {
  const artifacts = compileContracts();
  console.log(`Compiled ${CONTRACTS.length} Solidity contracts offline.`);
  if (process.argv.includes('--compile-only')) {
    return;
  }
  const revertCount = await runBehaviorChecks(artifacts);
  assert.equal(revertCount, 6);
  console.log(`Verified ${revertCount} expected EVM reverts.`);
  console.log('Local-EVM behavior checks passed for all contracts.');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
