"use client";

import { QueryClient } from "@tanstack/react-query";
import { baseAccount, coinbaseWallet, injected } from "wagmi/connectors";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { base } from "wagmi/chains";
import { bubbleDropAppIdentity } from "./app-metadata";
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
      appName: bubbleDropAppIdentity.name,
    }),
    coinbaseWallet({
      appName: bubbleDropAppIdentity.name,
    }),
  ],
  storage: createStorage({ storage: cookieStorage }),
  transports: {
    [base.id]: http(),
  },
  ssr: true,
});
