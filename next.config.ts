import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use a custom dist directory only for local development on this machine.
  // Keep production builds (including Vercel) on the default `.next`.
  ...(process.env.NODE_ENV === "development" ? { distDir: ".next_local" } : {}),
  // TypeScript build checking is ON (`typescript.ignoreBuildErrors` removed —
  // the codebase is clean and it catches real bugs).
  //
  // ESLint stays suppressed during builds FOR NOW: re-enabling it surfaced 153
  // pre-existing errors (73 are a `no-undef`-on-TS config artifact, 60 are
  // `no-explicit-any` style debt, plus unused vars / exhaustive-deps items
  // that need judgement, not a blanket fix). They are being triaged separately
  // rather than under deploy pressure. Run `npm run lint` to see the full
  // surface on demand.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
