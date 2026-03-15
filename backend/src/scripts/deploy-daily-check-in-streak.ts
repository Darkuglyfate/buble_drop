import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Hex, createPublicClient, createWalletClient, http, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import solc from 'solc';

type SolcOutput = {
  contracts: Record<
    string,
    Record<
      string,
      {
        abi: unknown[];
        evm: {
          bytecode: {
            object: string;
          };
        };
      }
    >
  >;
  errors?: Array<{
    severity: string;
    formattedMessage: string;
  }>;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function getRpcUrl(): string {
  return process.env.BASE_RPC_URL?.trim() || 'https://mainnet.base.org';
}

function getAccountFromAny(privateKeyEnvNames: string[]) {
  const raw = privateKeyEnvNames
    .map((name) => process.env[name]?.trim())
    .find((value) => !!value);
  if (!raw) {
    throw new Error(
      `${privateKeyEnvNames.join(' or ')} is required for deployment`,
    );
  }
  const privateKey = raw.startsWith('0x') ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(
      `${privateKeyEnvNames.join(' or ')} must be a 32-byte hex private key`,
    );
  }
  return privateKeyToAccount(privateKey as Hex);
}

async function main() {
  const rpcUrl = getRpcUrl();
  const deployer = getAccountFromAny([
    'ONCHAIN_STREAK_DEPLOYER_PRIVATE_KEY',
    'ONCHAIN_STREAK_PRIVATE_KEY',
  ]);
  const ownerAddressRaw = process.env.ONCHAIN_STREAK_OWNER_ADDRESS?.trim();
  const writerAddressRaw = process.env.ONCHAIN_STREAK_WRITER_ADDRESS?.trim();
  const ownerAddress = ownerAddressRaw || deployer.address;
  const writerAddress = writerAddressRaw || deployer.address;

  if (!isAddress(ownerAddress)) {
    throw new Error('ONCHAIN_STREAK_OWNER_ADDRESS must be a valid address');
  }
  if (!isAddress(writerAddress)) {
    throw new Error('ONCHAIN_STREAK_WRITER_ADDRESS must be a valid address');
  }

  const contractPath = resolve(
    process.cwd(),
    'contracts',
    'DailyCheckInStreak.sol',
  );
  const source = readFileSync(contractPath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: {
      'DailyCheckInStreak.sol': {
        content: source,
      },
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode'],
        },
      },
    },
  };

  const compiled = JSON.parse(solc.compile(JSON.stringify(input))) as SolcOutput;
  if (compiled.errors?.length) {
    const fatalErrors = compiled.errors.filter(
      (entry) => entry.severity === 'error',
    );
    if (fatalErrors.length > 0) {
      throw new Error(fatalErrors.map((entry) => entry.formattedMessage).join('\n'));
    }
  }

  const contractArtifact =
    compiled.contracts['DailyCheckInStreak.sol']?.DailyCheckInStreak;
  if (!contractArtifact?.evm?.bytecode?.object) {
    throw new Error('Failed to compile DailyCheckInStreak contract');
  }

  const bytecode = contractArtifact.evm.bytecode.object.startsWith('0x')
    ? (contractArtifact.evm.bytecode.object as Hex)
    : (`0x${contractArtifact.evm.bytecode.object}` as Hex);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account: deployer,
    chain: base,
    transport: http(rpcUrl),
  });

  const deploymentTxHash = await walletClient.deployContract({
    abi: contractArtifact.abi,
    bytecode,
    args: [ownerAddress, writerAddress],
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: deploymentTxHash,
  });

  if (receipt.status !== 'success' || !receipt.contractAddress) {
    throw new Error(`Contract deployment failed. txHash=${deploymentTxHash}`);
  }

  console.log('DailyCheckInStreak deployed successfully');
  console.log(`network: base-mainnet (${base.id})`);
  console.log(`deployer: ${deployer.address}`);
  console.log(`owner: ${ownerAddress}`);
  console.log(`writer: ${writerAddress}`);
  console.log(`contractAddress: ${receipt.contractAddress}`);
  console.log(`deploymentTxHash: ${deploymentTxHash}`);
  console.log('\nSet backend env vars:');
  console.log('ONCHAIN_STREAK_ENABLED=1');
  console.log(`ONCHAIN_STREAK_CONTRACT_ADDRESS=${receipt.contractAddress}`);
  console.log('ONCHAIN_STREAK_PRIVATE_KEY=<single-private-key>');
  console.log('ONCHAIN_STREAK_SIGNER_PRIVATE_KEY=<writer-private-key-optional>');
  console.log(`ONCHAIN_STREAK_SIGNER_ADDRESS=${writerAddress}`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
