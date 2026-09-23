// Parties/users router. registerParty creates a PENDING account for admin
// review (email pre-verified client-side via a simulated OTP).
import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type {
  OnboardingData,
  OnboardingUserType,
  Party,
  Role,
  VerificationStatus,
} from "@/lib/tamp-types";
import { checkSaMobile } from "@/lib/phone";
import { hashPassword, verifyPassword } from "../auth";
import { emitEvent } from "../events";
import { prisma } from "../prisma";
import { protectedProcedure, publicProcedure, router } from "../trpc";

type PartyRow = Prisma.PartyGetPayload<object>;

const VERIFY_VALUES: VerificationStatus[] = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"];

const ROLE_BY_USER_TYPE: Record<OnboardingUserType, Role> = {
  CARGO_OWNER: "FREIGHT_OWNER",
  CARRIER: "TRANSPORTER",
  BROKER: "TRANSPORTER", // broker is not yet a first-class role; tagged via onboarding
  DRIVER: "DRIVER",
};

function toParty(row: PartyRow): Party {
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

const registerInput = z.object({
  userType: z.enum(["CARGO_OWNER", "CARRIER", "BROKER", "DRIVER"]),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().min(1),
  phone: z.string().refine((p) => checkSaMobile(p).valid, {
    message: "Enter a valid South African mobile number.",
  }),
  province: z.string(),
  password: z.string().min(6),
  code: z.string().min(4),
  business: z.any().optional(),
  driver: z.any().optional(),
  documents: z.array(z.string()).optional(),
});

const MAX_CODE_ATTEMPTS = 5;

// Gate account creation on a valid, unexpired verification code for this email.
// Consumes the code (deletes the row) only on success.
async function assertEmailVerified(email: string, code: string): Promise<void> {
  const row = await prisma.emailVerification.findUnique({ where: { email } });
  if (!row) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Request a verification code for this email first.",
    });
  }
  if (row.expiresAt < new Date()) {
    await prisma.emailVerification.delete({ where: { email } }).catch(() => {});
    throw new TRPCError({ code: "BAD_REQUEST", message: "That code has expired. Request a new one." });
  }
  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    await prisma.emailVerification.delete({ where: { email } }).catch(() => {});
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Too many incorrect attempts. Request a new code.",
    });
  }
  if (!verifyPassword(code.trim(), row.codeHash)) {
    await prisma.emailVerification.update({
      where: { email },
      data: { attempts: { increment: 1 } },
    });
    throw new TRPCError({ code: "BAD_REQUEST", message: "That code doesn't match. Try again." });
  }
  await prisma.emailVerification.delete({ where: { email } });
}

