"use client";

import type { EIP1193Provider } from "viem";
import type { Connector } from "wagmi";

export type CoinbaseInjectedProvider = EIP1193Provider & {
  providers?: CoinbaseInjectedProvider[] | undefined;
  isCoinbaseBrowser?: true | undefined;
  isCoinbaseWallet?: true | undefined;
};

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
        baseAccountConnector ??
        coinbaseWalletConnector
      : baseAccountConnector ??
        coinbaseInjectedConnector ??
        coinbaseWalletConnector,
  };
}

export async function withFlowTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: "connect" | "sign_in",
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
  kind: "timeout" | "rejected" | "failed";
  message: string;
} {
  const message =
    error instanceof Error ? error.message : "Unknown wallet flow error";

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

  return {
    kind: "failed",
    message,
  };
}
