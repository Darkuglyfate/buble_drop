"use client";

import type { ReactNode } from "react";

type ScreenLayoutProps = {
  children: ReactNode;
};

export function ScreenLayout({ children }: ScreenLayoutProps) {
  return (
    <div className="relative min-h-screen px-4 py-6 sm:px-6">
      <div className="floating-bubbles">
        <span className="bubble b1" />
        <span className="bubble b2" />
        <span className="bubble b3" />
        <span className="bubble b4" />
      </div>
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-col gap-4">
        {children}
      </main>
    </div>
  );
}
