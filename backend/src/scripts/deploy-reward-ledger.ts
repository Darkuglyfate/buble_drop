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
  const deployer = getAccountFromAny(['REWARD_LEDGER_DEPLOYER_PRIVATE_KEY']);
  const ownerAddress = process.env.REWARD_LEDGER_OWNER_ADDRESS?.trim() || deployer.address;
  const writerAddress = process.env.REWARD_LEDGER_WRITER_ADDRESS?.trim() || deployer.address;

  if (!isAddress(ownerAddress)) {
    throw new Error('REWARD_LEDGER_OWNER_ADDRESS must be a valid address');
  }
  if (!isAddress(writerAddress)) {
    throw new Error('REWARD_LEDGER_WRITER_ADDRESS must be a valid address');
  }

  const contractPath = resolve(
    process.cwd(),
    'contracts',
    'BubbleDropRewardLedger.sol',
  );
  const source = readFileSync(contractPath, 'utf8');
  const input = {
    language: 'Solidity',
    sources: {
      'BubbleDropRewardLedger.sol': {
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
  const fatalErrors =
    compiled.errors?.filter((entry) => entry.severity === 'error') ?? [];
  if (fatalErrors.length > 0) {
    throw new Error(fatalErrors.map((entry) => entry.formattedMessage).join('\n'));
  }

  const contractArtifact =
    compiled.contracts['BubbleDropRewardLedger.sol']?.BubbleDropRewardLedger;
  if (!contractArtifact?.evm?.bytecode?.object) {
    throw new Error('Failed to compile BubbleDropRewardLedger contract');
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

  console.log('BubbleDropRewardLedger deployed successfully');
  console.log(`contractAddress: ${receipt.contractAddress}`);
  console.log(`deploymentTxHash: ${deploymentTxHash}`);
  console.log('Set backend env vars:');
  console.log('GASLESS_OWNERSHIP_ENABLED=1');
  console.log(`REWARD_LEDGER_CONTRACT_ADDRESS=${receipt.contractAddress}`);
  console.log('REWARD_LEDGER_WRITER_PRIVATE_KEY=<writer-private-key>');
  console.log(`REWARD_LEDGER_WRITER_ADDRESS=${writerAddress}`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