export const partiesRouter = router({
  list: publicProcedure.query(async (): Promise<Party[]> => {
    const rows = await prisma.party.findMany();
    return rows.map(toParty);
  }),

  register: publicProcedure
    .input(registerInput)
    .mutation(async ({ input }): Promise<{ id: string }> => {
      const email = input.email.toLowerCase();
      // Verify the emailed code before creating anything.
      await assertEmailVerified(email, input.code);

      const id = `P-USR-${Date.now().toString(36).toUpperCase()}`;
      const now = new Date().toISOString();
      const contactName = `${input.firstName} ${input.lastName}`.trim();
      const business = input.business as OnboardingData["business"] | undefined;
      const driver = input.driver as OnboardingData["driver"] | undefined;
      const companyName =
        business?.companyName?.trim() || driver?.fleetName?.trim() || contactName;
      const firstDoc = input.documents?.[0];

      const onboarding: OnboardingData = {
        userType: input.userType,
        firstName: input.firstName,
        lastName: input.lastName,
        ...(business ? { business } : {}),
        ...(driver ? { driver } : {}),
        ...(input.documents?.length ? { documents: input.documents } : {}),
      };

      try {
        await prisma.party.create({
          data: {
            id,
            role: ROLE_BY_USER_TYPE[input.userType],
            companyName,
            contactName,
            email,
            phone: checkSaMobile(input.phone).national ?? input.phone,
            province: input.province,
            verification: "PENDING",
            emailVerifiedAt: new Date(),
            ratingAvg: null,
            ratingCount: 0,
            suspended: false,
            avatarUrl: null,
            kycDocument: firstDoc
              ? ({ name: firstDoc, uploadedAt: now } as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            onboarding: onboarding as unknown as Prisma.InputJsonValue,
            passwordHash: hashPassword(input.password),
            createdAt: now,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          throw new Error("An account with this email already exists.");
        }
        throw e;
      }
      return { id };
    }),

  // Finish onboarding for a social-login account: pick a role and supply the
  // details registration would normally collect. Flips onboardingComplete.
  completeOnboarding: protectedProcedure
    .input(
      z.object({
        userType: z.enum(["CARGO_OWNER", "CARRIER", "BROKER", "DRIVER"]),
        companyName: z.string().min(1),
        phone: z.string().refine((p) => checkSaMobile(p).valid, {
          message: "Enter a valid South African mobile number.",
        }),
        province: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }): Promise<Party> => {
      const row = await prisma.party.update({
        where: { id: ctx.partyId },
        data: {
          role: ROLE_BY_USER_TYPE[input.userType],
          companyName: input.companyName.trim(),
          phone: checkSaMobile(input.phone).national ?? input.phone,
          province: input.province,
          onboarding: { userType: input.userType } as unknown as Prisma.InputJsonValue,
          onboardingComplete: true,
          verification: "PENDING",
        },
      });
      return toParty(row);
    }),

  // Look up a driver account by exact email so a fleet can assign them to a
  // truck without seeing the whole driver directory.
  findDriver: protectedProcedure
    .input(z.object({ email: z.string().min(1) }))
    .query(async ({ input }): Promise<Party | null> => {
      const row = await prisma.party.findFirst({
        where: { email: input.email.trim().toLowerCase(), role: "DRIVER" },
      });
      return row ? toParty(row) : null;
    }),

  // Admin-only: the rich sign-up application (business/driver details +
  // documents) for the verification queue to review.
  onboarding: protectedProcedure
    .input(z.object({ partyId: z.string().min(1) }))
    .query(async ({ input, ctx }): Promise<OnboardingData | null> => {
      const me = await prisma.party.findUnique({ where: { id: ctx.partyId } });
      if (me?.role !== "ADMIN") throw new TRPCError({ code: "FORBIDDEN" });
      const row = await prisma.party.findUnique({
        where: { id: input.partyId },
        select: { onboarding: true },
      });
      return (row?.onboarding as unknown as OnboardingData | null) ?? null;
    }),

  // The signed-in user submits a KYC document (already uploaded to the object
  // store — we persist its served URL + name). Submitting docs moves an
  // UNVERIFIED/REJECTED account into the PENDING review queue.
  uploadKyc: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(200), url: z.string().min(1) }))
    .mutation(async ({ input, ctx }): Promise<Party> => {
      const me = await prisma.party.findUnique({ where: { id: ctx.partyId } });
      if (!me) throw new TRPCError({ code: "UNAUTHORIZED" });
      const kyc = { name: input.name, url: input.url, uploadedAt: new Date().toISOString() };
      const moveToPending = me.verification === "UNVERIFIED" || me.verification === "REJECTED";
      const updated = await prisma.party.update({
        where: { id: ctx.partyId },
        data: {
          kycDocument: kyc as unknown as Prisma.InputJsonValue,
          ...(moveToPending ? { verification: "PENDING" } : {}),
        },
      });
      return toParty(updated);
    }),

  // Admin-only. The status change AND its audit trail are written server-side in
  // one transaction — the actor can no longer forge their own audit rows, and a
  // non-admin can't change anyone's verification.
  setVerification: protectedProcedure
    .input(z.object({ partyId: z.string().min(1), status: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const me = await prisma.party.findUnique({ where: { id: ctx.partyId } });
      if (me?.role !== "ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only an admin can change verification." });
      }
      if (!VERIFY_VALUES.includes(input.status as VerificationStatus)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid verification status." });
      }
      const subject = await prisma.party.findUnique({ where: { id: input.partyId } });
      if (!subject) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });

      const audit = {
        id: `EV-${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString("hex").toUpperCase()}`,
        eventType: "VERIFICATION_CHANGED",
        eventId: "EVT-05",
        actorId: me.id,
        actorRole: "ADMIN" as const,
        subjectType: "USER" as const,
        subjectId: subject.id,
        summary: `${subject.companyName} verification set to ${input.status} by admin.`,
        before: { verification: subject.verification },
        after: { verification: input.status },
        at: new Date().toISOString(),
      };

      await prisma.$transaction([
        prisma.party.update({ where: { id: input.partyId }, data: { verification: input.status } }),
        prisma.auditEvent.create({ data: { id: audit.id, data: audit as unknown as Prisma.InputJsonValue } }),
      ]);

      // Tell the affected user their verification changed.
      const verified = input.status === "VERIFIED";
      await emitEvent({
        event: "VERIFICATION_CHANGED",
        notifications: [
          {
            partyId: subject.id,
            title: verified ? "Account verified" : "Verification updated",
            detail: `Your account verification is now ${input.status}.`,
            tone: verified ? "positive" : input.status === "REJECTED" ? "critical" : "info",
            subjectType: "USER",
            subjectId: subject.id,
          },
        ],
        webhook: { data: { partyId: subject.id, verification: input.status }, involvedPartyIds: [subject.id] },
      });
      return { ok: true as const };
    }),
});
