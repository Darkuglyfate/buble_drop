import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_SMOKE_TEST_SERVER === "1" ? ".next-smoke" : ".next",
};

export default nextConfig;
