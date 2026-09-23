// Domain snapshot with per-account ownership scoping.
//
// Reads: each account only receives its own data (plus, for carriers, the open
// marketplace of POSTED loads to bid on, and the counterparties referenced by
// what it can see). Admins see everything.
//
// Writes: "scoped replace-all" — a save deletes and re-inserts only the rows the
// authenticated account owns, so it can never touch or clobber another account's
// data, and removals (e.g. withdrawing a request) still propagate.
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type {
  Acceptance,
  AuditEvent,
  Dispute,
  FuelLog,
  Load,
  MaintenanceTask,
  Match,
  Party,
  Proof,
  Rating,
  Reservation,
  Trip,
  TruckPosting,
} from "@/lib/tamp-types";
import { TRPCError } from "@trpc/server";
import { type BlobKind, validateBlob } from "../blobSchemas";
import { logger } from "../logger";
import { prisma } from "../prisma";
import { matchConfirmError, tripTransitionError } from "../transitions";
import { toParty } from "./auth";
import { protectedProcedure, router } from "../trpc";

export const J = (v: unknown) => v as unknown as Prisma.InputJsonValue;
const asArr = <T>(rows: { data: Prisma.JsonValue }[]) => rows.map((r) => r.data as unknown as T);

// ---- column-table mappers (loads / matches / trips) ------------------------

function toLoad(r: Prisma.LoadGetPayload<object>): Load {
  return {
    id: r.id,
    ownerId: r.ownerId,
    reference: r.reference,
    cargoType: r.cargoType as Load["cargoType"],
    weightKg: r.weightKg,
    volumeM3: r.volumeM3 ?? undefined,
    requiredBodyTypes: r.requiredBodyTypes as unknown as Load["requiredBodyTypes"],
    origin: r.origin as unknown as Load["origin"],
    destination: r.destination as unknown as Load["destination"],
    distanceKm: r.distanceKm,
    pickupWindow: r.pickupWindow as unknown as Load["pickupWindow"],
    deliveryBy: r.deliveryBy,
    targetRate: (r.targetRate as unknown as Load["targetRate"]) ?? undefined,
    specialRequirements: r.specialRequirements ?? undefined,
    status: r.status as Load["status"],
    createdAt: r.createdAt,
  };
}

function toMatch(r: Prisma.MatchGetPayload<object>): Match {
  return {
    id: r.id,
    loadId: r.loadId,
    truckPostingId: r.truckPostingId,
    score: r.score,
    breakdown: r.breakdown as unknown as Match["breakdown"],
    hardFilterResults: r.hardFilterResults as unknown as Match["hardFilterResults"],
    status: r.status as Match["status"],
    initiatedBy: r.initiatedBy as Match["initiatedBy"],
    agreedRate: (r.agreedRate as unknown as Match["agreedRate"]) ?? undefined,
    rejectionReason: r.rejectionReason ?? undefined,
    confirmedByOwnerAt: r.confirmedByOwnerAt ?? undefined,
    confirmedByTransporterAt: r.confirmedByTransporterAt ?? undefined,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  };
}

function toTrip(r: Prisma.TripGetPayload<object>): Trip {
  return {
    id: r.id,
    matchId: r.matchId,
    status: r.status as Trip["status"],
    disputed: r.disputed,
    events: r.events as unknown as Trip["events"],
    simulatedPosition: (r.simulatedPosition as unknown as Trip["simulatedPosition"]) ?? null,
    progressPct: r.progressPct,
    etaAt: r.etaAt ?? null,
  };
}

export const loadRow = (l: Load) => ({
  id: l.id,
  ownerId: l.ownerId,
  reference: l.reference,
  cargoType: l.cargoType,
  weightKg: l.weightKg,
  volumeM3: l.volumeM3 ?? null,
  requiredBodyTypes: J(l.requiredBodyTypes),
  origin: J(l.origin),
  destination: J(l.destination),
  distanceKm: l.distanceKm,
  pickupWindow: J(l.pickupWindow),
  deliveryBy: l.deliveryBy,
  targetRate: l.targetRate ? J(l.targetRate) : Prisma.JsonNull,
  specialRequirements: l.specialRequirements ?? null,
  status: l.status,
  createdAt: l.createdAt,
});

