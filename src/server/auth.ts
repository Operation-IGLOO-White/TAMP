// Server-side auth helpers: password hashing (scrypt) and session cookies.
// No external deps — uses Node's crypto. Sessions are opaque tokens stored in
// the `sessions` table and referenced by an httpOnly cookie.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "tamp_session";
const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const known = Buffer.from(hash, "hex");
  return known.length === test.length && timingSafeEqual(known, test);
}

export async function createSession(partyId: string): Promise<string> {
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await prisma.session.create({ data: { id, partyId, expiresAt } });
  void maybeGc(); // opportunistic cleanup of expired rows
  return id;
}

// Sign out every OTHER session for a party (keep the current one). Used after a
// password change so a stolen session elsewhere is invalidated.
export async function destroyOtherSessions(partyId: string, keepToken: string | null): Promise<number> {
  const res = await prisma.session.deleteMany({
    where: { partyId, ...(keepToken ? { NOT: { id: keepToken } } : {}) },
  });
  return res.count;
}

// Sign out everywhere (all sessions for a party). Used after a password reset.
export async function destroyAllSessions(partyId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { partyId } });
}

// Delete expired sessions and expired verification/reset/change codes. Safe to
// run anytime; used opportunistically and by the `db:gc` script (for cron).
export async function gcExpired(): Promise<void> {
  const now = new Date();
  await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.emailVerification.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.passwordReset.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.emailChange.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
}

// Throttle opportunistic GC to at most once per hour per process.
let lastGc = 0;
async function maybeGc(): Promise<void> {
  if (Date.now() - lastGc < 3_600_000) return;
  lastGc = Date.now();
  try {
    await gcExpired();
  } catch {
    /* best-effort */
  }
}

export async function partyFromCookie(cookieHeader: string | null): Promise<string | null> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { id: token } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.partyId;
}

export async function destroySession(token: string | null): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { id: token } });
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

// `Secure` in production so the session cookie is only ever sent over HTTPS.
// Omitted in dev — a Secure cookie wouldn't be stored over plain-HTTP localhost.
const SECURE = process.env["NODE_ENV"] === "production" ? " Secure;" : "";

export function sessionCookie(token: string): string {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly;${SECURE} SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearedCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly;${SECURE} SameSite=Lax; Max-Age=0`;
}
