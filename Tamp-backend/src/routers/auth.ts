// Authentication router — real login/session, replacing the demo persona switch.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { Party, VerificationStatus } from "@/lib/tamp-types";
import {
  clearedCookie,
  createSession,
  destroyAllSessions,
  destroyOtherSessions,
  destroySession,
  hashPassword,
  readCookie,
  SESSION_COOKIE,
  sessionCookie,
  verifyPassword,
} from "../auth";
import { emailChangeEmail, mailerLive, passwordResetEmail, sendMail } from "../mailer";
import { prisma } from "../prisma";
import { lockedFor, recordFailure, recordSuccess } from "../rateLimit";
import { protectedProcedure, publicProcedure, router } from "../trpc";

const genCode = () => String(Math.floor(100000 + Math.random() * 900000));
const CODE_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 30_000;
const MAX_CODE_ATTEMPTS = 5;
const devCodeFor = (code: string) =>
  !mailerLive() && process.env.NODE_ENV !== "production" ? code : undefined;

type PartyRow = Prisma.PartyGetPayload<object>;

export function toParty(row: PartyRow): Party {
  return {
    id: row.id,
    role: row.role as Party["role"],
    companyName: row.companyName,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone,
    province: row.province,
    verification: row.verification as VerificationStatus,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    suspended: row.suspended,
    avatarUrl: row.avatarUrl ?? undefined,
    kycDocument: (row.kycDocument as unknown as Party["kycDocument"]) ?? undefined,
    onboardingComplete: row.onboardingComplete,
    createdAt: row.createdAt,
  };
}

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ email: z.string().min(1), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }): Promise<Party> => {
      const email = input.email.toLowerCase();
      // Brute-force lockout by email (and IP when available).
      const keys = [`login:${email}`, ...(ctx.ip ? [`login-ip:${ctx.ip}`] : [])];
      const lock = Math.max(...keys.map(lockedFor), 0);
      if (lock > 0) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many attempts. Try again in ${Math.ceil(lock / 60)} min.`,
        });
      }
      const row = await prisma.party.findUnique({ where: { email } });
      if (!row || !verifyPassword(input.password, row.passwordHash)) {
        keys.forEach(recordFailure);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
      }
      if (row.suspended) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This account is suspended." });
      }
      keys.forEach(recordSuccess);
      const token = await createSession(row.id);
      ctx.resHeaders.append("Set-Cookie", sessionCookie(token));
      return toParty(row);
    }),

  me: publicProcedure.query(async ({ ctx }): Promise<Party | null> => {
    if (!ctx.partyId) return null;
    const row = await prisma.party.findUnique({ where: { id: ctx.partyId } });
    return row ? toParty(row) : null;
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    await destroySession(readCookie(ctx.cookieHeader, SESSION_COOKIE));
    ctx.resHeaders.append("Set-Cookie", clearedCookie());
    return { ok: true as const };
  }),

  changePassword: publicProcedure
    .input(z.object({ currentPassword: z.string(), newPassword: z.string().min(6) }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.partyId) throw new TRPCError({ code: "UNAUTHORIZED" });
      const row = await prisma.party.findUnique({ where: { id: ctx.partyId } });
      if (!row) throw new TRPCError({ code: "UNAUTHORIZED" });
      // Accounts created via social login may have no password yet — allow
      // setting one without a current password.
      if (row.passwordHash && !verifyPassword(input.currentPassword, row.passwordHash)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Current password is incorrect." });
      }
      await prisma.party.update({
        where: { id: ctx.partyId },
        data: { passwordHash: hashPassword(input.newPassword) },
      });
      // Sign out every other session — a changed password invalidates them.
      const current = readCookie(ctx.cookieHeader, SESSION_COOKIE);
      const signedOut = await destroyOtherSessions(ctx.partyId, current);
      return { ok: true as const, signedOut };
    }),

  // Sign out all other devices (keep the current session).
  logoutOtherSessions: protectedProcedure.mutation(async ({ ctx }) => {
    const current = readCookie(ctx.cookieHeader, SESSION_COOKIE);
    const count = await destroyOtherSessions(ctx.partyId, current);
    return { count };
  }),

  // ── Forgot / reset password ─────────────────────────────────────
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const email = input.email.trim().toLowerCase();
      const existing = await prisma.passwordReset.findUnique({ where: { email } });
      if (existing && Date.now() - existing.createdAt.getTime() < RESEND_COOLDOWN_MS) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Please wait a few seconds before requesting another code.",
        });
      }
      // Anti-enumeration: only send when the account exists, but always return
      // the same shape so callers can't probe which emails are registered.
      const party = await prisma.party.findUnique({ where: { email } });
      let devCode: string | undefined;
      if (party) {
        const code = genCode();
        const expiresAt = new Date(Date.now() + CODE_TTL_MS);
        await prisma.passwordReset.upsert({
          where: { email },
          create: { email, codeHash: hashPassword(code), expiresAt, attempts: 0 },
          update: { codeHash: hashPassword(code), expiresAt, attempts: 0, createdAt: new Date() },
        });
        const mail = passwordResetEmail(code);
        await sendMail({ to: email, ...mail });
        devCode = devCodeFor(code);
      }
      return { sent: true as const, devCode };
    }),

  resetPassword: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        code: z.string().min(4),
        newPassword: z.string().min(6),
      }),
    )
    .mutation(async ({ input }) => {
      const email = input.email.trim().toLowerCase();
      const row = await prisma.passwordReset.findUnique({ where: { email } });
      if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: "Request a reset code first." });
      if (row.expiresAt < new Date()) {
        await prisma.passwordReset.delete({ where: { email } }).catch(() => {});
        throw new TRPCError({ code: "BAD_REQUEST", message: "That code has expired. Request a new one." });
      }
      if (row.attempts >= MAX_CODE_ATTEMPTS) {
        await prisma.passwordReset.delete({ where: { email } }).catch(() => {});
        throw new TRPCError({ code: "BAD_REQUEST", message: "Too many attempts. Request a new code." });
      }
      if (!verifyPassword(input.code.trim(), row.codeHash)) {
        await prisma.passwordReset.update({ where: { email }, data: { attempts: { increment: 1 } } });
        throw new TRPCError({ code: "BAD_REQUEST", message: "That code doesn't match. Try again." });
      }
      const party = await prisma.party.findUnique({ where: { email } });
      if (!party) throw new TRPCError({ code: "BAD_REQUEST", message: "Account not found." });
      await prisma.party.update({
        where: { id: party.id },
        data: { passwordHash: hashPassword(input.newPassword) },
      });
      await prisma.passwordReset.delete({ where: { email } });
      await destroyAllSessions(party.id); // sign out everywhere after a reset
      recordSuccess(`login:${email}`); // clear any lockout
      return { ok: true as const };
    }),

  // ── Email change (verified via the new address) ─────────────────
  requestEmailChange: protectedProcedure
    .input(z.object({ newEmail: z.string().email() }))
    .mutation(async ({ input, ctx }) => {
      const newEmail = input.newEmail.trim().toLowerCase();
      const me = await prisma.party.findUnique({ where: { id: ctx.partyId } });
      if (!me) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (newEmail === me.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That's already your email." });
      }
      const taken = await prisma.party.findUnique({ where: { email: newEmail } });
      if (taken) throw new TRPCError({ code: "BAD_REQUEST", message: "That email is already in use." });
      const existing = await prisma.emailChange.findUnique({ where: { partyId: ctx.partyId } });
      if (existing && Date.now() - existing.createdAt.getTime() < RESEND_COOLDOWN_MS) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Please wait a few seconds before requesting another code.",
        });
      }
      const code = genCode();
      const expiresAt = new Date(Date.now() + CODE_TTL_MS);
      await prisma.emailChange.upsert({
        where: { partyId: ctx.partyId },
        create: { partyId: ctx.partyId, newEmail, codeHash: hashPassword(code), expiresAt, attempts: 0 },
        update: { newEmail, codeHash: hashPassword(code), expiresAt, attempts: 0, createdAt: new Date() },
      });
      const mail = emailChangeEmail(code);
      await sendMail({ to: newEmail, ...mail }); // sent to the NEW address
      return { sent: true as const, newEmail, devCode: devCodeFor(code) };
    }),

  confirmEmailChange: protectedProcedure
    .input(z.object({ code: z.string().min(4) }))
    .mutation(async ({ input, ctx }): Promise<Party> => {
      const row = await prisma.emailChange.findUnique({ where: { partyId: ctx.partyId } });
      if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: "Request an email change first." });
      if (row.expiresAt < new Date()) {
        await prisma.emailChange.delete({ where: { partyId: ctx.partyId } }).catch(() => {});
        throw new TRPCError({ code: "BAD_REQUEST", message: "That code has expired. Request a new one." });
      }
      if (row.attempts >= MAX_CODE_ATTEMPTS) {
        await prisma.emailChange.delete({ where: { partyId: ctx.partyId } }).catch(() => {});
        throw new TRPCError({ code: "BAD_REQUEST", message: "Too many attempts. Request a new code." });
      }
      if (!verifyPassword(input.code.trim(), row.codeHash)) {
        await prisma.emailChange.update({
          where: { partyId: ctx.partyId },
          data: { attempts: { increment: 1 } },
        });
        throw new TRPCError({ code: "BAD_REQUEST", message: "That code doesn't match. Try again." });
      }
      // Guard against the address being claimed between request and confirm.
      const taken = await prisma.party.findFirst({
        where: { email: row.newEmail, NOT: { id: ctx.partyId } },
      });
      if (taken) {
        await prisma.emailChange.delete({ where: { partyId: ctx.partyId } }).catch(() => {});
        throw new TRPCError({ code: "BAD_REQUEST", message: "That email is now in use." });
      }
      const updated = await prisma.party.update({
        where: { id: ctx.partyId },
        data: { email: row.newEmail, emailVerifiedAt: new Date() },
      });
      await prisma.emailChange.delete({ where: { partyId: ctx.partyId } });
      return toParty(updated);
    }),

  // Persist editable profile fields for the signed-in account. Identity-bearing
  // fields (email, role, verification, ratings) are deliberately NOT editable
  // here — email goes through the verified change flow; the rest are set by the
  // server elsewhere. Returns the fresh Party so the client can re-sync `me`.
  updateProfile: protectedProcedure
    .input(
      z.object({
        contactName: z.string().trim().min(1, "Name is required.").max(120).optional(),
        companyName: z.string().trim().min(1, "Company name is required.").max(160).optional(),
        phone: z.string().trim().max(40).optional(),
        province: z.string().trim().max(60).optional(),
        avatarUrl: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ input, ctx }): Promise<Party> => {
      const data: Prisma.PartyUpdateInput = {};
      if (input.contactName !== undefined) data.contactName = input.contactName;
      if (input.companyName !== undefined) data.companyName = input.companyName;
      if (input.phone !== undefined) data.phone = input.phone;
      if (input.province !== undefined) data.province = input.province;
      if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl || null;
      const updated = await prisma.party.update({ where: { id: ctx.partyId }, data });
      return toParty(updated);
    }),
});
