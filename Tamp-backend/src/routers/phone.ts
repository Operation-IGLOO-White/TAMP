// Exposes SA mobile-number validation (src/phone.ts) over tRPC so the
// frontend can validate phone input without embedding the format rules
// client-side.
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { checkSaMobile } from "../phone";

export const phoneRouter = router({
  check: publicProcedure
    .input(z.object({ raw: z.string() }))
    .query(({ input }) => checkSaMobile(input.raw)),
});