export const matchRow = (m: Match) => ({
  id: m.id,
  loadId: m.loadId,
  truckPostingId: m.truckPostingId,
  score: m.score,
  breakdown: J(m.breakdown),
  hardFilterResults: J(m.hardFilterResults),
  status: m.status,
  initiatedBy: m.initiatedBy,
  agreedRate: m.agreedRate ? J(m.agreedRate) : Prisma.JsonNull,
  rejectionReason: m.rejectionReason ?? null,
  confirmedByOwnerAt: m.confirmedByOwnerAt ?? null,
  confirmedByTransporterAt: m.confirmedByTransporterAt ?? null,
  expiresAt: m.expiresAt,
  createdAt: m.createdAt,
});

export const tripRow = (t: Trip) => ({
  id: t.id,
  matchId: t.matchId,
  status: t.status,
  disputed: t.disputed,
  events: J(t.events),
  simulatedPosition: t.simulatedPosition ? J(t.simulatedPosition) : Prisma.JsonNull,
  progressPct: t.progressPct,
  etaAt: t.etaAt ?? null,
});

const blob = (rows: { id: string }[]) => rows.map((r) => ({ id: r.id, data: J(r) }));

export interface DomainSnapshot {
  loads: Load[];
  trucks: TruckPosting[];
  matches: Match[];
  trips: Trip[];
  ratings: Rating[];
  disputes: Dispute[];
  acceptances: Acceptance[];
  reservations: Reservation[];
  audit: AuditEvent[];
  fuelLogs: FuelLog[];
  maintenance: MaintenanceTask[];
  proofs: Proof[];
}

// Read the whole domain from Postgres (all tables), decoded to domain types.
export async function readAll() {
  const [
    parties,
    loads,
    trucks,
    matches,
    trips,
    ratings,
    disputes,
    acceptances,
    reservations,
    audit,
    fuelLogs,
    maintenance,
    proofs,
  ] = await Promise.all([
    prisma.party.findMany(),
    prisma.load.findMany(),
    prisma.truck.findMany(),
    prisma.match.findMany(),
    prisma.trip.findMany(),
    prisma.rating.findMany(),
    prisma.dispute.findMany(),
    prisma.acceptance.findMany(),
    prisma.reservation.findMany(),
    prisma.auditEvent.findMany(),
    prisma.fuelLog.findMany(),
    prisma.maintenanceTask.findMany(),
    prisma.proof.findMany(),
  ]);
  return {
    parties: parties.map(toParty),
    loads: loads.map(toLoad),
    trucks: asArr<TruckPosting>(trucks),
    matches: matches.map(toMatch),
    trips: trips.map(toTrip),
    ratings: asArr<Rating>(ratings),
    disputes: asArr<Dispute>(disputes),
    acceptances: asArr<Acceptance>(acceptances),
    reservations: asArr<Reservation>(reservations),
    audit: asArr<AuditEvent>(audit),
    fuelLogs: asArr<FuelLog>(fuelLogs),
    maintenance: asArr<MaintenanceTask>(maintenance),
    proofs: asArr<Proof>(proofs),
  };
}

