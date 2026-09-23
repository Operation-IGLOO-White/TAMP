// Exposes the matching engine (src/matching.ts) over tRPC so the frontend can
// get live match scores/body-type suggestions without embedding the platform's
// business logic client-side.
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { bodyTypesForCargo, roadDistanceKm, scoreLoadAgainstTrucks } from "../matching";
import type { CargoType, Load, Party, Place, TruckPosting } from "../types";

const cargoTypeSchema = z.enum([
  "GENERAL_PALLETISED",
  "BULK_DRY",
  "BULK_LIQUID",
  "REFRIGERATED",
  "ABNORMAL",
  "CONTAINERISED",
  "LIVESTOCK",
  "HAZARDOUS",
]);

const bodyTypeSchema = z.enum([
  "TAUTLINER",
  "FLATBED",
  "TIPPER",
  "TANKER",
  "REFRIGERATED",
  "SIDE_TIPPER",
  "LOWBED",
  "DROPSIDE",
]);

const placeSchema = z.object({
  label: z.string(),
  province: z.string(),
  lat: z.number(),
  lng: z.number(),
});

const partySchema = z.object({
  id: z.string(),
  role: z.enum(["FREIGHT_OWNER", "TRANSPORTER", "DRIVER", "ADMIN"]),
  companyName: z.string(),
  contactName: z.string(),
  email: z.string(),
  phone: z.string(),
  province: z.string(),
  verification: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"]),
  ratingAvg: z.number().nullable(),
  ratingCount: z.number(),
  suspended: z.boolean(),
  avatarUrl: z.string().optional(),
  kycDocument: z
    .object({ name: z.string(), url: z.string().optional(), uploadedAt: z.string() })
    .optional(),
  onboardingComplete: z.boolean().optional(),
  createdAt: z.string(),
});

const loadSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  reference: z.string(),
  cargoType: cargoTypeSchema,
  weightKg: z.number(),
  volumeM3: z.number().optional(),
  requiredBodyTypes: z.array(bodyTypeSchema),
  origin: placeSchema,
  destination: placeSchema,
  distanceKm: z.number(),
  pickupWindow: z.object({ from: z.string(), to: z.string() }),
  deliveryBy: z.string(),
  targetRate: z.object({ amount: z.number(), currency: z.literal("ZAR"), vat: z.enum(["incl", "excl"]) }).optional(),
  specialRequirements: z.string().optional(),
  status: z.enum([
    "DRAFT",
    "POSTED",
    "MATCHED",
    "CONFIRMED",
    "COMPLETED",
    "CLOSED",
    "CANCELLED",
    "EXPIRED",
  ]),
  createdAt: z.string(),
});

const truckPostingSchema = z.object({
  id: z.string(),
  transporterId: z.string(),
  driverId: z.string().optional(),
  registration: z.string(),
  bodyType: bodyTypeSchema,
  payloadCapacityKg: z.number(),
  volumeCapacityM3: z.number().optional(),
  currentLocation: placeSchema,
  availableFrom: z.string(),
  availableTo: z.string(),
  preferredLanes: z.array(z.object({ origin: z.string(), destination: z.string() })).optional(),
  photos: z.array(z.string()).optional(),
  documents: z.array(z.string()).optional(),
  licenceExpiry: z.string().optional(),
  status: z.enum(["AVAILABLE", "RESERVED", "ON_TRIP", "OFFLINE", "EXPIRED"]),
  createdAt: z.string(),
});

export const matchingRouter = router({
  score: publicProcedure
    .input(
      z.object({
        load: loadSchema,
        trucks: z.array(truckPostingSchema),
        operators: z.array(partySchema),
        owner: partySchema,
      }),
    )
    .query(({ input }) =>
      // zod's .optional() types absent fields as `T | undefined`, which the
      // domain types (under exactOptionalPropertyTypes) don't — the runtime
      // shapes match, so this is a type-level-only cast.
      scoreLoadAgainstTrucks(
        input.load as unknown as Load,
        input.trucks as unknown as TruckPosting[],
        input.operators as unknown as Party[],
        input.owner as unknown as Party,
      ),
    ),

  bodyTypesForCargo: publicProcedure
    .input(z.object({ cargoType: cargoTypeSchema }))
    .query(({ input }): ReturnType<typeof bodyTypesForCargo> =>
      bodyTypesForCargo(input.cargoType as CargoType),
    ),

  roadDistanceKm: publicProcedure
    .input(z.object({ a: placeSchema, b: placeSchema }))
    .query(({ input }): number => roadDistanceKm(input.a as Place, input.b as Place)),
});
