// tRPC initialisation with an auth-aware context. superjson keeps Date/undefined
// fidelity across the wire.
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { logger } from "./logger";
import { prisma } from "./prisma";

export interface Context {
  partyId: string | null; // logged-in party (from the session cookie), or null
  cookieHeader: string | null;
  resHeaders: Headers; // to set/clear the session cookie
  ip: string | null; // client IP (best-effort, for rate limiting)
}

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;

// Observability: time every procedure, log failures (with code + caller) and
// slow calls. This is the single choke point for backend request telemetry.
const SLOW_MS = 1000;
const observed = t.middleware(async ({ path, type, ctx, next }) => {
  const start = Date.now();
  const res = await next();
  const ms = Date.now() - start;
  if (!res.ok) {
    logger.error("trpc_error", {
      path,
      type,
      ms,
      code: res.error.code,
      partyId: ctx.partyId,
      message: res.error.message,
    });
  } else if (ms >= SLOW_MS) {
    logger.warn("trpc_slow", { path, type, ms, partyId: ctx.partyId });
  } else {
    logger.debug("trpc_ok", { path, type, ms });
  }
  return res;
});

export const publicProcedure = t.procedure.use(observed);

// Requires an authenticated session.
export const protectedProcedure = t.procedure.use(observed).use(({ ctx, next }) => {
  if (!ctx.partyId) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, partyId: ctx.partyId } });
});

// Requires an authenticated session whose party is an ADMIN. The role is read
// from the DB (never trusted from the client) on each call.
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const me = await prisma.party.findUnique({
    where: { id: ctx.partyId },
    select: { role: true },
  });
  if (me?.role !== "ADMIN") throw new TRPCError({ code: "FORBIDDEN", message: "Admins only." });
  return next({ ctx });
});
