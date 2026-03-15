"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect } from "react";
import { WagmiProvider } from "wagmi";
import { initAnalytics } from "./analytics";
import { walletConfig, walletQueryClient } from "./wallet-config";

function AnalyticsBootstrap() {
  useEffect(() => {
    initAnalytics();
  }, []);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={walletConfig}>
      <QueryClientProvider client={walletQueryClient}>
        <AnalyticsBootstrap />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
