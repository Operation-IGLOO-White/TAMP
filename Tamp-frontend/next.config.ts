import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Leaflet ships as CJS; let Next transpile it for the client bundle.
  transpilePackages: ["leaflet"],
  eslint: { ignoreDuringBuilds: true },
  // Pin the workspace root — a stray parent-directory lockfile would otherwise
  // be inferred as the root.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
