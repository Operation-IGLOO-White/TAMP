// Vanilla tRPC client used by the thin `@/fns/*` wrappers. Those wrappers keep
// the old server-function signatures so the React Query call sites are
// unchanged after the Next.js/tRPC migration.
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/root";

function baseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env["VERCEL_URL"]) return `https://${process.env["VERCEL_URL"]}`;
  return `http://localhost:${process.env["PORT"] ?? 3000}`;
}

export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: `${baseUrl()}/api/trpc`, transformer: superjson })],
});
