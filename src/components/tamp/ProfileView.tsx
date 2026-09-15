"use client";

import { useNavigate } from "@/lib/nav";
import { BadgeCheck, Camera, Lock, LogOut, Star, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  changePassword as changePasswordFn,
  confirmEmailChange,
  logoutOtherSessions,
  requestEmailChange,
} from "@/fns/auth";
import { uploadKycDocument } from "@/fns/parties";
import { uploadFile } from "@/fns/upload";
import { ROLE_SHORT } from "@/lib/role-routes";
import { useTamp } from "@/lib/tamp-store";
import type { Party } from "@/lib/tamp-types";
import { Avatar } from "./Avatar";

const PROVINCES = ["GP", "WC", "KZN", "EC", "FS", "NW", "LP", "MP", "NC"];

const VERIFICATION_TONE: Record<Party["verification"], string> = {
  VERIFIED: "bg-positive/15 text-positive",
  PENDING: "bg-signal/20 text-signal-foreground",
  UNVERIFIED: "bg-steel text-muted-foreground",
  REJECTED: "bg-danger/15 text-danger",
};

type Tab = "profile" | "security" | "verification";

const NAV: { key: Tab; label: string; icon: typeof User }[] = [
  { key: "profile", label: "Profile", icon: User },
  { key: "security", label: "Security", icon: Lock },
  { key: "verification", label: "Verification", icon: BadgeCheck },
];

