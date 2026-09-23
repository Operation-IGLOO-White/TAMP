"use client";

import { Link, useNavigate } from "@/lib/nav";
import { ArrowLeft, KeyRound, MailCheck } from "lucide-react";
import { useState } from "react";
import { requestPasswordReset, resetPassword } from "@/fns/auth";

function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "reset" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await requestPasswordReset(email.trim());
      setDevCode(res.devCode);
      setStep("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send a code. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("Use a password of at least 6 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    try {
      await resetPassword(email.trim(), code.trim(), password);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-signal font-extrabold text-signal-foreground">
            T
          </span>
          <span className="text-xl font-extrabold tracking-tight">TAMP</span>
        </div>

        {step === "email" && (
          <form onSubmit={sendCode} className="space-y-4">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
                <KeyRound className="size-5 text-signal" /> Reset your password
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter your account email and we'll send you a 6-digit code.
              </p>
            </div>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                required
                autoFocus
              />
            </Field>
            {error && <p className="text-xs font-medium text-danger">{error}</p>}
            <button type="submit" disabled={busy} className={btnCls}>
              {busy ? "Sending…" : "Send reset code"}
            </button>
            <BackToLogin />
          </form>
        )}

        {step === "reset" && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h1 className="text-lg font-bold tracking-tight">Enter code & new password</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                If an account exists for <span className="font-semibold text-foreground">{email}</span>, a
                code is on its way.
              </p>
            </div>
            {devCode && (
              <div className="rounded-md border border-dashed border-signal/50 bg-signal/5 px-3 py-2 text-center text-[11px] text-muted-foreground">
                Dev mode — code:{" "}
                <span className="font-mono text-base font-bold tracking-widest text-foreground">
                  {devCode}
                </span>
              </div>
            )}
            <Field label="6-digit code">
              <input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${inputCls} text-center font-mono tracking-[0.4em]`}
                placeholder="000000"
                required
                autoFocus
              />
            </Field>
            <Field label="New password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                required
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputCls}
                required
              />
            </Field>
            {error && <p className="text-xs font-medium text-danger">{error}</p>}
            <button type="submit" disabled={busy} className={btnCls}>
              {busy ? "Resetting…" : "Reset password"}
            </button>
            <BackToLogin />
          </form>
        )}

        {step === "done" && (
          <div className="space-y-4 text-center">
            <MailCheck className="mx-auto size-10 text-positive" />
            <h1 className="text-lg font-bold tracking-tight">Password reset</h1>
            <p className="text-xs text-muted-foreground">
              Your password has been changed and you've been signed out of all devices. Sign in with
              your new password.
            </p>
            <button onClick={() => navigate({ to: "/" })} className={btnCls}>
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

const inputCls =
  "w-full rounded-md border border-border bg-graphite px-3 py-2.5 text-sm text-foreground outline-none focus:border-signal";
const btnCls =
  "w-full rounded-md bg-signal py-2.5 text-sm font-bold uppercase tracking-wide text-signal-foreground hover:brightness-105 disabled:opacity-50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function BackToLogin() {
  return (
    <Link
      to="/"
      className="flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" /> Back to sign in
    </Link>
  );
}

export default ForgotPassword;
