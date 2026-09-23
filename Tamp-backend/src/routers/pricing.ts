// Exposes the pricing engine (src/pricing.ts) over tRPC so the frontend can
// show a live quote without embedding the platform's rate logic client-side.
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { priceLoad, priceLoadMoney } from "../pricing";

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

const quoteInput = z.object({
  distanceKm: z.number(),
  weightKg: z.number(),
  cargoType: cargoTypeSchema,
});

export const pricingRouter = router({
  quote: publicProcedure
    .input(quoteInput)
    .query(({ input }) => priceLoad(input.distanceKm, input.weightKg, input.cargoType)),

  quoteMoney: publicProcedure
    .input(quoteInput)
    .query(({ input }) => priceLoadMoney(input.distanceKm, input.weightKg, input.cargoType)),
});
