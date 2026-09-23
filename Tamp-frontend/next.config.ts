import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Leaflet ships as CJS and needs Next to transpile it. tamp-backend is a
  // type-only devDependency (see src/lib/trpc.ts) — its types are erased at
  // compile time, so it never reaches the runtime bundle and needs no
  // transpiling.
  transpilePackages: ["leaflet"],
  eslint: { ignoreDuringBuilds: true },
  // Pin the workspace root — a stray parent-directory lockfile would otherwise
  // be inferred as the root.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
