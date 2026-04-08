import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use a custom dist directory only for local development on this machine.
  // Keep production builds (including Vercel) on the default `.next`.
  ...(process.env.NODE_ENV === "development" ? { distDir: ".next_local" } : {}),
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Prevent Next.js from bundling the Azure Speech SDK.
  // The SDK has native/binary components that must run as external Node.js modules.
  serverExternalPackages: ['microsoft-cognitiveservices-speech-sdk'],
};

export default nextConfig;
