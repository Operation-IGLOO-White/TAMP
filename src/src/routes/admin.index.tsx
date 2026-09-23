"use client";

import { Link } from "@/lib/nav";
import { AlertTriangle, BadgeCheck, Ban, Clock, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { CHART, ClientOnly, chartTooltipStyle } from "@/components/tamp/ClientOnly";
import { FleetMap } from "@/components/tamp/FleetMap";
import { Panel } from "@/components/tamp/StatCard";
import { hoursSince, isActiveTrip, lastEventAt } from "@/lib/tamp-dashboard";
import { useTamp } from "@/lib/tamp-store";

const PROVINCES_ORDER = ["GP", "KZN", "WC", "EC", "FS", "NW", "LP", "MP", "NC"];

function AdminDashboard() {
  const { loads, trucks, parties, matches, trips, ratings, disputes, audit } = useTamp();

  // ① Needs attention
  const pendingVerifications = parties.filter(
    (p) => p.verification === "PENDING" || p.verification === "UNVERIFIED",
  ).length;
  const openDisputes = disputes.filter(
    (d) => d.status === "OPEN" || d.status === "UNDER_REVIEW",
  ).length;
  const cancelled7d = trips.filter(
    (t) => t.status === "CANCELLED" && hoursSince(lastEventAt(t)) <= 24 * 7,
  ).length;
  const flaggedUsers = parties.filter((p) => p.suspended).length;
  const stuckTrips = trips.filter(
    (t) => isActiveTrip(t.status) && lastEventAt(t) && hoursSince(lastEventAt(t)) > 12,
  ).length;

  // ② Marketplace health
  const activeCargoOwners = new Set(loads.map((l) => l.ownerId)).size;
  const activeTruckOwners = new Set(trucks.map((t) => t.transporterId)).size;
  const loads7d = loads.filter((l) => hoursSince(l.createdAt) <= 24 * 7).length;
  const trucks7d = trucks.filter((t) => hoursSince(t.createdAt) <= 24 * 7).length;
  const confirmedMatches = matches.filter((m) => m.confirmedByOwnerAt);
  const acceptanceRate = matches.length
    ? Math.round((confirmedMatches.length / new Set(matches.map((m) => m.loadId)).size) * 100)
    : 0;
  const avgTimeToMatchH = confirmedMatches.length
    ? confirmedMatches.reduce((s, m) => {
        const load = loads.find((l) => l.id === m.loadId);
        return load
          ? s +
              (new Date(m.confirmedByOwnerAt!).getTime() - new Date(load.createdAt).getTime()) /
                36e5
          : s;
      }, 0) / confirmedMatches.length
    : null;

  // liquidity by province: demand (posted loads from) vs supply (available trucks in)
  const liquidity = PROVINCES_ORDER.map((prov) => {
    const demand = loads.filter((l) => l.status === "POSTED" && l.origin.province === prov).length;
    const supply = trucks.filter(
      (t) => t.status === "AVAILABLE" && t.currentLocation.province === prov,
    ).length;
    const ratio = supply === 0 ? (demand === 0 ? null : Infinity) : demand / supply;
    return { prov, demand, supply, ratio };
  }).filter((l) => l.demand > 0 || l.supply > 0);

  // ③ Funnel
  const posted = loads.length;
  const suggested = loads.filter((l) => matches.some((m) => m.loadId === l.id)).length;
  const confirmed = loads.filter((l) =>
    matches.some((m) => m.loadId === l.id && (m.status === "CONFIRMED" || m.status === "ACCEPTED")),
  ).length;
  const delivered = trips.filter(
    (t) => t.status === "DELIVERED" || t.status === "COMPLETED",
  ).length;
  const funnel = [
    { stage: "Posted", n: posted },
    { stage: "Suggested", n: suggested },
    { stage: "Confirmed", n: confirmed },
    { stage: "Delivered", n: delivered },
  ];

  // ④ Quality
  const confirmedLoadCount = confirmed || 1;
  const disputeRate = Math.round((disputes.length / confirmedLoadCount) * 100);
  const deliveredTrips = trips.filter((t) => t.status === "DELIVERED" || t.status === "COMPLETED");
  const onTime = deliveredTrips.filter((t) => {
    const load = loads.find((l) => l.id === matches.find((m) => m.id === t.matchId)?.loadId);
    const del = t.events.find((e) => e.status === "DELIVERED")?.at;
    return load && del && new Date(del) <= new Date(load.deliveryBy);
  }).length;
  const onTimeRate = deliveredTrips.length
    ? Math.round((onTime / deliveredTrips.length) * 100)
    : null;
  const ratingDist = [1, 2, 3, 4, 5].map((star) => ({
    star: `${star}★`,
    n: ratings.filter((r) => r.stars === star).length,
  }));

  return (
    <AppShell>
      <PageHeader title="Platform Dashboard" />

      <div className="space-y-8 p-6">
        {/* ① Needs attention */}
        <Section title="Needs attention">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <NeedTile
              label="Pending verifications"
              count={pendingVerifications}
              icon={BadgeCheck}
              to="/admin/users"
            />
            <NeedTile
              label="Open disputes"
              count={openDisputes}
              icon={ShieldAlert}
              tone="danger"
              to="/admin/oversight"
            />
            <NeedTile label="Cancelled (7d)" count={cancelled7d} icon={Ban} to="/admin/oversight" />
            <NeedTile
              label="Flagged users"
              count={flaggedUsers}
              icon={AlertTriangle}
              to="/admin/users"
            />
            <NeedTile
              label="Stuck trips (12h+)"
              count={stuckTrips}
              icon={Clock}
              tone="danger"
              to="/admin/oversight"
            />
          </div>
        </Section>

        {/* Live fleet map */}
        <Section title="Fleet on the road">
          <ClientOnly
            fallback={
              <div className="h-[48vh] min-h-[340px] rounded-lg border border-border bg-graphite" />
            }
          >
            <FleetMap />
          </ClientOnly>
        </Section>

        {/* ② Marketplace health */}
        <Section title="Marketplace health">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            <Metric label="Active cargo owners" value={String(activeCargoOwners)} />
            <Metric label="Active truck owners" value={String(activeTruckOwners)} />
            <Metric label="Loads (7d)" value={String(loads7d)} />
            <Metric label="Trucks (7d)" value={String(trucks7d)} />
            <Metric label="Acceptance rate" value={`${acceptanceRate}%`} />
            <Metric
              label="Avg. time to match"
              value={avgTimeToMatchH === null ? "—" : `${avgTimeToMatchH.toFixed(0)}h`}
            />
          </div>
          <Panel title="Liquidity by province — demand vs supply" className="mt-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <th className="px-4 py-2">Province</th>
                    <th className="px-3 py-2 text-right">Loads (demand)</th>
                    <th className="px-3 py-2 text-right">Trucks (supply)</th>
                    <th className="px-4 py-2 text-right">Ratio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {liquidity.map((l) => {
                    const warn = l.ratio !== null && (l.ratio < 0.5 || l.ratio > 2.0);
                    return (
                      <tr key={l.prov} className={warn ? "bg-danger/5" : ""}>
                        <td className="px-4 py-2 font-semibold">{l.prov}</td>
                        <td className="px-3 py-2 text-right font-mono">{l.demand}</td>
                        <td className="px-3 py-2 text-right font-mono">{l.supply}</td>
                        <td className="px-4 py-2 text-right font-mono">
                          <span className={warn ? "font-bold text-danger" : ""}>
                            {l.ratio === null
                              ? "—"
                              : l.ratio === Infinity
                                ? "∞"
                                : l.ratio.toFixed(2)}
                          </span>
                          {warn && <AlertTriangle className="ml-1 inline size-3 text-danger" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </Section>

        {/* ③ Funnel */}
        <Section title="Conversion funnel">
          <Panel title="Posted → Suggested → Confirmed → Delivered">
            <div className="space-y-2 p-4">
              {funnel.map((f, i) => {
                const pct = posted ? Math.round((f.n / posted) * 100) : 0;
                const dropFromPrev =
                  i > 0 && funnel[i - 1]!.n > 0
                    ? Math.round((1 - f.n / funnel[i - 1]!.n) * 100)
                    : 0;
                return (
                  <div key={f.stage}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold uppercase">{f.stage}</span>
                      <span className="font-mono text-muted-foreground">
                        {f.n}
                        {i > 0 && dropFromPrev > 0 && (
                          <span className="ml-2 text-danger">−{dropFromPrev}%</span>
                        )}
                      </span>
                    </div>
                    <div className="h-6 overflow-hidden rounded bg-steel/40">
                      <div className="h-full bg-signal" style={{ width: `${Math.max(pct, 3)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </Section>

        {/* ④ Quality */}
        <Section title="Quality">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[repeat(3,minmax(0,1fr))_1.4fr]">
            <Metric label="Dispute rate" value={`${disputeRate}%`} hint="of confirmed" />
            <Metric label="On-time delivery" value={onTimeRate === null ? "—" : `${onTimeRate}%`} />
            <Metric label="Total ratings" value={String(ratings.length)} />
            <Panel title="Rating distribution">
              <div className="h-40 p-3">
                <ClientOnly>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ratingDist} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                      <XAxis
                        dataKey="star"
                        tick={{ fontSize: 10, fill: CHART.muted }}
                        axisLine={{ stroke: CHART.border }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: CHART.muted }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: CHART.steel, opacity: 0.4 }}
                        contentStyle={chartTooltipStyle}
                      />
                      <Bar dataKey="n" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                        {ratingDist.map((_, i) => (
                          <Cell
                            key={i}
                            fill={i >= 3 ? CHART.positive : i === 2 ? CHART.signal : CHART.danger}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ClientOnly>
              </div>
            </Panel>
          </div>
        </Section>

        {/* ⑤ Live activity */}
        <Section title="Live activity">
          <Panel
            title="Latest events"
            action={
              <Link
                to="/admin/oversight"
                className="text-[11px] font-bold uppercase tracking-wide text-signal hover:underline"
              >
                Full log →
              </Link>
            }
          >
            <ol className="max-h-96 divide-y divide-border overflow-y-auto">
              {audit.slice(0, 20).map((e) => (
                <li key={e.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <span className="text-xs font-medium">{e.summary}</span>
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      {e.eventId} · {e.actorRole}
                    </span>
                  </div>
                  <time className="font-mono text-[10px] text-muted-foreground">
                    {new Date(e.at).toLocaleString("en-ZA", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
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
  tone = "signal",
  to,
}: {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "signal" | "danger";
  to: "/admin/users" | "/admin/oversight";
}) {
  const active = count > 0;
  const accent =
    tone === "danger" ? "border-danger/40 bg-danger/10" : "border-signal/40 bg-signal/10";
  return (
    <Link
      to={to}
      className={`rounded-lg border p-4 transition-colors ${
        active ? accent : "border-border bg-graphite hover:bg-steel/30"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      </div>
      <div className={`mt-2 text-3xl font-bold font-mono ${active ? "" : "text-muted-foreground"}`}>
        {count}
      </div>
    </Link>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-graphite p-4">
      <div className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-bold">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default AdminDashboard;