export function ProfileView() {
  const { me, role, updateProfile, logout } = useTamp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("profile");

  return (
    <div className="min-h-full bg-background/40 p-4 sm:p-6">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-[260px_1fr] lg:items-start">
        {/* ── Left settings nav ─────────────────────────────── */}
        <aside className="overflow-hidden rounded-2xl border border-border bg-graphite">
          <div className="flex items-center gap-3 border-b border-border p-4">
            <Avatar party={me} size="sm" />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold leading-tight">{me.contactName}</div>
              <div className="truncate text-[11px] text-muted-foreground">{ROLE_SHORT[role]}</div>
            </div>
          </div>
          <nav className="p-2">
            <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Your account
            </div>
            {NAV.map(({ key, label, icon: Icon }) => {
              const on = tab === key;
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    on ? "bg-steel text-foreground" : "text-muted-foreground hover:bg-steel/50 hover:text-foreground"
                  }`}
                >
                  <Icon className="size-[18px]" /> {label}
                </button>
              );
            })}
            <div className="my-2 border-t border-border" />
            <button
              onClick={async () => {
                await logout();
                navigate({ to: "/" });
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <LogOut className="size-[18px]" /> Sign out
            </button>
          </nav>
        </aside>

        {/* ── Right panel ───────────────────────────────────── */}
        <section className="overflow-hidden rounded-2xl border border-border bg-graphite">
          {tab === "profile" && <ProfileTab me={me} updateProfile={updateProfile} />}
          {tab === "security" && <SecurityTab me={me} />}
          {tab === "verification" && <VerificationTab me={me} role={role} />}
        </section>
      </div>
    </div>
  );
}

// ── Profile tab ──────────────────────────────────────────────
function ProfileTab({
  me,
  updateProfile,
}: {
  me: Party;
  updateProfile: (patch: Partial<Party>) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [first, setFirst] = useState(me.contactName.split(" ")[0] ?? "");
  const [last, setLast] = useState(me.contactName.split(" ").slice(1).join(" "));
  const [companyName, setCompanyName] = useState(me.companyName);
  const [phone, setPhone] = useState(me.phone);
  const [province, setProvince] = useState(me.province);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(me.avatarUrl);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    setFirst(me.contactName.split(" ")[0] ?? "");
    setLast(me.contactName.split(" ").slice(1).join(" "));
    setCompanyName(me.companyName);
    setPhone(me.phone);
    setProvince(me.province);
    setAvatarUrl(me.avatarUrl);
    setSaved(false);
  }, [me]);

  const dirty =
    `${first} ${last}`.trim() !== me.contactName ||
    companyName !== me.companyName ||
    phone !== me.phone ||
    province !== me.province ||
    (avatarUrl ?? "") !== (me.avatarUrl ?? "");

  const reset = () => {
    setFirst(me.contactName.split(" ")[0] ?? "");
    setLast(me.contactName.split(" ").slice(1).join(" "));
    setCompanyName(me.companyName);
    setPhone(me.phone);
    setProvince(me.province);
    setAvatarUrl(me.avatarUrl);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        contactName: `${first} ${last}`.trim(),
        companyName,
        phone,
        province,
        avatarUrl,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-xl font-extrabold tracking-tight">Account</h2>
      </div>

      <div className="space-y-6 p-6">
        {/* Profile picture */}
        <div className="flex flex-wrap items-center gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="size-16 rounded-full object-cover" />
          ) : (
            <Avatar party={me} size="lg" />
          )}
          <div>
            <div className="mb-1.5 text-sm font-bold">Profile Picture</div>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = ""; // allow re-selecting the same file
                  if (!f) return;
                  setUploadingAvatar(true);
                  setError(null);
                  try {
                    // Real upload to the object store; persist the served URL on
                    // Save. No more throwaway blob: URLs lost on reload.
                    const up = await uploadFile(f, "AVATAR");
                    setAvatarUrl(up.url);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Upload failed.");
                  } finally {
                    setUploadingAvatar(false);
                  }
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploadingAvatar}
                className="inline-flex items-center gap-1.5 rounded-lg bg-signal px-3.5 py-2 text-sm font-semibold text-signal-foreground hover:brightness-105 disabled:opacity-50"
              >
                <Camera className="size-4" /> {uploadingAvatar ? "Uploading…" : "Upload Image"}
              </button>
              <button
                onClick={() => setAvatarUrl(undefined)}
                className="rounded-lg border border-border px-3.5 py-2 text-sm font-semibold hover:bg-steel/40"
              >
                Remove
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              We support PNGs, JPEGs and GIFs under 10MB
            </p>
          </div>
        </div>

        {/* Name */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First Name">
            <input value={first} onChange={(e) => setFirst(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Last Name">
            <input value={last} onChange={(e) => setLast(e.target.value)} className={inputCls} />
          </Field>
        </div>

        <Field label="Company / trading name">
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className={inputCls}
          />
        </Field>

        {/* Email — changing it is verified via the new address */}
        <EmailChanger me={me} />

        {/* Phone + province */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
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

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
        {error && <span className="text-xs font-semibold text-danger">{error}</span>}
        {saved && !dirty && !error && (
          <span className="text-xs font-semibold text-positive">Saved ✓</span>
        )}
        <button
          onClick={reset}
          disabled={!dirty || saving}
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold hover:bg-steel/40 disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-lg bg-signal px-6 py-2.5 text-sm font-bold text-signal-foreground hover:brightness-105 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  );
}

// ── Email change (verified via the new address) ──────────────
function EmailChanger({ me }: { me: Party }) {
  const { refreshAuth } = useTamp();
  const [mode, setMode] = useState<"view" | "request" | "confirm">("view");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await requestEmailChange(newEmail.trim());
      setDevCode(res.devCode);
      setMode("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send a code.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setError("");
    setBusy(true);
    try {
      await confirmEmailChange(code.trim());
      await refreshAuth();
      setMode("view");
      setNewEmail("");
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't confirm the change.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Field label="Email">
        <div className="flex gap-2">
          <input value={me.email} disabled className={`${inputCls} flex-1 opacity-70`} />
          <button
            onClick={() => {
              setMode(mode === "view" ? "request" : "view");
              setError("");
            }}
            className="shrink-0 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold hover:bg-steel/40"
          >
            {mode === "view" ? "Edit Email" : "Cancel"}
          </button>
        </div>
      </Field>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Used to log in to your account</p>

      {mode === "request" && (
        <div className="mt-3 space-y-3 rounded-xl border border-border bg-background/40 p-4">
          <Field label="New email">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className={inputCls}
              autoFocus
            />
          </Field>
          {error && <p className="text-xs font-medium text-danger">{error}</p>}
          <div className="flex justify-end">
            <button
              onClick={send}
              disabled={busy || newEmail.trim().length < 3}
              className="rounded-lg bg-signal px-4 py-2 text-sm font-bold text-signal-foreground hover:brightness-105 disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send code"}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            We'll email a code to the new address to confirm it's yours.
          </p>
        </div>
      )}

      {mode === "confirm" && (
        <div className="mt-3 space-y-3 rounded-xl border border-border bg-background/40 p-4">
          <p className="text-xs text-muted-foreground">
            Enter the code sent to <span className="font-semibold text-foreground">{newEmail}</span>.
          </p>
          {devCode && (
            <div className="rounded border border-dashed border-signal/50 bg-signal/5 px-2 py-1 text-center text-[11px] text-muted-foreground">
              Dev mode — code:{" "}
              <span className="font-mono text-sm font-bold tracking-widest text-foreground">
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
              className={`${inputCls} text-center font-mono tracking-[0.3em]`}
              placeholder="000000"
            />
          </Field>
          {error && <p className="text-xs font-medium text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setMode("request")}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-steel/40"
            >
              Back
            </button>
            <button
              onClick={confirm}
              disabled={busy || code.length !== 6}
              className="rounded-lg bg-signal px-4 py-2 text-sm font-bold text-signal-foreground hover:brightness-105 disabled:opacity-40"
            >
              {busy ? "Confirming…" : "Confirm email"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Security tab ─────────────────────────────────────────────
function SecurityTab({ me }: { me: Party }) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ signedOut: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [loggedOut, setLoggedOut] = useState<number | null>(null);

  const submit = async () => {
    setError("");
    if (next.length < 6) return setError("Use a password of at least 6 characters.");
    if (next !== confirm) return setError("New passwords don't match.");
    setBusy(true);
    try {
      const res = await changePasswordFn(current, next);
      setDone({ signedOut: res.signedOut });
      setEditing(false);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change your password.");
    } finally {
      setBusy(false);
    }
  };

  const logoutOthers = async () => {
    setLoggingOut(true);
    try {
      const res = await logoutOtherSessions();
      setLoggedOut(res.count);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <>
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-xl font-extrabold tracking-tight">Security</h2>
      </div>
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-bold">Password</div>
            <p className="mt-0.5 max-w-md text-sm text-muted-foreground">
              Log in with your password instead of using temporary login codes.
            </p>
          </div>
          {!editing && (
            <button
              onClick={() => {
                setEditing(true);
                setDone(null);
              }}
              className="shrink-0 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-steel/40"
            >
              Change Password
            </button>
          )}
        </div>

        {done && (
          <p className="mt-3 text-xs font-semibold text-positive">
            Password updated ✓{done.signedOut > 0 ? ` — signed out ${done.signedOut} other device(s)` : ""}
          </p>
        )}

        {editing && (
          <div className="mt-5 max-w-md space-y-4 rounded-xl border border-border bg-background/40 p-4">
            <Field label="Current password">
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="New password">
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputCls}
              />
            </Field>
            {error && <p className="text-xs font-medium text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setEditing(false);
                  setError("");
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-steel/40"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="rounded-lg bg-signal px-4 py-2 text-sm font-bold text-signal-foreground hover:brightness-105 disabled:opacity-40"
              >
                {busy ? "Saving…" : "Update password"}
              </button>
            </div>
          </div>
        )}

        {/* Sessions / devices */}
        <div className="mt-6 flex flex-wrap items-start justify-between gap-3 border-t border-border pt-6">
          <div>
            <div className="text-base font-bold">Active sessions</div>
            <p className="mt-0.5 max-w-md text-sm text-muted-foreground">
              Sign out everywhere except this device — useful if you've logged in on a shared or lost
              device.
            </p>
            {loggedOut !== null && (
              <p className="mt-2 text-xs font-semibold text-positive">
                Signed out {loggedOut} other session(s).
              </p>
            )}
          </div>
          <button
            onClick={logoutOthers}
            disabled={loggingOut}
            className="shrink-0 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-steel/40 disabled:opacity-40"
          >
            {loggingOut ? "Signing out…" : "Log out other devices"}
          </button>
        </div>

        <p className="mt-4 text-[11px] text-muted-foreground">Signed in as {me.email}</p>
      </div>
    </>
  );
}

// ── Verification tab ─────────────────────────────────────────
function VerificationTab({ me, role }: { me: Party; role: Party["role"] }) {
  const { refreshAuth } = useTamp();
  const kycRef = useRef<HTMLInputElement>(null);
  const [uploadingKyc, setUploadingKyc] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);

  const onKycFile = async (f: File) => {
    setUploadingKyc(true);
    setKycError(null);
    try {
      // Real document bytes → private object store; then persist its URL on the
      // party and (if UNVERIFIED/REJECTED) move into the review queue.
      const up = await uploadFile(f, "KYC");
      await uploadKycDocument(up.filename, up.url);
      await refreshAuth(); // re-fetch `me` so the new doc + status show
    } catch (err) {
      setKycError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingKyc(false);
    }
  };

  return (
    <>
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-xl font-extrabold tracking-tight">Verification</h2>
      </div>
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${VERIFICATION_TONE[me.verification]}`}
          >
            <BadgeCheck className="size-4" /> {me.verification}
          </span>
          {me.ratingAvg !== null && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-steel px-3 py-1.5 text-xs font-semibold">
              <Star className="size-4 fill-signal text-signal" /> {me.ratingAvg} ({me.ratingCount})
            </span>
          )}
          <span className="rounded-full bg-steel px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            {ROLE_SHORT[role]}
          </span>
        </div>

        <dl className="divide-y divide-border rounded-xl border border-border">
          <Row label="Account status" value={me.verification} />
          <Row
            label="Member since"
            value={new Date(me.createdAt).toLocaleDateString("en-ZA", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          />
        </dl>

        {/* KYC document upload */}
        <div className="rounded-xl border border-border p-4">
          <div className="mb-1 text-sm font-bold">KYC document</div>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Upload your registration / ID document (PDF or image, max 8 MB). It's stored privately —
            only you and our verification team can open it.
          </p>
          {me.kycDocument ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-positive/40 bg-positive/10 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-positive">
                  ✓ {me.kycDocument.name}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  Uploaded {new Date(me.kycDocument.uploadedAt).toLocaleDateString("en-ZA")}
                </div>
              </div>
              {me.kycDocument.url && (
                <a
                  href={me.kycDocument.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-steel/40"
                >
                  View
                </a>
              )}
            </div>
          ) : (
            <p className="mb-3 text-xs text-muted-foreground">No document uploaded yet.</p>
          )}
          <input
            ref={kycRef}
            type="file"
            accept=".pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onKycFile(f);
            }}
          />
          <button
            onClick={() => kycRef.current?.click()}
            disabled={uploadingKyc}
            className="inline-flex items-center gap-1.5 rounded-lg bg-signal px-4 py-2 text-sm font-bold text-signal-foreground hover:brightness-105 disabled:opacity-40"
          >
            {uploadingKyc ? "Uploading…" : me.kycDocument ? "Replace document" : "Upload document"}
          </button>
          {kycError && <p className="mt-2 text-xs font-medium text-danger">{kycError}</p>}
        </div>

        {me.verification === "PENDING" && (
          <p className="text-[11px] text-muted-foreground">
            An administrator reviews your account before you can transact.
          </p>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium capitalize">{value.toLowerCase()}</dd>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-signal disabled:cursor-not-allowed";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}

