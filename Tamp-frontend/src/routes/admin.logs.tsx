"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { Panel } from "@/components/tamp/StatCard";
import type { AuditEvent } from "@/lib/tamp-types";
import { useTamp } from "@/lib/tamp-store";

// The audit trail IS the system log — every domain event, incl. SYSTEM-actor
// events written by the background scheduler (e.g. MATCH_EXPIRED).
type ActorFilter = "ALL" | AuditEvent["actorRole"];

const ROLE_FILTERS: ActorFilter[] = [
  "ALL",
  "SYSTEM",
  "ADMIN",
  "FREIGHT_OWNER",
  "TRANSPORTER",
  "DRIVER",
];

const ROLE_LABEL: Record<string, string> = {
  ALL: "All",
  SYSTEM: "System",
  ADMIN: "Admin",
  FREIGHT_OWNER: "Cargo owners",
  TRANSPORTER: "Carriers",
  DRIVER: "Drivers",
};

const roleTone = (role: string) =>
  role === "SYSTEM"
    ? "bg-steel/60 text-muted-foreground"
    : role === "ADMIN"
      ? "bg-signal/20 text-signal"
      : "bg-steel/40 text-foreground";

function SystemLogsPage() {
  const { audit } = useTamp();
  const [role, setRole] = useState<ActorFilter>("ALL");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...audit]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .filter((e) => (role === "ALL" ? true : e.actorRole === role))
      .filter((e) =>
        !q
          ? true
          : [e.eventType, e.summary, e.subjectId, e.actorId, e.eventId]
              .join(" ")
              .toLowerCase()
              .includes(q),
      );
  }, [audit, role, query]);

  return (
    <AppShell>
      <PageHeader title="System Logs" />

      <div className="space-y-4 p-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {ROLE_FILTERS.map((r) => {
              const on = role === r;
              return (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                    on
                      ? "border-signal bg-signal/15 text-foreground"
                      : "border-border text-muted-foreground hover:bg-steel/40"
                  }`}
                >
                  {ROLE_LABEL[r] ?? r}
                </button>
              );
            })}
          </div>
          <label className="ml-auto flex min-w-56 flex-1 items-center gap-2 rounded-md border border-border bg-graphite px-3 py-1.5 sm:flex-none">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events, IDs, summaries…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>

        <Panel title={`Event log (${rows.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <th className="w-44 p-2.5 font-bold">Time</th>
                  <th className="w-24 p-2.5 font-bold">Actor</th>
                  <th className="w-48 p-2.5 font-bold">Event</th>
                  <th className="p-2.5 font-bold">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      No log entries match your filters.
                    </td>
                  </tr>
                )}
                {rows.map((e) => (
                  <tr key={e.id} className="align-top hover:bg-steel/20">
                    <td className="p-2.5 font-mono text-muted-foreground">
                      {new Date(e.at).toLocaleString("en-ZA", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${roleTone(e.actorRole)}`}
                      >
                        {ROLE_LABEL[e.actorRole] ?? e.actorRole}
                      </span>
                    </td>
                    <td className="p-2.5">
                      <div className="font-semibold text-foreground">{e.eventType}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{e.eventId}</div>
                    </td>
                    <td className="p-2.5">
                      <div className="text-foreground">{e.summary}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {e.subjectType} · {e.subjectId}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

export default SystemLogsPage;
