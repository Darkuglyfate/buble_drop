"use client";

import { QueryClient } from "@tanstack/react-query";
import { baseAccount, coinbaseWallet } from "wagmi/connectors";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { base } from "wagmi/chains";

export const walletQueryClient = new QueryClient();

export const walletConfig = createConfig({
  chains: [base],
  connectors: [
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
