import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Leaflet ships as CJS; @tamp/shared ships raw TS source (workspace
  // package, no build step) — both need Next to transpile them.
  transpilePackages: ["leaflet", "@tamp/shared"],
  eslint: { ignoreDuringBuilds: true },
  // Pin the workspace root — a stray parent-directory lockfile would otherwise
  // be inferred as the root.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
