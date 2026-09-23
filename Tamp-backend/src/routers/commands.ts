// Authoritative domain commands. Unlike snapshot.sync (which persists
// client-computed state and only validates it), these mutations COMPUTE the
// transition on the server from authoritative DB state and write it atomically.
// The client calls the command and re-hydrates — it no longer decides the
// outcome. This is the migration path away from a client-authoritative store.
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Acceptance, AuditEvent, Match, Proof, Role, Trip } from "@/lib/tamp-types";
import { emitEvent, type NotificationSpec } from "../events";
import { prisma } from "../prisma";
import { protectedProcedure, router } from "../trpc";
import { J, loadRow, matchRow, readAll, tripRow } from "./snapshot";

// Trip lifecycle order (server-owned copy — no client import).
const TRIP_PROGRESSION = [
  "SCHEDULED",
  "AT_PICKUP",
  "LOADED",
  "IN_TRANSIT",
  "AT_DROPOFF",
  "DELIVERED",
] as const;

const srvId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString("hex").toUpperCase()}`;

// Sealed digital-acceptance receipt (mirrors the client's makeAcceptance).
function makeAcceptance(
  matchId: string,
  loadId: string,
  party: Acceptance["party"],
  byUserId: string,
  ip: string,
): Acceptance {
  const at = new Date().toISOString();
  const userAgent = "TAMP/server";
  const id = srvId("AC");
  const payload = `${id}|${matchId}|${loadId}|${party}|${byUserId}|${ip}|${userAgent}|${at}`;
  return {
    id,
    matchId,
    loadId,
    party,
    byUserId,
    ip,
    userAgent,
    at,
    hash: createHash("sha256").update(payload).digest("hex"),
  };
}

function makeAudit(
  eventType: keyof typeof EVT,
  actorId: string,
  actorRole: Role | "SYSTEM",
  subjectType: AuditEvent["subjectType"],
  subjectId: string,
  summary: string,
): AuditEvent {
  return {
    id: srvId("EV"),
    eventType,
    eventId: EVT[eventType],
    actorId,
    actorRole,
    subjectType,
    subjectId,
    summary,
    at: new Date().toISOString(),
  };
}

const EVT = {
  MATCH_ACCEPTED: "EVT-21",
  ENGAGEMENT_CONFIRMED: "EVT-23",
  TRIP_STATUS_CHANGED: "EVT-32",
} as const;

const newTrip = (matchId: string, byUserId: string): Trip => {
  const at = new Date().toISOString();
  return {
    id: srvId("TP"),
    matchId,
    status: "SCHEDULED",
    disputed: false,
    events: [{ status: "SCHEDULED", at, byUserId }],
    simulatedPosition: null,
    progressPct: 0,
    etaAt: null,
  };
};

const blobUpsert = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: { upsert: (a: any) => Prisma.PrismaPromise<unknown> },
  row: { id: string },
) => model.upsert({ where: { id: row.id }, create: { id: row.id, data: J(row) }, update: { data: J(row) } });

export const commandsRouter = router({
  // Advance a trip one step along its lifecycle. The server picks the next
  // status, enforces a driver + Proof-of-Delivery, and on delivery completes the
  // load and frees the truck — all in one transaction.
  advanceTrip: protectedProcedure
    .input(
      z.object({
        loadId: z.string(),
        proof: z
          .object({
            recipientName: z.string().min(1),
            signature: z.string().optional(),
            photoName: z.string().optional(),
            photoUrl: z.string().optional(),
            note: z.string().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const all = await readAll();
      const me = all.parties.find((p) => p.id === ctx.partyId);
      if (!me) throw new TRPCError({ code: "UNAUTHORIZED" });
      const isAdmin = me.role === "ADMIN";

      const match = all.matches.find(
        (m) => m.loadId === input.loadId && (m.status === "CONFIRMED" || m.status === "ACCEPTED"),
      );
      if (!match) throw new TRPCError({ code: "NOT_FOUND", message: "No active engagement for this load." });
      const trip = all.trips.find((t) => t.matchId === match.id);
      if (!trip) throw new TRPCError({ code: "NOT_FOUND", message: "No trip for this load." });
      const truck = all.trucks.find((t) => t.id === match.truckPostingId);
      if (!truck) throw new TRPCError({ code: "NOT_FOUND", message: "Truck not found." });

      // Authorisation: only the truck's driver or owner (or an admin) may advance.
      if (!isAdmin && truck.driverId !== me.id && truck.transporterId !== me.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This isn't your trip to advance." });
      }
      if (!truck.driverId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Assign a driver before starting the trip." });
      }

      const idx = TRIP_PROGRESSION.indexOf(trip.status as (typeof TRIP_PROGRESSION)[number]);
      if (idx < 0 || idx >= TRIP_PROGRESSION.length - 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This trip is already complete." });
      }
      const nextStatus = TRIP_PROGRESSION[idx + 1]!;
      const progressPct = Math.round(((idx + 1) / (TRIP_PROGRESSION.length - 1)) * 100);
      const delivered = nextStatus === "DELIVERED";
      const now = new Date().toISOString();

      // Delivery requires a Proof of Delivery — either already on file or supplied
      // with this command (captured + delivered atomically).
      const existingProof = all.proofs.find((p) => p.tripId === trip.id);
      let newProof: Proof | null = null;
      if (delivered && !existingProof) {
        if (!input.proof) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Proof of delivery is required to deliver." });
        }
        newProof = {
          id: srvId("PR"),
          tripId: trip.id,
          loadId: input.loadId,
          recipientName: input.proof.recipientName,
          signature: input.proof.signature,
          photoName: input.proof.photoName,
          photoUrl: input.proof.photoUrl,
          note: input.proof.note,
          capturedAt: now,
        };
      }

      const updatedTrip: Trip = {
        ...trip,
        status: nextStatus,
        progressPct,
        events: [...trip.events, { status: nextStatus, at: now, byUserId: me.id }],
      };
      const audit: AuditEvent = {
        id: srvId("EV"),
        eventType: "TRIP_STATUS_CHANGED",
        eventId: "EVT-32",
        actorId: me.id,
        actorRole: me.role,
        subjectType: "TRIP",
        subjectId: trip.id,
        summary: `${trip.id} moved to ${nextStatus}.`,
        at: now,
      };

      const ops: Prisma.PrismaPromise<unknown>[] = [
        prisma.trip.upsert({ where: { id: trip.id }, create: tripRow(updatedTrip), update: tripRow(updatedTrip) }),
        prisma.auditEvent.upsert({ where: { id: audit.id }, create: { id: audit.id, data: J(audit) }, update: { data: J(audit) } }),
      ];
      if (newProof) {
        ops.push(
          prisma.proof.upsert({ where: { id: newProof.id }, create: { id: newProof.id, data: J(newProof) }, update: { data: J(newProof) } }),
        );
      }
      if (delivered) {
        const load = all.loads.find((l) => l.id === input.loadId);
        if (load) {
          const done = { ...load, status: "COMPLETED" as const };
          ops.push(prisma.load.upsert({ where: { id: load.id }, create: loadRow(done), update: loadRow(done) }));
        }
        const freed = { ...truck, status: "AVAILABLE" as const };
        ops.push(
          prisma.truck.upsert({ where: { id: truck.id }, create: { id: truck.id, data: J(freed) }, update: { data: J(freed) } }),
        );
      }

      await prisma.$transaction(ops);

      // Notify the load owner and carrier (not the driver who acted); emit a
      // webhook to any of their subscribed endpoints.
      const ownerId = all.loads.find((l) => l.id === input.loadId)?.ownerId;
      const audience = [ownerId, truck.transporterId].filter(
        (id): id is string => !!id && id !== me.id,
      );
      const recips: NotificationSpec[] = audience.map((partyId) => ({
        partyId,
        title: delivered ? "Load delivered" : "Trip update",
        detail: delivered
          ? `${input.loadId} was delivered (POD captured).`
          : `${input.loadId} is now ${nextStatus.replace(/_/g, " ").toLowerCase()}.`,
        tone: delivered ? "positive" : "info",
        subjectType: "TRIP",
        subjectId: trip.id,
      }));
      await emitEvent({
        event: delivered ? "LOAD_DELIVERED" : "TRIP_STATUS_CHANGED",
        notifications: recips,
        webhook: {
          data: { loadId: input.loadId, tripId: trip.id, status: nextStatus, progressPct },
          involvedPartyIds: [ownerId, truck.transporterId, truck.driverId].filter(
            (id): id is string => !!id,
          ),
        },
      });
      return { ok: true as const, status: nextStatus, progressPct };
    }),

  // The OWNER accepts a suggested match → ACCEPTED (awaits carrier confirmation).
  acceptMatch: protectedProcedure
    .input(z.object({ loadId: z.string(), truckId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const all = await readAll();
      const me = all.parties.find((p) => p.id === ctx.partyId);
      if (!me) throw new TRPCError({ code: "UNAUTHORIZED" });
      const load = all.loads.find((l) => l.id === input.loadId);
      if (!load) throw new TRPCError({ code: "NOT_FOUND", message: "Load not found." });
      if (me.role !== "ADMIN" && load.ownerId !== me.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the load owner can accept a match." });
      }
      const match =
        all.matches.find(
          (m) => m.loadId === input.loadId && m.truckPostingId === input.truckId && m.status === "SUGGESTED",
        ) ??
        all.matches
          .filter((m) => m.loadId === input.loadId && m.status === "SUGGESTED")
          .sort((a, b) => b.score - a.score)[0];
      if (!match) throw new TRPCError({ code: "NOT_FOUND", message: "No suggested match to accept." });

      const acc = makeAcceptance(match.id, match.loadId, "FREIGHT_OWNER", me.id, ctx.ip ?? "0.0.0.0");
      const updatedMatch: Match = { ...match, status: "ACCEPTED", confirmedByOwnerAt: acc.at };
      const updatedLoad = { ...load, status: "MATCHED" as const };
      const audit = makeAudit(
        "MATCH_ACCEPTED",
        me.id,
        me.role,
        "MATCH",
        match.id,
        `${input.loadId} accepted (truck ${match.truckPostingId}). Awaiting carrier confirmation.`,
      );
      await prisma.$transaction([
        prisma.match.upsert({ where: { id: match.id }, create: matchRow(updatedMatch), update: matchRow(updatedMatch) }),
        prisma.load.upsert({ where: { id: load.id }, create: loadRow(updatedLoad), update: loadRow(updatedLoad) }),
        blobUpsert(prisma.acceptance, acc),
        blobUpsert(prisma.auditEvent, audit),
      ]);

      // The carrier now needs to confirm — notify them (and the driver).
      const acceptedTruck = all.trucks.find((t) => t.id === match.truckPostingId);
      const carrierId = acceptedTruck?.transporterId;
      await emitEvent({
        event: "MATCH_ACCEPTED",
        notifications: [carrierId, acceptedTruck?.driverId]
          .filter((id): id is string => !!id && id !== me.id)
          .map((partyId) => ({
            partyId,
            title: "Match accepted",
            detail: `${input.loadId} was accepted — confirm to schedule the trip.`,
            tone: "positive" as const,
            subjectType: "MATCH",
            subjectId: match.id,
          })),
        webhook: {
          data: { loadId: input.loadId, matchId: match.id, truckId: match.truckPostingId, status: "ACCEPTED" },
          involvedPartyIds: [load.ownerId, carrierId].filter((id): id is string => !!id),
        },
      });
      return { ok: true as const };
    }),

  // The CARRIER confirms the owner's ACCEPTED match → CONFIRMED + scheduled trip.
  confirmMatch: protectedProcedure
    .input(z.object({ loadId: z.string(), truckId: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const all = await readAll();
      const me = all.parties.find((p) => p.id === ctx.partyId);
      if (!me) throw new TRPCError({ code: "UNAUTHORIZED" });
      const match = all.matches.find(
        (m) =>
          m.loadId === input.loadId &&
          m.status === "ACCEPTED" &&
          (input.truckId ? m.truckPostingId === input.truckId : true),
      );
      if (!match) throw new TRPCError({ code: "NOT_FOUND", message: "No accepted match to confirm." });
      const truck = all.trucks.find((t) => t.id === match.truckPostingId);
      if (!truck) throw new TRPCError({ code: "NOT_FOUND", message: "Truck not found." });
      if (me.role !== "ADMIN" && truck.transporterId !== me.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the carrier can confirm this engagement." });
      }
      const load = all.loads.find((l) => l.id === input.loadId);
      if (!load) throw new TRPCError({ code: "NOT_FOUND", message: "Load not found." });

      const acc = makeAcceptance(match.id, match.loadId, "TRANSPORTER", me.id, ctx.ip ?? "0.0.0.0");
      const trip = newTrip(match.id, me.id);
      const updatedMatch: Match = { ...match, status: "CONFIRMED", confirmedByTransporterAt: acc.at };
      const updatedLoad = { ...load, status: "CONFIRMED" as const };
      const updatedTruck = { ...truck, status: "RESERVED" as const };
      const audit = makeAudit(
        "ENGAGEMENT_CONFIRMED",
        me.id,
        me.role,
        "MATCH",
        match.id,
        `${input.loadId} confirmed by carrier. Trip ${trip.id} scheduled.`,
      );
      await prisma.$transaction([
        prisma.match.upsert({ where: { id: match.id }, create: matchRow(updatedMatch), update: matchRow(updatedMatch) }),
        prisma.load.upsert({ where: { id: load.id }, create: loadRow(updatedLoad), update: loadRow(updatedLoad) }),
        blobUpsert(prisma.truck, updatedTruck),
        blobUpsert(prisma.acceptance, acc),
        prisma.trip.upsert({ where: { id: trip.id }, create: tripRow(trip), update: tripRow(trip) }),
        blobUpsert(prisma.auditEvent, audit),
      ]);

      // Engagement is live — notify the load owner and the driver.
      await emitEvent({
        event: "ENGAGEMENT_CONFIRMED",
        notifications: [load.ownerId, updatedTruck.driverId]
          .filter((id): id is string => !!id && id !== me.id)
          .map((partyId) => ({
            partyId,
            title: "Engagement confirmed",
            detail: `${input.loadId} is confirmed. Trip ${trip.id} is scheduled.`,
            tone: "positive" as const,
            subjectType: "TRIP",
            subjectId: trip.id,
          })),
        webhook: {
          data: { loadId: input.loadId, matchId: match.id, tripId: trip.id, status: "CONFIRMED" },
          involvedPartyIds: [load.ownerId, truck.transporterId].filter((id): id is string => !!id),
        },
      });
      return { ok: true as const, tripId: trip.id };
    }),

  // The OWNER awards a carrier's OFFERED request → CONFIRMED + trip; other
  // pending requests on the load are rejected.
  acceptRequest: protectedProcedure
    .input(z.object({ loadId: z.string(), truckId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const all = await readAll();
      const me = all.parties.find((p) => p.id === ctx.partyId);
      if (!me) throw new TRPCError({ code: "UNAUTHORIZED" });
      const load = all.loads.find((l) => l.id === input.loadId);
      if (!load) throw new TRPCError({ code: "NOT_FOUND", message: "Load not found." });
      if (me.role !== "ADMIN" && load.ownerId !== me.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the load owner can accept a request." });
      }
      const req = all.matches.find(
        (m) => m.loadId === input.loadId && m.truckPostingId === input.truckId && m.status === "OFFERED",
      );
      if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "No pending request from that carrier." });
      const truck = all.trucks.find((t) => t.id === input.truckId);
      if (!truck) throw new TRPCError({ code: "NOT_FOUND", message: "Truck not found." });

      const now = new Date().toISOString();
      const trip = newTrip(req.id, me.id);
      const updatedReq: Match = {
        ...req,
        status: "CONFIRMED",
        confirmedByOwnerAt: now,
        confirmedByTransporterAt: now,
      };
      const rejected = all.matches
        .filter((m) => m.loadId === input.loadId && m.status === "OFFERED" && m.id !== req.id)
        .map((m): Match => ({ ...m, status: "REJECTED", rejectionReason: "Another carrier was selected" }));
      const updatedLoad = { ...load, status: "CONFIRMED" as const };
      const updatedTruck = { ...truck, status: "RESERVED" as const };
      const audit = makeAudit(
        "ENGAGEMENT_CONFIRMED",
        me.id,
        me.role,
        "MATCH",
        req.id,
        `${input.loadId} awarded to the requesting carrier. Trip ${trip.id} scheduled.`,
      );
      await prisma.$transaction([
        prisma.match.upsert({ where: { id: req.id }, create: matchRow(updatedReq), update: matchRow(updatedReq) }),
        ...rejected.map((m) =>
          prisma.match.upsert({ where: { id: m.id }, create: matchRow(m), update: matchRow(m) }),
        ),
        prisma.load.upsert({ where: { id: load.id }, create: loadRow(updatedLoad), update: loadRow(updatedLoad) }),
        blobUpsert(prisma.truck, updatedTruck),
        prisma.trip.upsert({ where: { id: trip.id }, create: tripRow(trip), update: tripRow(trip) }),
        blobUpsert(prisma.auditEvent, audit),
      ]);

      // The winning carrier (and driver) get the good news; rejected carriers
      // are notified their offer wasn't selected.
      const winnerRecips: NotificationSpec[] = [updatedTruck.transporterId, updatedTruck.driverId]
        .filter((id): id is string => !!id && id !== me.id)
        .map((partyId) => ({
          partyId,
          title: "Request awarded",
          detail: `Your offer on ${input.loadId} was accepted. Trip ${trip.id} is scheduled.`,
          tone: "positive" as const,
          subjectType: "TRIP",
          subjectId: trip.id,
        }));
      const loserTruckIds = rejected.map((m) => m.truckPostingId);
      const loserRecips: NotificationSpec[] = all.trucks
        .filter((t) => loserTruckIds.includes(t.id) && t.transporterId && t.transporterId !== me.id)
        .map((t) => ({
          partyId: t.transporterId,
          title: "Request not selected",
          detail: `Another carrier was selected for ${input.loadId}.`,
          tone: "info" as const,
          subjectType: "LOAD",
          subjectId: input.loadId,
        }));
      await emitEvent({
        event: "ENGAGEMENT_CONFIRMED",
        notifications: [...winnerRecips, ...loserRecips],
        webhook: {
          data: { loadId: input.loadId, matchId: req.id, tripId: trip.id, status: "CONFIRMED" },
          involvedPartyIds: [load.ownerId, updatedTruck.transporterId].filter(
            (id): id is string => !!id,
          ),
        },
      });
      return { ok: true as const, tripId: trip.id };
    }),
});
