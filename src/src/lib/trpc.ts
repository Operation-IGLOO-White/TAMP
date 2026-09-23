// Vanilla tRPC client used by the thin `@/fns/*` wrappers. Those wrappers keep
// the old server-function signatures so the React Query call sites are
// unchanged after the Next.js/tRPC migration.
//
// The backend is a separate deployable (Tamp-backend), reached through a
// same-origin /api/ reverse proxy — next.config.ts's rewrites() in dev,
// nginx.conf.template's /api/ location in production — rather than an
// absolute cross-origin URL, so the session cookie's `SameSite=Lax` still
// applies. This client only ever runs in the browser (every call site is a
// "use client" component), so the relative URL always resolves.
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
// Type-only import of the backend's router shape — erased at compile time, so
// it doesn't pull backend runtime code (Prisma, Express, ...) into the
// frontend bundle. `tamp-backend` is a workspace devDependency purely for this.
import type { AppRouter } from "tamp-backend/src/root";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch: (url, options) =>
        fetch(url, { ...options, signal: options?.signal ?? null, credentials: "include" }),
    }),
  ],
});
