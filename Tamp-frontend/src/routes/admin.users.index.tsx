"use client";

import { useMutation } from "@tanstack/react-query";
import { Link } from "@/lib/nav";
import { Paperclip, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { Avatar } from "@/components/tamp/Avatar";
import { setPartyVerification } from "@/fns/parties";
import { ROLE_SHORT } from "@/lib/role-routes";
import { useTamp } from "@/lib/tamp-store";
import type { Party, Role } from "@/lib/tamp-types";

const ROLE_TABS: { key: Role | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "FREIGHT_OWNER", label: "Cargo Owners" },
  { key: "TRANSPORTER", label: "Truck Owners" },
  { key: "DRIVER", label: "Drivers" },
  { key: "ADMIN", label: "Admins" },
];

const VERIFY_TONE: Record<Party["verification"], string> = {
  VERIFIED: "bg-positive/15 text-positive",
  PENDING: "bg-signal/20 text-signal-foreground",
  UNVERIFIED: "bg-steel text-muted-foreground",
  REJECTED: "bg-danger/15 text-danger",
};

const VERIFICATION_STATUSES: Party["verification"][] = [
  "UNVERIFIED",
  "PENDING",
  "VERIFIED",
  "REJECTED",
];

function UsersPage() {
  // Parties come from the store (hydrated from Postgres); verification writes
  // straight through to Postgres and updates the local view.
  const { parties, setVerification } = useTamp();
  const isLoading = false;
  const verify = useMutation({
    mutationFn: (v: { partyId: string; status: Party["verification"] }) =>
      setPartyVerification({ data: v }),
    onSuccess: (_r, v) => setVerification(v.partyId, v.status),
  });
  const [tab, setTab] = useState<Role | "ALL">("ALL");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parties.filter((p) => {
      if (tab !== "ALL" && p.role !== tab) return false;
      if (!q) return true;
      return (
        p.contactName.toLowerCase().includes(q) ||
        p.companyName.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q)
      );
    });
  }, [parties, tab, query]);

  return (
    <AppShell>
      <PageHeader title="Users" />

      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
        <div className="flex flex-wrap gap-1">
          {ROLE_TABS.map((t) => {
            const count =
              t.key === "ALL" ? parties.length : parties.filter((p) => p.role === t.key).length;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  tab === t.key
                    ? "bg-signal text-signal-foreground"
                    : "text-muted-foreground hover:bg-steel/50 hover:text-foreground"
                }`}
              >
                {t.label} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="relative ml-auto min-w-52">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company, email…"
            className="w-full rounded-md border border-border bg-graphite py-2 pl-9 pr-3 text-sm outline-none focus:border-signal"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <th className="px-6 py-3 font-bold">User</th>
              <th className="px-3 py-3 font-bold">Role</th>
              <th className="px-3 py-3 font-bold">Province</th>
              <th className="px-3 py-3 font-bold">Verification</th>
              <th className="px-3 py-3 font-bold">Rating</th>
              <th className="px-6 py-3 font-bold">Contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((p) => (
              <tr key={p.id} className="hover:bg-steel/20">
                <td className="px-6 py-3">
                  <Link
                    to="/admin/users/$partyId"
                    params={{ partyId: p.id }}
                    className="flex items-center gap-3 hover:text-signal"
                  >
                    <Avatar party={p} size="sm" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold leading-tight">
                          {p.contactName}
                        </span>
                        {p.kycDocument && (
                          <span
                            title={`KYC document: ${p.kycDocument.name}`}
                            className="inline-flex items-center gap-0.5 rounded bg-steel px-1 py-0.5 text-[9px] font-bold text-muted-foreground"
                          >
                            <Paperclip className="size-2.5" /> KYC
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{p.companyName}</div>
                    </div>
                  </Link>
                </td>
                <td className="px-3 py-3 text-xs font-semibold">{ROLE_SHORT[p.role]}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{p.province}</td>
                <td className="px-3 py-3">
                  <select
                    value={p.verification}
                    onChange={(e) =>
                      verify.mutate({
                        partyId: p.id,
                        status: e.target.value as Party["verification"],
                      })
                    }
                    aria-label={`Verification status for ${p.contactName}`}
                    className={`cursor-pointer rounded-full border-0 px-2 py-1 text-[10px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-signal ${VERIFY_TONE[p.verification]}`}
                  >
                    {VERIFICATION_STATUSES.map((s) => (
                      <option key={s} value={s} className="bg-graphite text-foreground">
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-3">
                  {p.ratingAvg !== null ? (
                    <span className="inline-flex items-center gap-1 font-mono text-xs">
                      <Star className="size-3 fill-signal text-signal" />
                      {p.ratingAvg}
                      <span className="text-muted-foreground">({p.ratingCount})</span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-6 py-3">
                  <div className="text-xs">{p.email}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{p.phone}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Loading users from the database…
          </p>
        )}
        {!isLoading && visible.length === 0 && (
          <p className="p-10 text-center text-sm text-muted-foreground">No users match.</p>
        )}
      </div>
    </AppShell>
  );
}

export default UsersPage;
