import { Link, useNavigate } from "@/lib/nav";
import {
  Activity,
  ArrowRight,
  Clock,
  Loader2,
  LockKeyhole,
  Mail,
  Radar,
  Route,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HOME_BY_ROLE } from "@/lib/role-routes";
import { useTamp } from "@/context/TampContext";
import { PasswordInput } from "@/components/tamp/PasswordInput";
import { BrandLogo } from "@/components/tamp/BrandLogo";
import type { Party } from "@/types/domain";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <main className="login-page relative min-h-[100svh] overflow-hidden bg-[#071018] text-white">
      <div className="login-backdrop absolute inset-0" aria-hidden>
        <img
          src="/tamp-login-hero.webp"
          alt=""
          className="login-backdrop-image size-full object-cover"
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,9,14,.88)_0%,rgba(3,9,14,.52)_48%,rgba(3,9,14,.72)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,8,13,.28)_0%,rgba(2,8,13,.08)_45%,rgba(2,8,13,.86)_100%)]" />
        <div className="login-ambient absolute -right-32 top-1/4 size-[34rem] rounded-full bg-signal/10 blur-[120px]" />
      </div>

      {/* Redirect overlay — a smooth, animated hand-off to the dashboard that
          also covers the first-navigation compile so it never looks stuck. */}
      {redirecting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#071018]/90 backdrop-blur-xl animate-in fade-in duration-300">
          <BrandLogo className="h-14 animate-in zoom-in-50 duration-300" priority />
          <div className="flex items-center gap-2 text-sm font-semibold text-white/65">
            <Loader2 className="size-4 animate-spin" /> Signing you in…
          </div>
        </div>
      )}

      <header className="login-reveal relative z-20 mx-auto flex w-full max-w-[1480px] items-center justify-between px-6 py-6 sm:px-10 lg:px-14 lg:py-8">
        <LoginBrandLogo />
        <div className="hidden items-center gap-5 text-[10px] font-bold uppercase tracking-[0.35em] text-white/60 sm:flex">
          <span>Track</span>
          <i className="h-3 w-px bg-white/25" />
          <span>Manage</span>
          <i className="h-3 w-px bg-white/25" />
          <span>Move</span>
          <i className="h-3 w-px bg-white/25" />
          <span>Perform</span>
          <i className="ml-1 h-px w-10 bg-signal" />
        </div>
      </header>

      <div className="relative z-10 mx-auto grid min-h-[calc(100svh-110px)] w-full max-w-[1480px] items-center gap-10 px-6 pb-10 sm:px-10 lg:grid-cols-[1.1fr_.9fr] lg:px-14 lg:pb-16">
        <section className="login-copy max-w-2xl self-center pb-4 pt-6 lg:pb-24">
          <div className="login-reveal login-delay-1 mb-6 flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.42em] text-white/70 sm:text-xs">
            Cargo transportation <span className="h-px w-12 bg-white/55" />
          </div>
          <h1 className="login-reveal login-delay-2 text-4xl font-extrabold leading-[1.06] tracking-[-0.045em] sm:text-5xl lg:text-6xl xl:text-[4.6rem]">
            Loads and trucks,
            <span className="mt-1 block text-signal">matched in full view.</span>
          </h1>
          <p className="login-reveal login-delay-3 mt-7 max-w-xl text-sm leading-7 text-white/68 sm:text-base">
            TAMP connects South African freight owners with trusted truck capacity through
            explainable matching, live visibility and accountable operations.
          </p>

          <div className="login-reveal login-delay-4 mt-9 flex flex-wrap gap-3">
            <div className="login-stat">
              <strong>{loadsPosted}</strong>
              <span>Loads posted</span>
            </div>
            <div className="login-stat">
              <strong>{trucksAvailable}</strong>
              <span>Trucks ready</span>
            </div>
            <div className="login-stat">
              <strong>{matchesAccepted}</strong>
              <span>Matches accepted</span>
            </div>
          </div>

          <div className="login-reveal login-delay-5 mt-12 hidden flex-wrap items-center gap-x-8 gap-y-4 lg:flex">
            <Feature icon={Radar} label="Smart matching" />
            <Feature icon={Activity} label="Real-time visibility" />
            <Feature icon={ShieldCheck} label="Trusted operations" />
          </div>
        </section>

        <section className="login-reveal login-delay-2 flex items-center justify-center lg:justify-end">
          <form
            onSubmit={signIn}
            className="login-card w-full max-w-[510px] rounded-[28px] border border-white/20 p-6 shadow-2xl sm:p-9 lg:p-11"
          >
            <div className="mb-8">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Sign in</h2>
              <p className="mt-2 text-sm text-white/58">
                Welcome back. Enter your TAMP account details.
              </p>
            </div>

            {notice && (
              <div className="mb-5 flex items-center gap-2 rounded-xl border border-signal/30 bg-signal/10 px-3 py-2.5 text-xs font-medium text-white">
                <Clock className="size-4 shrink-0 text-signal" /> {notice}
              </div>
            )}

            <div className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.18em] text-white/68">
                  Email
                </span>
                <span className="group relative block">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/40 transition-colors group-focus-within:text-signal" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${inputCls} pl-11`}
                    placeholder="Enter your email address"
                    autoComplete="email"
                    required
                  />
                </span>
              </label>
              <label className="block">
                <span className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-white/68">
                  Password
                  <Link
                    to="/forgot-password"
                    className="normal-case tracking-normal text-signal transition-colors hover:text-white"
                  >
                    Forgot password?
                  </Link>
                </span>
                <span className="group relative block">
                  <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-white/40 transition-colors group-focus-within:text-signal" />
                  <PasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputCls} pl-11`}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />
                </span>
              </label>

              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-center text-xs font-medium text-red-300"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="login-submit group flex w-full items-center justify-center gap-3 rounded-xl bg-signal py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-signal-foreground shadow-[0_12px_34px_rgba(235,170,0,.2)] transition-all duration-300 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_18px_40px_rgba(235,170,0,.3)] disabled:translate-y-0 disabled:opacity-70"
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {busy ? "Signing in…" : "Sign in"}
                {!busy && (
                  <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
                )}
              </button>
            </div>

            <p className="mt-6 text-center text-xs text-white/52">
              New to TAMP?{" "}
              <Link
                to="/register"
                className="font-semibold text-signal transition-colors hover:text-white"
              >
                Register an account
              </Link>
            </p>
          </form>
        </section>
      </div>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-px bg-gradient-to-r from-transparent via-signal/70 to-transparent" />
    </main>
  );
}

const inputCls =
  "w-full rounded-xl border border-white/15 bg-white/[0.045] px-4 py-3.5 text-sm text-white outline-none transition-all duration-300 placeholder:text-white/28 hover:border-white/25 focus:border-signal/70 focus:bg-white/[0.07] focus:shadow-[0_0_0_3px_rgba(235,170,0,.08)]";

function Feature({ icon: Icon, label }: { icon: typeof Route; label: string }) {
  return (
    <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/65">
      <span className="grid size-9 place-items-center rounded-full border border-white/15 bg-white/5 backdrop-blur-sm">
        <Icon className="size-4 text-signal" />
      </span>
      {label}
    </div>
  );
}

function LoginBrandLogo() {
  return (
    <span className="relative block h-11 w-[132px] sm:h-13 sm:w-[156px]" aria-label="TAMP ON">
      <img
        src="/tamp-logo.png"
        alt=""
        className="absolute inset-0 size-full object-contain brightness-0 invert"
        fetchPriority="high"
      />
      <img
        src="/tamp-logo.png"
        alt=""
        aria-hidden
        className="absolute inset-0 size-full object-contain [clip-path:inset(0_0_0_51%)]"
        fetchPriority="high"
      />
    </span>
  );
}

export default Landing;
