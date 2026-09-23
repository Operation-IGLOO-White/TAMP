// Seed the Postgres tables from the app's seed data.
// Run: npm run db:seed  (idempotent — replaces the table contents).

import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  seedAudit,
  seedDisputes,
  seedLoads,
  seedMatches,
  seedParties,
  seedRatings,
  seedTrips,
  seedTrucks,
} from "../src/lib/tamp-data";

const prisma = new PrismaClient();
const J = (v: unknown) => v as unknown as Prisma.InputJsonValue;
// Seed accounts all share the demo password so they can be signed into.
const hashPw = (pw: string) => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(pw, salt, 64).toString("hex")}`;
};

async function main() {
  const partyRows = seedParties.map((p) => ({
    id: p.id,
    role: p.role,
    companyName: p.companyName,
    contactName: p.contactName,
    email: p.email.toLowerCase(),
    phone: p.phone,
    province: p.province,
    verification: p.verification,
    passwordHash: hashPw("demo1234"),
    ratingAvg: p.ratingAvg ?? null,
    ratingCount: p.ratingCount,
    suspended: p.suspended,
    avatarUrl: p.avatarUrl ?? null,
    kycDocument: p.kycDocument ? J(p.kycDocument) : Prisma.JsonNull,
    createdAt: p.createdAt,
  }));

  const loadRows = seedLoads.map((l) => ({
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
  }));

  const matchRows = seedMatches.map((m) => ({
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
  }));

  const tripRows = seedTrips.map((t) => ({
    id: t.id,
    matchId: t.matchId,
    status: t.status,
    disputed: t.disputed,
    events: J(t.events),
    simulatedPosition: t.simulatedPosition ? J(t.simulatedPosition) : Prisma.JsonNull,
    progressPct: t.progressPct,
    etaAt: t.etaAt ?? null,
  }));

  const blob = (rows: { id: string }[]) => rows.map((r) => ({ id: r.id, data: J(r) }));

  await prisma.$transaction([
    prisma.trip.deleteMany(),
    prisma.match.deleteMany(),
    prisma.load.deleteMany(),
    prisma.truck.deleteMany(),
    prisma.rating.deleteMany(),
    prisma.dispute.deleteMany(),
    prisma.acceptance.deleteMany(),
    prisma.reservation.deleteMany(),
    prisma.auditEvent.deleteMany(),
    prisma.session.deleteMany(),
    prisma.party.deleteMany(),
  ]);

  await prisma.party.createMany({ data: partyRows });
  await prisma.load.createMany({ data: loadRows });
  if (matchRows.length) await prisma.match.createMany({ data: matchRows });
  if (tripRows.length) await prisma.trip.createMany({ data: tripRows });
  await prisma.truck.createMany({ data: blob(seedTrucks) });
  if (seedRatings.length) await prisma.rating.createMany({ data: blob(seedRatings) });
  if (seedDisputes.length) await prisma.dispute.createMany({ data: blob(seedDisputes) });
  if (seedAudit.length) await prisma.auditEvent.createMany({ data: blob(seedAudit) });

  console.log(
    `Seeded ${partyRows.length} parties, ${loadRows.length} loads, ${seedTrucks.length} trucks, ${matchRows.length} matches, ${tripRows.length} trips, ${seedAudit.length} audit events.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
