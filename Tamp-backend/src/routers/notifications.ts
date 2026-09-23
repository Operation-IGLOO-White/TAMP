// Server-side notification store. Rows are written on domain events (see
// server/events.ts); this router is the read/ack surface for the signed-in
// user. Replaces the old client-derived-from-audit feed.
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import { protectedProcedure, router } from "../trpc";

type Row = Prisma.NotificationGetPayload<object>;

export interface ClientNotification {
  id: string;
  type: string;
  title: string;
  detail: string;
  at: string;
  unread: boolean;
  tone: string;
  subjectType?: string;
  subjectId?: string;
}

function toClient(r: Row): ClientNotification {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    detail: r.detail,
    at: r.createdAt.toISOString(),
    unread: r.readAt === null,
    tone: r.tone,
    ...(r.subjectType ? { subjectType: r.subjectType } : {}),
    ...(r.subjectId ? { subjectId: r.subjectId } : {}),
  };
}

export const notificationsRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
    .query(async ({ input, ctx }): Promise<ClientNotification[]> => {
      const rows = await prisma.notification.findMany({
        where: { partyId: ctx.partyId },
        orderBy: { createdAt: "desc" },
        take: input?.limit ?? 50,
      });
      return rows.map(toClient);
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }): Promise<number> =>
    prisma.notification.count({ where: { partyId: ctx.partyId, readAt: null } }),
  ),

  // Mark specific notifications read, or all of them when no ids are given.
  markRead: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).optional() }).optional())
    .mutation(async ({ input, ctx }): Promise<{ updated: number }> => {
      const res = await prisma.notification.updateMany({
        where: {
          partyId: ctx.partyId,
          readAt: null,
          ...(input?.ids ? { id: { in: input.ids } } : {}),
        },
        data: { readAt: new Date() },
      });
      return { updated: res.count };
    }),
});
