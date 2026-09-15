"use client";

import { Link } from "@/lib/nav";
import { AlertTriangle, Clock, Plus, RefreshCw, Star, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { Panel } from "@/components/tamp/StatCard";
import { StatusChip } from "@/components/tamp/StatusChip";
import { TripProgress } from "@/components/tamp/TripProgress";
import { formatMoney } from "@/lib/tamp-data";
import {
  costPerTonneKm,
  daysSince,
  enrichTrip,
  estimateEta,
  isActiveTrip,
  lastEventAt,
  suggestionCount,
  tripDisputed,
  zarShort,
} from "@/lib/tamp-dashboard";
import { activeMatchForLoad, displayStatusForLoad, tripForMatch } from "@/lib/tamp-selectors";
import { useTamp } from "@/lib/tamp-store";

// A POSTED load with no engagement expires off the active board after 7 days;
// the owner can re-post it (which resets the clock).
const LOAD_EXPIRY_DAYS = 7;

function OwnerDashboard() {
  const { loads, trucks, matches, trips, disputes, ratings, audit, parties, me, repostLoad } =
    useTamp();
  const data = { matches, loads, trucks, parties };

  // ① Needs you
  const decisionsNeeded = loads.filter(
    (l) => l.status === "POSTED" && suggestionCount(l.id, matches) > 0,
  ).length;
  const awaitingCarrier = loads.filter((l) => l.status === "MATCHED").length;
  const delayed = trips.filter((t) => isActiveTrip(t.status) && tripDisputed(t, disputes)).length;
  const unrated = loads.filter((l) => {
    if (l.status !== "COMPLETED") return false;
    const trip = tripForMatch(activeMatchForLoad(l.id, matches)?.id, trips);
    return trip && !ratings.some((r) => r.tripId === trip.id);
  }).length;

  // ② Cargo in motion
  const inMotion = trips
    .filter((t) => isActiveTrip(t.status) && t.status !== "SCHEDULED")
    .map((t) => enrichTrip(t, data))
    .filter((e) => e.load);

  // ③ Open loads — split active (posted within 7 days) from expired (older),
  // which drop off the active board and can be re-posted.
  const postedLoads = loads
    .filter((l) => l.status === "POSTED")
    .map((l) => ({
      load: l,
      suggestions: suggestionCount(l.id, matches),
      age: daysSince(l.createdAt),
    }))
    .sort((a, b) => b.age - a.age);
  // A load with pending carrier requests is engaged — it never expires.
  const hasOffers = (loadId: string) =>
    matches.some((m) => m.loadId === loadId && m.status === "OFFERED");
  const openLoads = postedLoads.filter((l) => l.age < LOAD_EXPIRY_DAYS || hasOffers(l.load.id));
  const expiredLoads = postedLoads.filter(
    (l) => l.age >= LOAD_EXPIRY_DAYS && !hasOffers(l.load.id),
  );

  // ④ Performance
  const confirmedMatches = matches.filter((m) => m.confirmedByOwnerAt);
  const avgTimeToAcceptH =
    confirmedMatches.length === 0
      ? null
      : confirmedMatches.reduce((s, m) => {
          const load = loads.find((l) => l.id === m.loadId);
          if (!load) return s;
          return (
            s +
            (new Date(m.confirmedByOwnerAt!).getTime() - new Date(load.createdAt).getTime()) / 36e5
          );
        }, 0) / confirmedMatches.length;
  const acceptanceRate =
    loads.length === 0
      ? 0
      : Math.round(
          (loads.filter((l) => activeMatchForLoad(l.id, matches)).length / loads.length) * 100,
        );
  const deliveredTrips = trips.filter((t) => t.status === "DELIVERED" || t.status === "COMPLETED");
  const onTime = deliveredTrips.filter((t) => {
    const load = loads.find((l) => l.id === matches.find((m) => m.id === t.matchId)?.loadId);
    const delivered = t.events.find((e) => e.status === "DELIVERED")?.at;
    return load && delivered && new Date(delivered) <= new Date(load.deliveryBy);
  }).length;
  const onTimeRate = deliveredTrips.length
    ? Math.round((onTime / deliveredTrips.length) * 100)
    : null;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const spendThisMonth = loads
    .filter((l) => new Date(l.createdAt) >= monthStart)
    .reduce((s, l) => s + (l.targetRate?.amount ?? 0), 0);

  // cost per tonne-km by lane
  const laneMap = new Map<string, { total: number; n: number }>();
  loads.forEach((l) => {
    const c = costPerTonneKm(l);
    if (c === null) return;
    const key = `${l.origin.label} → ${l.destination.label}`;
    const cur = laneMap.get(key) ?? { total: 0, n: 0 };
    laneMap.set(key, { total: cur.total + c, n: cur.n + 1 });
  });
  const laneCosts = [...laneMap.entries()]
    .map(([lane, v]) => ({ lane, cost: v.total / v.n }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  const recent = audit.filter((e) => e.eventType !== "TRUCK_POSTED").slice(0, 6);

  return (
    <AppShell>
      <PageHeader
        title={`Welcome back, ${me.contactName.split(" ")[0]}`}
        actions={
          <Link
            to="/owner/board"
            search={{ post: true }}
            className="inline-flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 text-xs font-bold uppercase tracking-wide text-signal-foreground hover:brightness-105"
          >
            <Plus className="size-3.5" /> Post a load
          </Link>
        }
      />

      <div className="space-y-8 p-6">
        {/* ① Needs you */}
        <Section title="Needs you">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <NeedTile
              label="Matches to decide"
              count={decisionsNeeded}
              icon={Truck}
              search={{ status: "POSTED" }}
            />
            <NeedTile
              label="Awaiting carrier"
              count={awaitingCarrier}
              icon={Clock}
              search={{ status: "MATCHED" }}
            />
            <NeedTile
              label="Flagged / delayed"
              count={delayed}
              icon={AlertTriangle}
              tone="danger"
              search={{ status: "DISPUTED" }}
            />
            <NeedTile label="Ratings outstanding" count={unrated} icon={Star} toHistory />
          </div>
        </Section>

        {/* ② Cargo in motion */}
        <Section title="Cargo in motion">
          <Panel title={`Active trips (${inMotion.length})`}>
            <div className="divide-y divide-border">
              {inMotion.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Nothing on the road right now.
                </p>
              )}
              {inMotion.map(({ trip, load, truck, driver }) => (
                <Link
                  key={trip.id}
                  to="/owner/loads/$loadId"
                  params={{ loadId: load!.id }}
                  className="block px-4 py-4 hover:bg-steel/30"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-bold uppercase">
                      <LivePulse />
                      {load!.origin.label} → {load!.destination.label}
                    </span>
                    <StatusChip status={displayStatusForLoad(load!, matches, trips, disputes)} />
                  </div>
                  <TripProgress status={trip.status} />
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-4">
                    <Meta label="ETA">
                      {estimateEta(load!, trip).toLocaleString("en-ZA", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Meta>
                    <Meta label="Truck">{truck?.registration ?? "—"}</Meta>
                    <Meta label="Driver">{driver?.contactName ?? "Unassigned"}</Meta>
                    <Meta label="Last update">
                      {lastEventAt(trip)
                        ? new Date(lastEventAt(trip)).toLocaleString("en-ZA", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </Meta>
                  </div>
                </Link>
              ))}
            </div>
          </Panel>
        </Section>

        {/* ③ Open loads */}
        <Section title="Open loads">
          <Panel title={`Posted, awaiting a match (${openLoads.length})`}>
            <div className="divide-y divide-border">
              {openLoads.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No open loads.
                </p>
              )}
              {openLoads.map(({ load, suggestions, age }) => {
                const stale = age >= 3 && suggestions === 0;
                return (
                  <Link
                    key={load.id}
                    to="/owner/loads/$loadId"
                    params={{ loadId: load.id }}
                    className={`block px-4 py-3 hover:bg-steel/30 ${stale ? "bg-danger/5" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold uppercase leading-tight">
                          {load.origin.label} → {load.destination.label}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          #{load.id} · posted {age === 0 ? "today" : `${age}d ago`}
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <span
                          className={`font-bold ${suggestions === 0 ? "text-muted-foreground" : "text-foreground"}`}
                        >
                          {suggestions} suggestion{suggestions === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                    {stale && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-danger">
                        <AlertTriangle className="size-3.5 shrink-0" />
                        Posted {age} days ago, 0 accepted. Widen the radius or review your rate.
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          </Panel>

          {expiredLoads.length > 0 && (
            <Panel title={`Expired posts (${expiredLoads.length})`} className="mt-4">
              <p className="border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
                Posted over {LOAD_EXPIRY_DAYS} days ago with no engagement — removed from the board.
                Re-post to refresh the date and get new suggestions.
              </p>
              <div className="divide-y divide-border">
                {expiredLoads.map(({ load, age }) => (
                  <div key={load.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold uppercase leading-tight text-muted-foreground">
                        {load.origin.label} → {load.destination.label}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        #{load.id} · expired · posted {age}d ago
                      </div>
                    </div>
                    <button
                      onClick={() => repostLoad(load.id)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-signal px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-signal-foreground hover:brightness-105"
                    >
                      <RefreshCw className="size-3.5" /> Re-post
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </Section>

        {/* ④ Performance */}
        <Section title="Performance">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric
              label="Avg. post → match"
              value={avgTimeToAcceptH === null ? "—" : `${avgTimeToAcceptH.toFixed(0)}h`}
            />
            <Metric label="Acceptance rate" value={`${acceptanceRate}%`} />
            <Metric label="On-time delivery" value={onTimeRate === null ? "—" : `${onTimeRate}%`} />
            <Metric label="Spend this month" value={zarShort(spendThisMonth)} hint="excl. VAT" />
          </div>
          <Panel title="Cost per tonne-km by lane" className="mt-4">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-border">
                {laneCosts.map((l) => (
                  <tr key={l.lane}>
                    <td className="px-4 py-2 font-semibold uppercase">{l.lane}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      R {l.cost.toFixed(2)} <span className="text-muted-foreground">/t·km</span>
                    </td>
                  </tr>
                ))}
                {laneCosts.length === 0 && (
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">No rated lanes yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
        </Section>

        {/* ⑤ Recent activity */}
        <Section title="Recent activity">
          <Panel title="Your audit trail">
            <ol className="divide-y divide-border">
              {recent.map((e) => (
                <li key={e.id} className="px-4 py-3">
                  <div className="text-xs font-medium">{e.summary}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {e.eventId} ·{" "}
                    {new Date(e.at).toLocaleString("en-ZA", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </Section>
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function NeedTile({
  label,
  count,
  icon: Icon,
  search,
  toHistory,
  tone = "signal",
}: {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  search?: { status: string };
  toHistory?: boolean;
  tone?: "signal" | "danger";
}) {
  const active = count > 0;
  const accent =
    tone === "danger" ? "border-danger/40 bg-danger/10" : "border-signal/40 bg-signal/10";
  const cls = `rounded-lg border p-4 transition-colors ${
    active ? accent : "border-border bg-graphite hover:bg-steel/30"
  }`;
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className={`mt-2 text-3xl font-bold font-mono ${active ? "" : "text-muted-foreground"}`}>
        {count}
      </div>
    </>
  );
  return toHistory ? (
    <Link to="/owner/history" className={cls}>
      {body}
    </Link>
  ) : (
    <Link to="/owner/board" search={search ?? {}} className={cls}>
      {body}
    </Link>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-graphite p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-bold">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function LivePulse() {
  return (
    <span
      className="relative flex size-2.5 shrink-0"
      title="Live — updated as the driver moves"
      aria-label="Live"
    >
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-positive opacity-70" />
      <span className="relative inline-flex size-2.5 rounded-full bg-positive" />
    </span>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="block text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-foreground">{children}</span>
    </div>
  );
}

export default OwnerDashboard;
