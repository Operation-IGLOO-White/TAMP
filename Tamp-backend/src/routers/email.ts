// Email-verification router. Generates a 6-digit code, stores it hashed with a
// 10-minute expiry, and emails it. The code never reaches the browser in
// production; account creation (parties.register) verifies it server-side.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { hashPassword } from "../auth";
import { mailerLive, sendMail, verificationEmail } from "../mailer";
import { prisma } from "../prisma";
import { publicProcedure, router } from "../trpc";

const CODE_TTL_MIN = 10;
const RESEND_COOLDOWN_MS = 30_000;

const genCode = () => String(Math.floor(100000 + Math.random() * 900000));

export const emailRouter = router({
  sendCode: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const email = input.email.trim().toLowerCase();

      // Cooldown so a code can't be spammed.
      const existing = await prisma.emailVerification.findUnique({ where: { email } });
      if (existing && Date.now() - existing.createdAt.getTime() < RESEND_COOLDOWN_MS) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Please wait a few seconds before requesting another code.",
        });
      }

      const code = genCode();
      const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000);
      await prisma.emailVerification.upsert({
        where: { email },
        create: { email, codeHash: hashPassword(code), expiresAt, attempts: 0 },
        update: { codeHash: hashPassword(code), expiresAt, attempts: 0, createdAt: new Date() },
      });

      const { subject, html, text } = verificationEmail(code);
      await sendMail({ to: email, subject, html, text });

      // In dev with no provider configured, hand the code back so the flow is
      // testable. Never leaked once a real key is set, or in production.
      const live = mailerLive();
      const devCode =
        !live && process.env.NODE_ENV !== "production" ? code : undefined;
      return { sent: true, live, devCode };
    }),
});
