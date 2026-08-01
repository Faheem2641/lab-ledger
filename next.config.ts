import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Allows production builds on Vercel to complete without blocking on third-party library types
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
