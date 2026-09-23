"use client";

import { useNavigate } from "@/lib/nav";
import { Boxes, Briefcase, CheckCircle2, IdCard, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { completeOnboarding } from "@/fns/parties";
import { checkSaMobile } from "@/lib/phone";
import { HOME_BY_ROLE } from "@/lib/role-routes";
import { useTamp } from "@/lib/tamp-store";
import type { OnboardingUserType } from "@/lib/tamp-types";

const PROVINCES = ["GP", "KZN", "WC", "EC", "FS", "NW", "LP", "MP", "NC"];

const TYPES: { value: OnboardingUserType; label: string; blurb: string; icon: typeof Truck }[] = [
  { value: "CARGO_OWNER", label: "Cargo Owner", blurb: "I have freight to move.", icon: Boxes },
  { value: "CARRIER", label: "Carrier / Truck Owner", blurb: "I operate trucks.", icon: Truck },
  { value: "DRIVER", label: "Truck Driver", blurb: "I drive — for myself or a fleet.", icon: IdCard },
  { value: "BROKER", label: "Broker / Business", blurb: "I broker loads between parties.", icon: Briefcase },
];

function Welcome() {
  const { authParty, authReady, refreshAuth } = useTamp();
  const navigate = useNavigate();

  const [userType, setUserType] = useState<OnboardingUserType | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [province, setProvince] = useState("GP");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Prefill the name Google gave us; bounce out if not signed in / already done.
  useEffect(() => {
    if (!authReady) return;
    if (!authParty) navigate({ to: "/" });
    else if (authParty.onboardingComplete !== false) navigate({ to: HOME_BY_ROLE[authParty.role] });
    else if (!companyName) setCompanyName(authParty.companyName ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, authParty]);

  const phoneCheck = checkSaMobile(phone);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userType) return setError("Choose how you'll use TAMP.");
    if (!companyName.trim()) return setError("Enter your name or company.");
    if (!phoneCheck.valid) return setError("Enter a valid South African mobile number.");
    setError("");
    setBusy(true);
    try {
      await completeOnboarding({ userType, companyName: companyName.trim(), phone, province });
      const party = await refreshAuth();
      navigate({ to: party ? HOME_BY_ROLE[party.role] : "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  const isDriver = userType === "DRIVER";
  const nameLabel =
    userType === "CARGO_OWNER" ? "Company name" : isDriver ? "Fleet name (or your own name)" : "Company name";

  return (
    <main className="min-h-screen overflow-y-auto bg-background">
      <div className="mx-auto max-w-lg space-y-6 p-6 sm:py-12">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Welcome to TAMP</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You're signed in{authParty?.email ? ` as ${authParty.email}` : ""}. Tell us how you'll
            use TAMP to finish setting up your account.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          {/* Role picker */}
          <div className="space-y-2">
            {TYPES.map((t) => {
              const active = userType === t.value;
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setUserType(t.value)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? "border-signal bg-signal/10"
                      : "border-border bg-graphite hover:border-signal/50"
                  }`}
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                      active ? "bg-signal text-signal-foreground" : "bg-steel/50 text-muted-foreground"
                    }`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{t.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{t.blurb}</span>
                  </span>
                  {active && <CheckCircle2 className="size-5 shrink-0 text-signal" />}
                </button>
              );
            })}
          </div>

          {userType && (
            <div className="space-y-4 rounded-xl border border-border bg-graphite/40 p-4">
              <Field label={nameLabel}>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className={inputCls}
                  required
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mobile number">
                  <div className="relative">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="082 123 4567"
                      className={`${inputCls} pr-9 ${phone && !phoneCheck.valid ? "border-danger" : ""}`}
                    />
                    {phone && phoneCheck.valid && (
                      <CheckCircle2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-positive" />
                    )}
                  </div>
                </Field>
                <Field label="Province">
                  <select
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    className={inputCls}
                  >
                    {PROVINCES.map((p) => (
                      <option key={p} value={p} className="bg-graphite">
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          )}

          {error && <p className="text-xs font-medium text-danger">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-signal py-3 text-sm font-bold uppercase tracking-wide text-signal-foreground hover:brightness-105 disabled:opacity-50"
          >
            {busy ? "Setting up…" : "Finish setup"}
          </button>
          <p className="text-center text-[11px] text-muted-foreground">
            Your account is created in a pending state and an administrator verifies it before you
            can transact.
          </p>
        </form>
      </div>
    </main>
  );
}

const inputCls =
  "w-full rounded-md border border-border bg-graphite px-3 py-2 text-sm outline-none focus:border-signal";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export default Welcome;
