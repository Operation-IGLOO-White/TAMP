// GET /api/auth/google — begin Google sign-in: set a CSRF state cookie and
// redirect to Google's consent screen.
import type { Request, Response } from "express";
import { authUrl, googleConfigured, newState, stateCookie } from "../google";

const FRONTEND_URL = () => process.env["FRONTEND_URL"] ?? "http://localhost:3000";

export function googleAuthHandler(req: Request, res: Response): void {
  if (!googleConfigured()) {
    res.redirect(`${FRONTEND_URL()}/?error=google_not_configured`);
    return;
  }
  const origin = `${req.protocol}://${req.get("host")}`;
  const redirectUri = `${origin}/api/auth/google/callback`;
  const state = newState();
  res.setHeader("Set-Cookie", stateCookie(state));
  res.redirect(authUrl(redirectUri, state));
}
