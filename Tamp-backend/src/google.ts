// Google OAuth 2.0 (server-side code flow). We keep the app's own session
// system — Google is just an alternative way to arrive at a Party + session
// cookie. The ID token is received directly from Google's token endpoint over
// TLS (server-to-server), so per Google's guidance its signature need not be
// re-verified here.
import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";

export const CLIENT_ID = () => process.env["GOOGLE_CLIENT_ID"] ?? "";
export const CLIENT_SECRET = () => process.env["GOOGLE_CLIENT_SECRET"] ?? "";

export function googleConfigured(): boolean {
  return !!(CLIENT_ID() && CLIENT_SECRET());
}

export const OAUTH_STATE_COOKIE = "g_oauth_state";

export function newState(): string {
  return randomBytes(16).toString("hex");
}

export function stateCookie(state: string): string {
  return `${OAUTH_STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`;
}
export function clearedStateCookie(): string {
  return `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function authUrl(redirectUri: string, state: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", CLIENT_ID());
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("access_type", "online");
  u.searchParams.set("prompt", "select_account");
  return u.toString();
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

// Exchange the authorization code for tokens and decode the ID token payload.
export async function exchangeCode(code: string, redirectUri: string): Promise<GoogleIdentity> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("Google response had no id_token");

  const payloadB64 = data.id_token.split(".")[1];
  if (!payloadB64) throw new Error("Malformed id_token");
  const json = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  );
  const p = JSON.parse(json) as {
    sub: string;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
    given_name?: string;
    family_name?: string;
  };
  return {
    sub: p.sub,
    email: (p.email ?? "").toLowerCase(),
    emailVerified: p.email_verified === true || p.email_verified === "true",
    name:
      p.name ||
      [p.given_name, p.family_name].filter(Boolean).join(" ") ||
      p.email ||
      "there",
  };
}

// Resolve a Google identity to a Party, creating one (needing onboarding) for a
// brand-new user. Returns the Party id and whether onboarding is still needed.
export async function findOrCreatePartyFromGoogle(
  g: GoogleIdentity,
): Promise<{ partyId: string; needsOnboarding: boolean }> {
  // 1) Known Google identity → its Party.
  const linked = await prisma.oAuthAccount.findUnique({
    where: { provider_providerId: { provider: "google", providerId: g.sub } },
    select: { partyId: true, party: { select: { onboardingComplete: true } } },
  });
  if (linked) {
    return { partyId: linked.partyId, needsOnboarding: !linked.party.onboardingComplete };
  }

  // 2) Existing account with the same email → link Google to it.
  if (g.email) {
    const existing = await prisma.party.findUnique({ where: { email: g.email } });
    if (existing) {
      await prisma.oAuthAccount.create({
        data: { provider: "google", providerId: g.sub, partyId: existing.id },
      });
      return { partyId: existing.id, needsOnboarding: !existing.onboardingComplete };
    }
  }

  // 3) Brand-new user → create a Party that must finish onboarding (pick a role,
  // supply phone/province) before it can transact. Email is Google-verified.
  const id = `P-USR-${Date.now().toString(36).toUpperCase()}`;
  await prisma.party.create({
    data: {
      id,
      role: "FREIGHT_OWNER", // placeholder until they pick a role in onboarding
      companyName: g.name,
      contactName: g.name,
      email: g.email,
      phone: "",
      province: "GP",
      verification: "PENDING",
      ratingAvg: null,
      ratingCount: 0,
      suspended: false,
      avatarUrl: null,
      emailVerifiedAt: g.emailVerified ? new Date() : null,
      onboardingComplete: false,
      passwordHash: null,
      createdAt: new Date().toISOString(),
      oauthAccounts: { create: { provider: "google", providerId: g.sub } },
    },
  });
  return { partyId: id, needsOnboarding: true };
}
