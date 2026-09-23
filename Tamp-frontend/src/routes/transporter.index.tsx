"use client";

import { Link } from "@/lib/nav";
import { AlertTriangle, BookmarkCheck, Leaf, Plus, Repeat, TrendingUp, UserX } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { ClientOnly } from "@/components/tamp/ClientOnly";
import { FleetMap } from "@/components/tamp/FleetMap";
import { Panel } from "@/components/tamp/StatCard";
import { bestNextLoad, haulMetrics, type HaulSuggestion } from "@/lib/tamp-backhaul";
import { formatMoney } from "@/lib/tamp-data";
import { daysSince, enrichTrip, estimateEta, isActiveTrip, zarShort } from "@/lib/tamp-dashboard";
import { scoreLoadAgainstTrucks } from "@/lib/tamp-matching";
import { useTamp } from "@/lib/tamp-store";
import type { Load, TruckPosting } from "@/lib/tamp-types";

const RATE_BENCHMARK = 26; // R/km reference for the lane

function TransporterDashboard() {
  const {
    trucks,
    matches,
    loads,
    trips,
    parties,
    audit,
    me,
    reservations,
    reserveBackhaul,
    releaseReservation,
  } = useTamp();
  const data = { matches, loads, trucks, parties };
  const recent = audit.filter((e) => e.eventType !== "LOAD_POSTED").slice(0, 6);

  const activeTrips = trips.filter((t) => isActiveTrip(t.status)).map((t) => enrichTrip(t, data));
  const openLoads = loads.filter((l) => l.status === "POSTED");

  // ① Needs you
  const noDriver = activeTrips.filter((e) => e.truck && !e.truck.driverId);
  const idleTrucks = trucks.filter((t) => t.status === "AVAILABLE" && daysSince(t.createdAt) >= 3);
  const available = trucks.filter((t) => t.status === "AVAILABLE");
  const opportunityTrucks = available.filter((t) =>
    openLoads.some((l) => {
      const owner = parties.find((p) => p.id === l.ownerId);
      if (!owner) return false;
      return scoreLoadAgainstTrucks(l, [t], parties, owner).some((m) => m.passed);
    }),
  );

  // ③ Earning opportunities — best open load per available truck
  const opportunities: { load: Load; truck: TruckPosting; score: number }[] = [];
  available.forEach((t) => {
    let bestLoad: Load | null = null;
    let bestScore = -1;
    openLoads.forEach((l) => {
      const owner = parties.find((p) => p.id === l.ownerId);
      if (!owner) return;
      const scored = scoreLoadAgainstTrucks(l, [t], parties, owner).find((m) => m.passed);
      if (scored && scored.score > bestScore) {
        bestScore = scored.score;
        bestLoad = l;
      }
    });
    if (bestLoad) opportunities.push({ truck: t, load: bestLoad, score: bestScore });
  });
  opportunities.sort((a, b) => b.score - a.score);

  // Backhaul optimisation & forward-haul pre-booking: for each truck on a trip,
  // either its reserved backhaul, or the best open load to pre-book at its
  // destination — turning the empty return into revenue and cutting fuel/CO₂.
  const activeReservations = reservations.filter((r) => r.status === "RESERVED");
  const reservedByTruck = new Map(activeReservations.map((r) => [r.truckId, r]));
  const reservedLoadIds = new Set(activeReservations.map((r) => r.loadId));
  const openForBackhaul = openLoads.filter((l) => !reservedLoadIds.has(l.id));

  const backhaul = activeTrips
    .filter((e) => e.truck && e.load)
    .map((e) => {
      const truck = e.truck!;
      const load = e.load!;
      const eta = estimateEta(load, e.trip);
      const reservation = reservedByTruck.get(truck.id);
      if (reservation) {
        const resLoad = loads.find((l) => l.id === reservation.loadId);
        if (!resLoad) return null;
        const suggestion = haulMetrics(
          truck,
          load.destination,
          load.origin,
          eta.toISOString(),
          resLoad,
        );
        return { truck, dest: load.destination.label, eta, suggestion, reserved: true };
      }
      const suggestion = bestNextLoad({
        truck,
        fromPlace: load.destination,
        basePlace: load.origin,
        availableFrom: eta.toISOString(),
        openLoads: openForBackhaul,
      });
      return suggestion && suggestion.eligible
        ? { truck, dest: load.destination.label, eta, suggestion, reserved: false }
        : null;
    })
    .filter(
      (
        x,
      ): x is {
        truck: TruckPosting;
        dest: string;
        eta: Date;
        suggestion: HaulSuggestion;
        reserved: boolean;
      } => x !== null,
    );

  const reservedCount = backhaul.filter((b) => b.reserved).length;
  const emptyKmAvoidable = Math.round(
    backhaul.reduce((s, b) => s + b.suggestion.emptyKmReduced, 0),
  );
  const fuelAvoidableL = Math.round(backhaul.reduce((s, b) => s + b.suggestion.fuelSavedL, 0));
  const co2AvoidableKg = Math.round(backhaul.reduce((s, b) => s + b.suggestion.co2SavedKg, 0));

  // ④ Utilisation
  const utilised = trucks.filter((t) => t.status !== "AVAILABLE" && t.status !== "OFFLINE").length;
  const utilisation = trucks.length ? Math.round((utilised / trucks.length) * 100) : 0;
  const confirmedLoads = loads.filter(
    (l) => l.status === "CONFIRMED" || l.status === "COMPLETED" || l.status === "CLOSED",
  );
  const revenue = confirmedLoads.reduce((s, l) => s + (l.targetRate?.amount ?? 0), 0);
  const revenuePerTruck = trucks.length ? revenue / trucks.length : 0;
  const rateSamples = confirmedLoads
    .filter((l) => l.targetRate && l.distanceKm > 0)
    .map((l) => l.targetRate!.amount / l.distanceKm);
  const avgRatePerKm = rateSamples.length
    ? rateSamples.reduce((s, r) => s + r, 0) / rateSamples.length
    : null;

  return (
    <AppShell>
      <PageHeader
        title={`Welcome back, ${me.contactName.split(" ")[0]}`}
        actions={
          <Link
            to="/transporter/fleet"
            className="inline-flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 text-xs font-bold uppercase tracking-wide text-signal-foreground hover:brightness-105"
          >
            <Plus className="size-3.5" /> Post capacity
          </Link>
        }
      />

      <div className="space-y-8 p-6">
        {/* ① Needs you */}
        <Section title="Needs you">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <NeedTile
              label="No driver assigned"
              count={noDriver.length}
              icon={UserX}
              tone="danger"
              hint="Trip can't start until assigned"
            />
            <NeedTile label="Idle 3+ days" count={idleTrucks.length} icon={AlertTriangle} />
            <NeedTile
              label="Trucks with matches"
              count={opportunityTrucks.length}
              icon={TrendingUp}
              tone="positive"
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

        {/* ② Fleet board */}
        <Section title="Fleet board">
          <Panel title={`Fleet (${trucks.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <th className="px-4 py-2">Truck</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Driver</th>
                    <th className="px-3 py-2">Current job</th>
                    <th className="px-4 py-2">Free at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {trucks.map((t) => {
                    const trip = activeTrips.find((e) => e.truck?.id === t.id);
                    const driver = t.driverId
                      ? parties.find((p) => p.id === t.driverId)
                      : undefined;
                    const freeAt =
                      trip && trip.load
                        ? estimateEta(trip.load, trip.trip)
                        : new Date(t.availableFrom);
                    return (
                      <tr key={t.id} className="hover:bg-steel/20">
                        <td className="px-4 py-2.5">
                          <Link
                            to="/trucks/$truckId"
                            params={{ truckId: t.id }}
                            className="font-semibold hover:text-signal"
                          >
                            {t.registration}
                          </Link>
                          <div className="text-[10px] text-muted-foreground">
                            {t.bodyType} · {(t.payloadCapacityKg / 1000).toFixed(0)}t
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                              t.status === "AVAILABLE"
                                ? "bg-positive/15 text-positive"
                                : "bg-steel text-foreground"
                            }`}
                          >
                            {t.status.replaceAll("_", " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {driver ? (
                            driver.contactName
                          ) : trip ? (
                            <span className="font-semibold text-danger">Unassigned</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 uppercase">
                          {trip && trip.load
                            ? `${trip.load.origin.label} → ${trip.load.destination.label}`
                            : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {t.currentLocation.label},{" "}
                          {freeAt.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </Section>

        {/* ③ Earning opportunities */}
        <Section title="Earning opportunities">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Top loads for your available trucks">
              <div className="divide-y divide-border">
                {opportunities.length === 0 && (
                  <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No open loads match your available trucks right now.
                  </p>
                )}
                {opportunities.slice(0, 5).map(({ load, truck, score }) => (
                  <div
                    key={`${truck.id}-${load.id}`}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-bold uppercase leading-tight">
                        {load.origin.label} → {load.destination.label}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {truck.registration} · {load.cargoType.replaceAll("_", " ")}
                        {load.targetRate ? ` · ${formatMoney(load.targetRate)}` : ""}
                      </div>
                    </div>
                    <span className="font-mono text-lg font-black text-signal">{score}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Backhaul & forward-haul pre-booking">
              {backhaul.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-positive/5 px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-positive">
                    <Leaf className="size-3.5" />
                    {reservedCount > 0
                      ? `Empty running saved (${reservedCount} reserved)`
                      : "Avoidable if pre-booked"}
                  </span>
                  <span className="font-mono text-xs text-foreground">
                    {emptyKmAvoidable.toLocaleString("en-ZA")} empty km
                  </span>
                  <span className="font-mono text-xs text-foreground">{fuelAvoidableL} L fuel</span>
                  <span className="font-mono text-xs text-foreground">{co2AvoidableKg} kg CO₂</span>
                </div>
              )}
              <div className="divide-y divide-border">
                {backhaul.length === 0 && (
                  <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No eligible backhaul or pre-book load for trucks currently on a trip.
                  </p>
                )}
                {backhaul.map((b) => (
                  <div key={b.truck.id} className="px-4 py-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {b.truck.registration}
                        </span>{" "}
                        free at <span className="font-semibold uppercase">{b.dest}</span>{" "}
                        {b.eta.toLocaleDateString("en-ZA", { weekday: "short", day: "2-digit" })}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {b.reserved && (
                          <span className="rounded bg-positive px-1.5 py-0.5 text-[8px] font-bold uppercase text-background">
                            Reserved
                          </span>
                        )}
                        <span
                          className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase ${
                            b.suggestion.mode === "backhaul"
                              ? "bg-positive/15 text-positive"
                              : "bg-signal/20 text-signal-foreground"
                          }`}
                        >
                          {b.suggestion.mode === "backhaul" ? "Backhaul" : "Forward pre-book"}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm font-bold uppercase leading-tight">
                      {b.suggestion.load.origin.label} → {b.suggestion.load.destination.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {b.suggestion.load.cargoType.replaceAll("_", " ")}
                      {b.suggestion.load.targetRate
                        ? ` · ${formatMoney(b.suggestion.load.targetRate)}`
                        : ""}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Repeat className="size-3" /> {b.suggestion.repositionKm} km reposition
                      </span>
                      <span className="text-positive">
                        −{Math.round(b.suggestion.emptyKmReduced).toLocaleString("en-ZA")} empty km
                      </span>
                      <span className="inline-flex items-center gap-1 text-positive">
                        <Leaf className="size-3" /> −{Math.round(b.suggestion.co2SavedKg)} kg CO₂
                      </span>
                    </div>
                    <div className="mt-2.5">
                      {b.reserved ? (
                        <button
                          onClick={() => releaseReservation(b.truck.id, b.suggestion.load.id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-danger/10 hover:text-danger"
                        >
                          Release reservation
                        </button>
                      ) : (
                        <button
                          onClick={() => reserveBackhaul(b.truck.id, b.suggestion.load.id)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-signal px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-signal-foreground hover:brightness-105"
                        >
                          <BookmarkCheck className="size-3" /> Reserve this backhaul
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </Section>

        {/* ④ Utilisation */}
        <Section title="Utilisation">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric label="Fleet utilisation" value={`${utilisation}%`} />
            <Metric label="Revenue / truck" value={zarShort(revenuePerTruck)} hint="confirmed" />
            <Metric
              label="Avg. rate / km"
              value={avgRatePerKm === null ? "—" : `R ${avgRatePerKm.toFixed(2)}`}
              hint={`benchmark R ${RATE_BENCHMARK}`}
            />
            <Metric label="Idle 3+ days" value={String(idleTrucks.length)} />
          </div>
          {idleTrucks.length > 0 && (
            <Panel title="Idle trucks — sell this capacity" className="mt-4">
              <div className="divide-y divide-border">
                {idleTrucks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                    <span className="font-semibold">
                      {t.registration} · {t.bodyType}
                    </span>
                    <span className="text-muted-foreground">
                      {t.currentLocation.label} · idle {daysSince(t.createdAt)}d
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </Section>

        {/* ⑤ Recent activity */}
        <Section title="Recent activity">
          <Panel title="Fleet audit trail">
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
  tone = "signal",
  hint,
}: {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "signal" | "danger" | "positive";
  hint?: string;
}) {
  const active = count > 0;
  const accent =
    tone === "danger"
      ? "border-danger/40 bg-danger/10"
      : tone === "positive"
        ? "border-positive/40 bg-positive/10"
        : "border-signal/40 bg-signal/10";
  return (
    <div className={`rounded-lg border p-4 ${active ? accent : "border-border bg-graphite"}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className={`mt-2 text-3xl font-bold font-mono ${active ? "" : "text-muted-foreground"}`}>
        {count}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
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

export default TransporterDashboard;
