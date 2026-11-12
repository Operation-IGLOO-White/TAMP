
import { useMutation } from "@tanstack/react-query";
import { Link } from "@/lib/nav";
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, Paperclip, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { Avatar } from "@/components/tamp/Avatar";
import { setPartyVerification } from "@/fns/parties";
import { ROLE_SHORT } from "@/lib/role-routes";
import { useTamp } from "@/context/TampContext";
import type { Party, Role } from "@/types/domain";

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

type UserSortKey = "contactName" | "companyName" | "role" | "province" | "verification" | "rating" | "createdAt";
type SortDirection = "asc" | "desc";

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
  const [company, setCompany] = useState("ALL");
  const [sortKey, setSortKey] = useState<UserSortKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const companies = useMemo(
    () => [...new Set(parties.map((party) => party.companyName).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [parties],
  );

  const changeSort = (key: UserSortKey) => {
    if (sortKey === key) setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parties
      .filter((p) => {
        if (tab !== "ALL" && p.role !== tab) return false;
        if (company !== "ALL" && p.companyName !== company) return false;
        if (!q) return true;
        return (
          p.contactName.toLowerCase().includes(q) ||
          p.companyName.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const values: Record<UserSortKey, [string | number, string | number]> = {
          contactName: [a.contactName, b.contactName],
          companyName: [a.companyName, b.companyName],
          role: [ROLE_SHORT[a.role], ROLE_SHORT[b.role]],
          province: [a.province, b.province],
          verification: [a.verification, b.verification],
          rating: [a.ratingAvg ?? -1, b.ratingAvg ?? -1],
          createdAt: [new Date(a.createdAt).getTime(), new Date(b.createdAt).getTime()],
        };
        const [left, right] = values[sortKey];
        const result = typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), undefined, { sensitivity: "base" });
        return sortDirection === "asc" ? result : -result;
      });
  }, [parties, tab, query, company, sortKey, sortDirection]);

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
        <label className="relative ml-auto min-w-52">
          <Building2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            aria-label="Filter users by company"
            className="h-10 w-full appearance-none rounded-md border border-border bg-graphite pl-9 pr-8 text-sm outline-none focus:border-signal"
          >
            <option value="ALL">All companies</option>
            {companies.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <div className="relative min-w-52">
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
              <SortableHeader label="User" sortKey="contactName" current={sortKey} direction={sortDirection} onSort={changeSort} className="px-6" />
              <SortableHeader label="Company" sortKey="companyName" current={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortableHeader label="Role" sortKey="role" current={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortableHeader label="Province" sortKey="province" current={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortableHeader label="Verification" sortKey="verification" current={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortableHeader label="Rating" sortKey="rating" current={sortKey} direction={sortDirection} onSort={changeSort} />
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
                    </div>
                  </Link>
                </td>
                <td className="px-3 py-3 text-xs font-medium">{p.companyName}</td>
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

function SortableHeader({ label, sortKey, current, direction, onSort, className = "px-3" }: {
  label: string;
  sortKey: UserSortKey;
  current: UserSortKey;
  direction: SortDirection;
  onSort: (key: UserSortKey) => void;
  className?: string;
}) {
  const Icon = current !== sortKey ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`${className} py-3 font-bold`}>
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1.5 hover:text-foreground" aria-label={`Sort by ${label}`}>
        {label}<Icon className={`size-3 ${current === sortKey ? "text-signal" : "opacity-50"}`} />
      </button>
    </th>
  );
}

export default UsersPage;
