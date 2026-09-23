import type { NextConfig } from "next";

// Where the dev-time (and next-start) /api/ proxy forwards to. In production
// behind nginx (see nginx.conf.template), nginx's own /api/ location block
// intercepts this traffic first, so this rewrite is only actually exercised
// by `next dev` and bare `next start` without nginx in front.
const BACKEND_INTERNAL_URL = process.env["BACKEND_INTERNAL_URL"] ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Standalone server output for the Docker runtime image (see Dockerfile) —
  // bundles a minimal node_modules + server.js instead of requiring a full
  // `npm install` in the runtime stage.
  output: "standalone",
  // Leaflet ships as CJS and needs Next to transpile it. tamp-backend is a
  // type-only devDependency (see src/lib/trpc.ts) — its types are erased at
  // compile time, so it never reaches the runtime bundle and needs no
  // transpiling.
  transpilePackages: ["leaflet"],
  eslint: { ignoreDuringBuilds: true },
  // Pin the workspace root — a stray parent-directory lockfile would otherwise
  // be inferred as the root.
  outputFileTracingRoot: import.meta.dirname,

  // Next's equivalent of a Vite dev proxy: forwards relative /api/* calls to
  // the backend so the frontend never needs its absolute cross-origin URL
  // client-side, and the session cookie's SameSite=Lax still applies.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_INTERNAL_URL}/api/:path*` }];
  },
};

export default nextConfig;
