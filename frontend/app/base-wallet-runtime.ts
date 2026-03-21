"use client";

import type { EIP1193Provider } from "viem";
import type { Connector } from "wagmi";
import { base } from "wagmi/chains";

export type CoinbaseInjectedProvider = EIP1193Provider & {
  providers?: CoinbaseInjectedProvider[] | undefined;
  isCoinbaseBrowser?: true | undefined;
  isCoinbaseWallet?: true | undefined;
};

export const BASE_MAINNET_CHAIN_HEX = `0x${base.id.toString(16)}` as const;

export type WalletCapabilitiesRecord = Record<string, Record<string, unknown>>;

type WalletFlowErrorKind =
  | "timeout"
  | "rejected"
  | "wrong_chain"
  | "insufficient_funds"
  | "unsupported_runtime"
  | "tx_generation_failed"
  | "failed";

type WindowWithEthereum = Window & {
  ethereum?: CoinbaseInjectedProvider;
};

export function getCoinbaseInjectedProvider(
  sourceWindow: Window | undefined = typeof window !== "undefined" ? window : undefined,
): CoinbaseInjectedProvider | undefined {
  if (!sourceWindow) {
    return undefined;
  }

  const candidates: CoinbaseInjectedProvider[] = [];

  const pushProvider = (provider: CoinbaseInjectedProvider | undefined) => {
    if (!provider || candidates.includes(provider)) {
      return;
    }

    candidates.push(provider);
    if (Array.isArray(provider.providers)) {
      for (const nestedProvider of provider.providers) {
        if (!candidates.includes(nestedProvider)) {
          candidates.push(nestedProvider);
        }
      }
    }
  };

  try {
    pushProvider((sourceWindow.top as WindowWithEthereum | undefined)?.ethereum);
  } catch {
    // Cross-origin access can fail in embedded runtimes. Fall back to local window only.
  }

  pushProvider((sourceWindow as WindowWithEthereum).ethereum);

  return candidates.find(
    (provider) => provider.isCoinbaseBrowser || provider.isCoinbaseWallet,
  );
}

export function hasCoinbaseInjectedProvider(): boolean {
  return !!getCoinbaseInjectedProvider();
}

export function normalizeWalletRpcMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const maybeError = error as {
      shortMessage?: string;
      details?: string;
      message?: string;
      cause?: unknown;
    };

    if (typeof maybeError.shortMessage === "string" && maybeError.shortMessage) {
      return maybeError.shortMessage;
    }
    if (typeof maybeError.details === "string" && maybeError.details) {
      return maybeError.details;
    }
    if (typeof maybeError.message === "string" && maybeError.message) {
      return maybeError.message;
    }
    if (maybeError.cause) {
      return normalizeWalletRpcMessage(maybeError.cause);
    }
  }

  return "Unknown wallet flow error";
}

export function isBaseChainHex(chainId: string | null | undefined): boolean {
  return chainId?.toLowerCase() === BASE_MAINNET_CHAIN_HEX;
}

export function isBaseChainId(chainId: number | null | undefined): boolean {
  return chainId === base.id;
}

export function getCapabilitiesForChain(
  capabilities: WalletCapabilitiesRecord | null | undefined,
  chainId: number = base.id,
): Record<string, unknown> | null {
  if (!capabilities || typeof capabilities !== "object") {
    return null;
  }

  const directCapabilityKeys = ["atomic", "paymasterService", "unstable_addSubAccount"];
  if (directCapabilityKeys.some((key) => key in capabilities)) {
    return capabilities as unknown as Record<string, unknown>;
  }

  return (
    capabilities[String(chainId)] ??
    capabilities[String(BASE_MAINNET_CHAIN_HEX)] ??
    null
  );
}

export function supportsWalletSendCalls(
  capabilities: WalletCapabilitiesRecord | null | undefined,
  chainId: number = base.id,
): boolean {
  const chainCapabilities = getCapabilitiesForChain(capabilities, chainId);
  return !!chainCapabilities && typeof chainCapabilities === "object";
}

export function getBubbleDropWalletConnectors(connectors: readonly Connector[]) {
  const coinbaseInjectedConnector =
    connectors.find((connector) => connector.id === "coinbaseInjected") ??
    connectors.find((connector) => connector.id === "injected") ??
    null;
  const baseAccountConnector =
    connectors.find((connector) => connector.id === "baseAccount") ?? null;
  const coinbaseWalletConnector =
    connectors.find((connector) => connector.name === "Coinbase Wallet") ??
    connectors.find((connector) => connector.id === "coinbaseWalletSDK") ??
    null;
  const injectedCoinbaseProviderAvailable = hasCoinbaseInjectedProvider();

  return {
    injectedCoinbaseProviderAvailable,
    coinbaseInjectedConnector,
    baseAccountConnector,
    coinbaseWalletConnector,
    preferredConnector: injectedCoinbaseProviderAvailable
      ? coinbaseInjectedConnector ??
        coinbaseWalletConnector ??
        baseAccountConnector
      : coinbaseWalletConnector ??
        coinbaseInjectedConnector ??
        baseAccountConnector,
  };
}

export async function withFlowTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: "connect" | "sign_in" | "daily_check_in",
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`bubbledrop-timeout:${label}`));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function classifyWalletFlowError(error: unknown): {
  kind: WalletFlowErrorKind;
  message: string;
} {
  const message = normalizeWalletRpcMessage(error);

  if (/^bubbledrop-timeout:/i.test(message)) {
    return {
      kind: "timeout",
      message,
    };
  }

  if (
    /user rejected|user denied|request rejected|rejected request|cancelled|canceled|closed modal|popup window was blocked/i.test(
      message,
    )
  ) {
    return {
      kind: "rejected",
      message,
    };
  }

  if (
    /wrong chain|chain mismatch|switch to base|wallet_switchethereumchain|wallet_addethereumchain|base mainnet|connected to the wrong chain/i.test(
      message,
    )
  ) {
    return {
      kind: "wrong_chain",
      message,
    };
  }

  if (
    /insufficient funds|insufficient balance|does not have enough eth|gas required exceeds allowance|funds for gas/i.test(
      message,
    )
  ) {
    return {
      kind: "insufficient_funds",
      message,
    };
  }

  if (
    /wallet_sendcalls|wallet_getcapabilities|method not found|method not supported|unsupported wc_|does not exist \/ is not available|feature toggled misconfigured|missing or invalid\. request\(\)|unsupported runtime|not supported in this wallet/i.test(
      message,
    )
  ) {
    return {
      kind: "unsupported_runtime",
      message,
    };
  }

  if (
    /transaction generation|could not generate|prepare the base check-in transaction|could not prepare|review request|call batch|wallet_getcallsstatus|no transaction hash/i.test(
      message,
    )
  ) {
    return {
      kind: "tx_generation_failed",
      message,
    };
  }

  return {
    kind: "failed",
    message,
  };
}