export const snapshotRouter = router({
  load: protectedProcedure.query(async ({ ctx }): Promise<DomainSnapshot & { parties: Party[] }> => {
    const me = await prisma.party.findUnique({ where: { id: ctx.partyId } });
    const all = await readAll();
    if (!me || me.role === "ADMIN") return all;

    const isTransporter = me.role === "TRANSPORTER";
    const isDriver = me.role === "DRIVER";
    const myLoadIds = new Set(all.loads.filter((l) => l.ownerId === me.id).map((l) => l.id));
    // A transporter's trucks are the ones they operate; a driver sees the trucks
    // they're assigned to drive AND any they own themselves (owner-operator).
    const myTruckIds = new Set(
      all.trucks
        .filter((t) =>
          isDriver ? t.driverId === me.id || t.transporterId === me.id : t.transporterId === me.id,
        )
        .map((t) => t.id),
    );

    // Matches I'm a party to (my load or my truck), and the trips beneath them.
    const myMatches = all.matches.filter(
      (m) => myLoadIds.has(m.loadId) || myTruckIds.has(m.truckPostingId),
    );
    const myMatchIds = new Set(myMatches.map((m) => m.id));
    const myTrips = all.trips.filter((t) => myMatchIds.has(t.matchId));
    const myTripIds = new Set(myTrips.map((t) => t.id));

    // Loads: my own (owner), the open marketplace (carriers + drivers can bid),
    // and any I'm engaged on.
    const canBid = isTransporter || isDriver;
    const engagedLoadIds = new Set(myMatches.map((m) => m.loadId));
    const loads = all.loads.filter(
      (l) => myLoadIds.has(l.id) || engagedLoadIds.has(l.id) || (canBid && l.status === "POSTED"),
    );
    const visibleLoadIds = new Set(loads.map((l) => l.id));

    // Trucks: my own + any referenced by my matches (so a cargo owner sees the
    // operator/vehicle on their board).
    const engagedTruckIds = new Set(myMatches.map((m) => m.truckPostingId));
    const trucks = all.trucks.filter((t) => myTruckIds.has(t.id) || engagedTruckIds.has(t.id));
    const visibleTruckIds = new Set(trucks.map((t) => t.id));

    const reservations = all.reservations.filter((r) => r.transporterId === me.id);
    const ratings = all.ratings.filter((r) => myTripIds.has(r.tripId));
    const disputes = all.disputes.filter((d) => myTripIds.has(d.tripId));
    // Fleet running-cost data is scoped to the trucks I own/drive; POD to my trips.
    const fuelLogs = all.fuelLogs.filter((f) => myTruckIds.has(f.truckId));
    const maintenance = all.maintenance.filter((m) => myTruckIds.has(m.truckId));
    const proofs = all.proofs.filter((p) => myTripIds.has(p.tripId));
    const acceptances = all.acceptances.filter(
      (a) => a.byUserId === me.id || visibleLoadIds.has(a.loadId),
    );
    const audit = all.audit.filter(
      (a) =>
        a.actorId === me.id ||
        visibleLoadIds.has(a.subjectId) ||
        visibleTruckIds.has(a.subjectId) ||
        myMatchIds.has(a.subjectId) ||
        myTripIds.has(a.subjectId),
    );

    // Counterparties referenced by what I can see (directory stays scoped).
    const partyIds = new Set<string>([me.id]);
    for (const l of loads) partyIds.add(l.ownerId);
    for (const t of trucks) {
      partyIds.add(t.transporterId);
      if (t.driverId) partyIds.add(t.driverId);
    }
    const parties = all.parties.filter((p) => partyIds.has(p.id));

    return {
      parties,
      loads,
      trucks,
      matches: myMatches,
      trips: myTrips,
      ratings,
      disputes,
      acceptances,
      reservations,
      audit,
      fuelLogs,
      maintenance,
      proofs,
    };
  }),

  // Delta persistence: upsert only the rows that changed and delete only the
  // ids that were removed — each authorised against the caller's ownership so
  // one account can never write another's data.
  sync: protectedProcedure
    .input(
      z.object({
        upserts: z.object({
          loads: z.array(z.any()),
          trucks: z.array(z.any()),
          matches: z.array(z.any()),
          trips: z.array(z.any()),
          ratings: z.array(z.any()),
          disputes: z.array(z.any()),
          acceptances: z.array(z.any()),
          reservations: z.array(z.any()),
          audit: z.array(z.any()),
          fuelLogs: z.array(z.any()),
          maintenance: z.array(z.any()),
          proofs: z.array(z.any()),
        }),
        deleteIds: z.object({
          loads: z.array(z.string()),
          trucks: z.array(z.string()),
          matches: z.array(z.string()),
          trips: z.array(z.string()),
          ratings: z.array(z.string()),
          disputes: z.array(z.string()),
          acceptances: z.array(z.string()),
          reservations: z.array(z.string()),
          audit: z.array(z.string()),
          fuelLogs: z.array(z.string()),
          maintenance: z.array(z.string()),
          proofs: z.array(z.string()),
        }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const me = await prisma.party.findUnique({ where: { id: ctx.partyId } });
      if (!me) return { ok: true as const };
      const isAdmin = me.role === "ADMIN";
      const up = input.upserts as DomainSnapshot;
      const del = input.deleteIds;
      const cur = await readAll();

      // Ownership maps from the DB (authoritative).
      const dbLoadOwner = new Map(cur.loads.map((l) => [l.id, l.ownerId]));
      const dbTruckOwner = new Map(cur.trucks.map((t) => [t.id, t.transporterId]));
      const involvedTruck = new Set(
        cur.trucks.filter((t) => t.transporterId === me.id || t.driverId === me.id).map((t) => t.id),
      );

      const okLoad = (l: Load) =>
        isAdmin || (dbLoadOwner.has(l.id) ? dbLoadOwner.get(l.id) === me.id : l.ownerId === me.id);
      const okTruck = (t: TruckPosting) =>
        isAdmin ||
        (dbTruckOwner.has(t.id) ? dbTruckOwner.get(t.id) === me.id : t.transporterId === me.id);

      const myLoadIds = new Set<string>([
        ...cur.loads.filter((l) => l.ownerId === me.id).map((l) => l.id),
        ...up.loads.filter(okLoad).map((l) => l.id),
      ]);
      const myTruckIds = new Set<string>([...involvedTruck, ...up.trucks.filter(okTruck).map((t) => t.id)]);

      const okMatch = (m: Match) =>
        isAdmin || myLoadIds.has(m.loadId) || myTruckIds.has(m.truckPostingId);
      const myMatchIds = new Set<string>([
        ...cur.matches.filter(okMatch).map((m) => m.id),
        ...up.matches.filter(okMatch).map((m) => m.id),
      ]);
      const okTrip = (t: Trip) => isAdmin || myMatchIds.has(t.matchId);
      const myTripIds = new Set<string>([
        ...cur.trips.filter(okTrip).map((t) => t.id),
        ...up.trips.filter(okTrip).map((t) => t.id),
      ]);
      const okRating = (r: Rating) => isAdmin || myTripIds.has(r.tripId);
      const okDispute = (d: Dispute) => isAdmin || myTripIds.has(d.tripId);
      const okReservation = (r: Reservation) => isAdmin || r.transporterId === me.id;
      const okAcceptance = (a: Acceptance) => isAdmin || a.byUserId === me.id;
      const okAudit = (a: AuditEvent) => isAdmin || a.actorId === me.id;
      const okFuel = (f: FuelLog) => isAdmin || myTruckIds.has(f.truckId);
      const okMaint = (m: MaintenanceTask) => isAdmin || myTruckIds.has(m.truckId);
      const okProof = (p: Proof) => isAdmin || myTripIds.has(p.tripId);

      // Delete-id authorisation: the row must currently be mine in the DB.
      const idIn = <T extends { id: string }>(rows: T[], ok: (r: T) => boolean) =>
        new Set(rows.filter(ok).map((r) => r.id));
      const mineDelMatch = idIn(cur.matches, okMatch);
      const mineDelTrip = idIn(cur.trips, okTrip);
      const mineDelRating = idIn(cur.ratings, okRating);
      const mineDelDispute = idIn(cur.disputes, okDispute);
      const mineDelRes = idIn(cur.reservations, okReservation);
      const mineDelAcc = idIn(cur.acceptances, okAcceptance);
      const mineDelAudit = idIn(cur.audit, okAudit);
      const mineDelFuel = idIn(cur.fuelLogs, okFuel);
      const mineDelMaint = idIn(cur.maintenance, okMaint);
      const mineDelProof = idIn(cur.proofs, okProof);
      const dIn = (ids: string[], allowed: Set<string>) =>
        ids.filter((id) => isAdmin || allowed.has(id));
      const delLoads = del.loads.filter((id) => isAdmin || dbLoadOwner.get(id) === me.id);
      const delTrucks = del.trucks.filter((id) => isAdmin || dbTruckOwner.get(id) === me.id);

      // ── Server-authoritative transition guards ──────────────────
      // The server validates the diff, not just row ownership. A crafted client
      // cannot mark a trip DELIVERED without a POD, jump a trip to delivered,
      // move it backwards, or confirm a match whose load it doesn't own.
      if (!isAdmin) {
        const curTripById = new Map(cur.trips.map((t) => [t.id, t]));
        const proofTripIds = new Set<string>([
          ...cur.proofs.map((p) => p.tripId),
          ...up.proofs.filter(okProof).map((p) => p.tripId),
        ]);
        for (const t of up.trips) {
          if (!okTrip(t)) continue;
          const err = tripTransitionError(curTripById.get(t.id), t, proofTripIds.has(t.id));
          if (err) throw new TRPCError({ code: "BAD_REQUEST", message: err });
        }

        const curMatchById = new Map(cur.matches.map((m) => [m.id, m]));
        const ownerOfLoad = (loadId: string) =>
          dbLoadOwner.get(loadId) ?? up.loads.find((l) => l.id === loadId)?.ownerId;
        for (const m of up.matches) {
          if (!okMatch(m)) continue;
          const err = matchConfirmError(curMatchById.get(m.id), m, ownerOfLoad(m.loadId), me.id);
          if (err) throw new TRPCError({ code: "FORBIDDEN", message: err });
        }
      }

      const ops: Prisma.PrismaPromise<unknown>[] = [];
      // Deletes first.
      if (del.trips.length) ops.push(prisma.trip.deleteMany({ where: { id: { in: dIn(del.trips, mineDelTrip) } } }));
      if (del.matches.length) ops.push(prisma.match.deleteMany({ where: { id: { in: dIn(del.matches, mineDelMatch) } } }));
      if (delLoads.length) ops.push(prisma.load.deleteMany({ where: { id: { in: delLoads } } }));
      if (delTrucks.length) ops.push(prisma.truck.deleteMany({ where: { id: { in: delTrucks } } }));
      if (del.ratings.length) ops.push(prisma.rating.deleteMany({ where: { id: { in: dIn(del.ratings, mineDelRating) } } }));
      if (del.disputes.length) ops.push(prisma.dispute.deleteMany({ where: { id: { in: dIn(del.disputes, mineDelDispute) } } }));
      if (del.acceptances.length) ops.push(prisma.acceptance.deleteMany({ where: { id: { in: dIn(del.acceptances, mineDelAcc) } } }));
      if (del.reservations.length) ops.push(prisma.reservation.deleteMany({ where: { id: { in: dIn(del.reservations, mineDelRes) } } }));
      if (del.audit.length) ops.push(prisma.auditEvent.deleteMany({ where: { id: { in: dIn(del.audit, mineDelAudit) } } }));
      if (del.fuelLogs.length) ops.push(prisma.fuelLog.deleteMany({ where: { id: { in: dIn(del.fuelLogs, mineDelFuel) } } }));
      if (del.maintenance.length) ops.push(prisma.maintenanceTask.deleteMany({ where: { id: { in: dIn(del.maintenance, mineDelMaint) } } }));
      if (del.proofs.length) ops.push(prisma.proof.deleteMany({ where: { id: { in: dIn(del.proofs, mineDelProof) } } }));
      // Upserts.
      for (const l of up.loads.filter(okLoad))
        ops.push(prisma.load.upsert({ where: { id: l.id }, create: loadRow(l), update: loadRow(l) }));
      for (const m of up.matches.filter(okMatch))
        ops.push(prisma.match.upsert({ where: { id: m.id }, create: matchRow(m), update: matchRow(m) }));
      for (const t of up.trips.filter(okTrip))
        ops.push(prisma.trip.upsert({ where: { id: t.id }, create: tripRow(t), update: tripRow(t) }));
      const blobUpsert = (
        kind: BlobKind,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        model: { upsert: (a: any) => Prisma.PrismaPromise<unknown> },
        rows: { id: string }[],
      ) => {
        for (const r of rows) {
          // Schema discipline: reject corrupt/drifted blob payloads before they
          // reach the JSON column (which enforces no shape of its own).
          const issue = validateBlob(kind, r);
          if (issue) {
            logger.error("blob_validation_failed", { kind, id: r.id, issue, partyId: ctx.partyId });
            throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid ${kind} payload: ${issue}` });
          }
          ops.push(model.upsert({ where: { id: r.id }, create: { id: r.id, data: J(r) }, update: { data: J(r) } }));
        }
      };
      // A truck may only carry a driverId that points to a VERIFIED driver —
      // strip any unverified assignment before persisting (defense in depth).
      const truckUpserts = up.trucks.filter(okTruck);
      const driverIds = [
        ...new Set(truckUpserts.map((t) => t.driverId).filter((d): d is string => !!d)),
      ];
      let verifiedDrivers = new Set<string>();
      if (driverIds.length) {
        const rows = await prisma.party.findMany({
          where: { id: { in: driverIds }, role: "DRIVER", verification: "VERIFIED" },
          select: { id: true },
        });
        verifiedDrivers = new Set(rows.map((r) => r.id));
      }
      const sanitizedTrucks = truckUpserts.map((t) =>
        t.driverId && !verifiedDrivers.has(t.driverId) ? { ...t, driverId: undefined } : t,
      );

      blobUpsert("truck", prisma.truck, sanitizedTrucks);
      blobUpsert("rating", prisma.rating, up.ratings.filter(okRating));
      blobUpsert("dispute", prisma.dispute, up.disputes.filter(okDispute));
      blobUpsert("acceptance", prisma.acceptance, up.acceptances.filter(okAcceptance));
      blobUpsert("reservation", prisma.reservation, up.reservations.filter(okReservation));
      blobUpsert("audit", prisma.auditEvent, up.audit.filter(okAudit));
      blobUpsert("fuelLog", prisma.fuelLog, up.fuelLogs.filter(okFuel));
      blobUpsert("maintenance", prisma.maintenanceTask, up.maintenance.filter(okMaint));
      blobUpsert("proof", prisma.proof, up.proofs.filter(okProof));

      if (ops.length) await prisma.$transaction(ops);
      return { ok: true as const };
    }),
});
