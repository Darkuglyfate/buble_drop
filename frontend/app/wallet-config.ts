"use client";

import { QueryClient } from "@tanstack/react-query";
import { coinbaseWallet } from "wagmi/connectors";
import { createConfig, http } from "wagmi";
import { base } from "wagmi/chains";

export const walletQueryClient = new QueryClient();

export const walletConfig = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({
      appName: "BubbleDrop",
    }),
  ],
  transports: {
    [base.id]: http(),
  },
  ssr: true,
});
