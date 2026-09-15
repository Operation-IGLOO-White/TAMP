// Outbound-webhook management: a party registers an HTTPS endpoint and the
// events it wants. The scheduler (server/scheduler.ts) drains pending deliveries
// with an HMAC-SHA256 signature and exponential backoff. This is the integration
// surface for a cargo owner's or carrier's own systems.
import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "../prisma";
import { adminProcedure, router } from "../trpc";

export const WEBHOOK_EVENTS = [
  "MATCH_ACCEPTED",
  "ENGAGEMENT_CONFIRMED",
  "TRIP_STATUS_CHANGED",
  "LOAD_DELIVERED",
  "MATCH_EXPIRED",
  "VERIFICATION_CHANGED",
] as const;

const wid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString("hex").toUpperCase()}`;

// Show only the last 4 chars so the UI can display which secret is set without
// re-exposing it; the full value is returned exactly once, at creation.
const maskSecret = (s: string) => `whsec_…${s.slice(-4)}`;

export const webhooksRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const rows = await prisma.webhookEndpoint.findMany({
      where: { partyId: ctx.partyId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((e) => ({
      id: e.id,
      url: e.url,
      events: (Array.isArray(e.events) ? e.events : []) as string[],
      active: e.active,
      secretHint: maskSecret(e.secret),
      createdAt: e.createdAt.toISOString(),
    }));
  }),

  create: adminProcedure
    .input(
      z.object({
        url: z.string().url().refine((u) => u.startsWith("https://"), "Endpoint must be HTTPS."),
        events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).or(z.tuple([z.literal("*")])),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const count = await prisma.webhookEndpoint.count({ where: { partyId: ctx.partyId } });
      if (count >= 20) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Endpoint limit reached (20)." });
      }
      const secret = `whsec_${randomBytes(24).toString("hex")}`;
      const row = await prisma.webhookEndpoint.create({
        data: {
          id: wid("WH"),
          partyId: ctx.partyId,
          url: input.url,
          secret,
          events: input.events as string[],
          active: true,
        },
      });
      // The plaintext secret is returned ONCE — the caller must store it to
      // verify signatures. Afterwards only the masked hint is available.
      return { id: row.id, url: row.url, events: input.events as string[], secret };
    }),

  setActive: adminProcedure
    .input(z.object({ id: z.string(), active: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const owned = await prisma.webhookEndpoint.findFirst({
        where: { id: input.id, partyId: ctx.partyId },
      });
      if (!owned) throw new TRPCError({ code: "NOT_FOUND" });
      await prisma.webhookEndpoint.update({ where: { id: input.id }, data: { active: input.active } });
      return { ok: true as const };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const owned = await prisma.webhookEndpoint.findFirst({
        where: { id: input.id, partyId: ctx.partyId },
      });
      if (!owned) throw new TRPCError({ code: "NOT_FOUND" });
      await prisma.$transaction([
        prisma.webhookDelivery.deleteMany({ where: { endpointId: input.id } }),
        prisma.webhookEndpoint.delete({ where: { id: input.id } }),
      ]);
      return { ok: true as const };
    }),

  // Recent delivery attempts across the caller's endpoints — the debugging view.
  deliveries: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(30) }).optional())
    .query(async ({ input, ctx }) => {
      const endpoints = await prisma.webhookEndpoint.findMany({
        where: { partyId: ctx.partyId },
        select: { id: true },
      });
      const ids = endpoints.map((e) => e.id);
      if (!ids.length) return [];
      const rows = await prisma.webhookDelivery.findMany({
        where: { endpointId: { in: ids } },
        orderBy: { createdAt: "desc" },
        take: input?.limit ?? 30,
      });
      return rows.map((d) => ({
        id: d.id,
        endpointId: d.endpointId,
        event: d.event,
        status: d.status,
        attempts: d.attempts,
        responseCode: d.responseCode,
        lastError: d.lastError,
        createdAt: d.createdAt.toISOString(),
      }));
    }),
});
