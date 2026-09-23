// Vanilla tRPC client used by the thin `@/fns/*` wrappers. Those wrappers keep
// the old server-function signatures so the React Query call sites are
// unchanged after the Next.js/tRPC migration.
//
// The backend is now a separate deployable (Tamp-backend), so every request is
// cross-origin: NEXT_PUBLIC_BACKEND_URL points at it, and `credentials:
// "include"` is required for the session cookie to be sent/received. Keep
// frontend and backend on the same registrable domain (e.g. app.example.com /
// api.example.com) in production so the cookie's `SameSite=Lax` still applies.
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
// Type-only import of the backend's router shape — erased at compile time, so
// it doesn't pull backend runtime code (Prisma, Express, ...) into the
// frontend bundle. `tamp-backend` is a workspace devDependency purely for this.
import type { AppRouter } from "tamp-backend/src/root";

function baseUrl() {
  return process.env["NEXT_PUBLIC_BACKEND_URL"] ?? "http://localhost:4000";
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${baseUrl()}/api/trpc`,
      transformer: superjson,
      fetch: (url, options) =>
        fetch(url, { ...options, signal: options?.signal ?? null, credentials: "include" }),
    }),
  ],
});
