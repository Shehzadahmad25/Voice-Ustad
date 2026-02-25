import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use a custom dist directory to bypass locked `.next` on this machine.
  distDir: ".next_dev"
};

export default nextConfig;
