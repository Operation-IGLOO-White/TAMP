// GET /api/auth/google/callback — Google redirects here with a code. Verify the
// CSRF state, exchange the code, resolve/create the Party, set the app session
// cookie, and send the user back to the frontend (to onboarding if they're new).
import type { Request, Response } from "express";
import { createSession, readCookie, sessionCookie } from "../auth";
import {
  clearedStateCookie,
  exchangeCode,
  findOrCreatePartyFromGoogle,
  googleConfigured,
  OAUTH_STATE_COOKIE,
} from "../google";

const FRONTEND_URL = () => process.env["FRONTEND_URL"] ?? "http://localhost:3000";

export async function googleCallbackHandler(req: Request, res: Response): Promise<void> {
  const origin = `${req.protocol}://${req.get("host")}`;

  const fail = (reason: string) => {
    res.setHeader("Set-Cookie", clearedStateCookie());
    res.redirect(`${FRONTEND_URL()}/?error=${reason}`);
  };

  if (!googleConfigured()) return fail("google_not_configured");
  if (req.query["error"]) return fail("google_denied");

  const code = typeof req.query["code"] === "string" ? req.query["code"] : null;
  const state = typeof req.query["state"] === "string" ? req.query["state"] : null;
  const expectedState = readCookie(req.headers["cookie"] ?? null, OAUTH_STATE_COOKIE);
  if (!code || !state || !expectedState || state !== expectedState) {
    return fail("google_state");
  }

  try {
    const identity = await exchangeCode(code, `${origin}/api/auth/google/callback`);
    if (!identity.email) return fail("google_no_email");

    const { partyId, needsOnboarding } = await findOrCreatePartyFromGoogle(identity);
    const token = await createSession(partyId);

    const dest = needsOnboarding ? "/welcome" : "/";
    res.setHeader("Set-Cookie", [sessionCookie(token), clearedStateCookie()]);
    res.redirect(`${FRONTEND_URL()}${dest}`);
  } catch {
    fail("google_failed");
  }
}
