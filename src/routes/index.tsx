"use client";

import { Link, useNavigate } from "@/lib/nav";
import { Clock, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HOME_BY_ROLE } from "@/lib/role-routes";
import { useTamp } from "@/lib/tamp-store";
import type { Party } from "@/lib/tamp-types";

const OAUTH_ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in isn't configured yet.",
  google_denied: "Google sign-in was cancelled.",
  google_state: "Google sign-in expired. Please try again.",
  google_no_email: "Google didn't share an email address.",
  google_failed: "Couldn't sign in with Google. Please try again.",
};

function Landing() {
  const { loads, trucks, matches, login, authParty, authReady } = useTamp();
  const navigate = useNavigate();
  const [email, setEmail] = useState("n.khumalo@highveldlog.co.za");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  // Single, deduped redirect. Both the effect below (returning user / Google
  // callback) and a fresh sign-in call this; the ref guarantees we navigate
  // once. `replace` keeps the login page out of history. The overlay it turns
  // on covers the (dev-compile) navigation gap so it never looks frozen.
  const didRedirect = useRef(false);
  const goHome = (party: Party) => {
    if (didRedirect.current) return;
    didRedirect.current = true;
    setRedirecting(true);
    navigate({
      to: party.onboardingComplete === false ? "/welcome" : HOME_BY_ROLE[party.role],
      replace: true,
    });
  };

  // Already signed in (incl. arriving back from a Google sign-in that set the
  // session cookie) → go to onboarding or the right dashboard.
  useEffect(() => {
    if (authReady && authParty) goHome(authParty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, authParty]);

  // Surface an OAuth error passed back as ?error=… by the callback, or a
  // ?timeout flag set when the session was ended for inactivity.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    if (code) setError(OAUTH_ERRORS[code] ?? "Sign-in failed. Please try again.");
    if (params.get("timeout")) setNotice("You were signed out after a period of inactivity.");
  }, []);

  const loadsPosted = loads.length;
  const trucksAvailable = trucks.filter((t) => t.status === "AVAILABLE").length;
  const matchesAccepted = matches.filter(
    (m) => m.status === "ACCEPTED" || m.status === "CONFIRMED",
  ).length;

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const party = await login(email.trim(), password);
      goHome(party); // busy stays true — the overlay carries us to the dashboard
    } catch {
      setError("Invalid email or password.");
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      {/* Redirect overlay — a smooth, animated hand-off to the dashboard that
          also covers the first-navigation compile so it never looks stuck. */}
      {redirecting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
          <span className="grid size-12 place-items-center rounded-xl bg-signal font-extrabold text-signal-foreground shadow-lg animate-in zoom-in-50 duration-300">
            T
          </span>
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Signing you in…
          </div>
        </div>
      )}

      <section className="flex flex-col justify-center border-b border-border bg-graphite p-8 md:border-b-0 md:border-r md:p-14">
        <div className="mb-8 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-signal font-extrabold text-signal-foreground">
            T
          </span>
          <span className="text-xl font-extrabold tracking-tight">TAMP</span>
        </div>
        <h1 className="max-w-md text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
          Loads and trucks, matched by rules you can see.
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          TAMP connects South African freight owners with available truck capacity through
          rule-based matching, traceable acceptance and trip oversight — no black box, no unlabelled
          simulation.
        </p>

        <div className="mt-10 grid max-w-md grid-cols-3 gap-4">
          <Counter label="Loads posted" value={loadsPosted} />
          <Counter label="Trucks available" value={trucksAvailable} />
          <Counter label="Matches accepted" value={matchesAccepted} />
        </div>
      </section>

      <section className="flex flex-col justify-center p-8 md:p-14">
        <form onSubmit={signIn} className="mx-auto w-full max-w-sm space-y-5 animate-slide">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Sign in</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Welcome back. Use the demo credentials below or your own.
            </p>
          </div>

          {notice && (
            <div className="flex items-center gap-2 rounded-md border border-signal/40 bg-signal/10 px-3 py-2 text-xs font-medium text-foreground">
              <Clock className="size-4 shrink-0 text-signal" /> {notice}
            </div>
          )}

          {/* Social sign-in */}
          <a
            href="/api/auth/google"
            className="flex w-full items-center justify-center gap-2.5 rounded-md border border-border bg-background py-2.5 text-sm font-semibold text-foreground hover:bg-steel/30"
          >
            <GoogleIcon /> Continue with Google
          </a>

          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or sign in with email{" "}
            <span className="h-px flex-1 bg-border" />
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Password
              <Link
                to="/forgot-password"
                className="normal-case text-signal hover:underline"
              >
                Forgot password?
              </Link>
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
          </label>

          {error && <p className="text-center text-xs font-medium text-danger">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-signal py-2.5 text-sm font-bold uppercase tracking-wide text-signal-foreground transition-all hover:brightness-105 disabled:opacity-70"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-center text-xs text-muted-foreground">
            New to TAMP?{" "}
            <Link to="/register" className="font-semibold text-signal hover:underline">
              Register an account
            </Link>
          </p>

          <p className="text-center text-[11px] text-muted-foreground">
            Demo accounts use password{" "}
            <span className="font-mono text-foreground">demo1234</span>.
          </p>
        </form>
      </section>
    </main>
  );
}

const inputCls =
  "w-full rounded-md border border-border bg-graphite px-3 py-2.5 text-sm text-foreground outline-none focus:border-signal";

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-mono text-2xl font-bold text-foreground">{value}</div>
      <div className="mt-1 text-[10px] uppercase leading-tight tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.85 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.67-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06L5.85 9.9C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

export default Landing;
