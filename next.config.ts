import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use a custom dist directory only for local development on this machine.
  // Keep production builds (including Vercel) on the default `.next`.
  ...(process.env.NODE_ENV === "development" ? { distDir: ".next_local" } : {}),
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
