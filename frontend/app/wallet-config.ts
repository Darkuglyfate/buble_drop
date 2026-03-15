"use client";

import { QueryClient } from "@tanstack/react-query";
import { baseAccount, coinbaseWallet, injected } from "wagmi/connectors";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { base } from "wagmi/chains";
import { getCoinbaseInjectedProvider } from "./base-wallet-runtime";

export const walletQueryClient = new QueryClient();

export const walletConfig = createConfig({
  chains: [base],
  connectors: [
    injected({
      shimDisconnect: true,
      target: {
        id: "coinbaseInjected",
        name: "Coinbase Wallet",
        provider(sourceWindow) {
          return getCoinbaseInjectedProvider(
            sourceWindow as unknown as Window | undefined,
          );
        },
      },
    }),
    baseAccount({
      appName: "BubbleDrop",
    }),
    coinbaseWallet({
      appName: "BubbleDrop",
    }),
  ],
  storage: createStorage({ storage: cookieStorage }),
  transports: {
    [base.id]: http(),
  },
  ssr: true,
});
