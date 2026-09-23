// Loads router — the platform derives equipment (cargo → body types) and price
// server-side. Ported from the previous TanStack server functions.
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { bodyTypesForCargo } from "@/lib/tamp-matching";
import { priceLoadMoney } from "@/lib/tamp-pricing";
import type { CargoType, Load, LoadStatus, Money, Place } from "@/lib/tamp-types";
import { prisma } from "../prisma";
import { publicProcedure, router } from "../trpc";

type LoadRow = Prisma.LoadGetPayload<object>;

function toLoad(row: LoadRow): Load {
  return {
    id: row.id,
    ownerId: row.ownerId,
    reference: row.reference,
    cargoType: row.cargoType as CargoType,
    weightKg: row.weightKg,
    volumeM3: row.volumeM3 ?? undefined,
    requiredBodyTypes: row.requiredBodyTypes as unknown as Load["requiredBodyTypes"],
    origin: row.origin as unknown as Place,
    destination: row.destination as unknown as Place,
    distanceKm: row.distanceKm,
    pickupWindow: row.pickupWindow as unknown as { from: string; to: string },
    deliveryBy: row.deliveryBy,
    targetRate: (row.targetRate as unknown as Money | null) ?? undefined,
    specialRequirements: row.specialRequirements ?? undefined,
    status: row.status as LoadStatus,
    createdAt: row.createdAt,
  };
}

const placeSchema = z.object({
  label: z.string(),
  province: z.string(),
  lat: z.number(),
  lng: z.number(),
});

const createLoadInput = z.object({
  ownerId: z.string().min(1),
  cargoType: z.string(),
  weightKg: z.number(),
  volumeM3: z.number().optional(),
  origin: placeSchema,
  destination: placeSchema,
  distanceKm: z.number(),
  pickupWindow: z.object({ from: z.string(), to: z.string() }),
  deliveryBy: z.string(),
  specialRequirements: z.string().optional(),
});

export const loadsRouter = router({
  list: publicProcedure.query(async (): Promise<Load[]> => {
    const rows = await prisma.load.findMany();
    return rows.map(toLoad);
  }),

  create: publicProcedure
    .input(createLoadInput)
    .mutation(async ({ input }): Promise<{ id: string }> => {
      const id = `LD-${Date.now().toString(36).toUpperCase()}`;
      const cargoType = input.cargoType as CargoType;
      await prisma.load.create({
        data: {
          id,
          ownerId: input.ownerId,
          reference: id,
          cargoType,
          weightKg: input.weightKg,
          volumeM3: input.volumeM3 ?? null,
          // Platform-derived: cargo type → bodies; pricing engine → quote.
          requiredBodyTypes: bodyTypesForCargo(cargoType) as unknown as Prisma.InputJsonValue,
          origin: input.origin,
          destination: input.destination,
          distanceKm: input.distanceKm,
          pickupWindow: input.pickupWindow,
          deliveryBy: input.deliveryBy,
          targetRate: priceLoadMoney(
            input.distanceKm,
            input.weightKg,
            cargoType,
          ) as unknown as Prisma.InputJsonValue,
          specialRequirements: input.specialRequirements ?? null,
          status: "POSTED",
          createdAt: new Date().toISOString(),
        },
      });
      return { id };
    }),
});
