"use client";

import { Link } from "@/lib/nav";
import { ClipboardList, MapPin, PackageCheck, Star, TrendingUp, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { StatusChip } from "@/components/tamp/StatusChip";
import { TripRouteMap } from "@/components/tamp/TripRouteMap";
import { estimateEta, isActiveTrip } from "@/lib/tamp-dashboard";
import { scoreLoadAgainstTrucks } from "@/lib/tamp-matching";
import { displayStatusForLoad } from "@/lib/tamp-selectors";
import { useTamp } from "@/lib/tamp-store";

function DriverDashboard() {
  const { me, trucks, matches, loads, trips, parties, disputes } = useTamp();

  // Jobs for the trucks this driver is on (data is already scoped server-side).
  const jobs = trips
    .map((trip) => {
      const match = matches.find((m) => m.id === trip.matchId);
      const truck = trucks.find((t) => t.id === match?.truckPostingId);
      const load = loads.find((l) => l.id === match?.loadId);
      return truck && load ? { trip, truck, load } : null;
    })
    .filter((j): j is NonNullable<typeof j> => j !== null);

  const active = jobs.filter((j) => isActiveTrip(j.trip.status));
  const done = jobs.filter((j) => !isActiveTrip(j.trip.status));
  const current = active[0];

  const onTime = done.filter((j) => {
    const delivered = j.trip.events.find((e) => e.status === "DELIVERED")?.at;
    return delivered && new Date(delivered) <= new Date(j.load.deliveryBy);
  }).length;
  const onTimePct = done.length ? Math.round((onTime / done.length) * 100) : null;

  // Open opportunities that this driver's available trucks match at 70+.
  const availableTrucks = trucks.filter((t) => t.status === "AVAILABLE");
  const opportunities = loads.filter((l) => {
    if (l.status !== "POSTED") return false;
    const owner = parties.find((p) => p.id === l.ownerId);
    if (!owner) return false;
    return scoreLoadAgainstTrucks(l, availableTrucks, parties, owner).some(
      (m) => m.passed && m.score >= 70,
    );
  }).length;

  const first = me.contactName.split(" ")[0];

  return (
    <AppShell>
      <PageHeader
        title={`Welcome back, ${first}`}
        actions={
          <Link
            to="/driver"
            className="inline-flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 text-xs font-bold uppercase tracking-wide text-signal-foreground hover:brightness-105"
          >
            <PackageCheck className="size-3.5" /> My Jobs
          </Link>
        }
      />

      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <Stat label="Active jobs" value={String(active.length)} icon={<Truck className="size-4" />} />
          <Stat label="Trips done" value={String(done.length)} icon={<PackageCheck className="size-4" />} />
          <Stat label="On-time" value={onTimePct === null ? "—" : `${onTimePct}%`} icon={<TrendingUp className="size-4" />} />
          <Stat
            label="Rating"
            value={me.ratingAvg ? `${me.ratingAvg}` : "—"}
            icon={<Star className="size-4 fill-signal text-signal" />}
          />
        </div>

        {/* Current job — live tracking map + summary */}
        <Section title="Your current job">
          {current ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-graphite shadow-sm">
              <div className="p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-bold uppercase">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-positive opacity-70" />
                      <span className="relative inline-flex size-2 rounded-full bg-positive" />
                    </span>
                    {current.load.origin.label} → {current.load.destination.label}
                  </span>
                  <StatusChip
                    status={displayStatusForLoad(current.load, matches, trips, disputes)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-4">
                  <Meta label="Truck">{current.truck.registration}</Meta>
                  <Meta label="Cargo">
                    {current.load.cargoType.replaceAll("_", " ")} ·{" "}
                    {(current.load.weightKg / 1000).toFixed(0)}t
                  </Meta>
                  <Meta label="Progress">{current.trip.progressPct}%</Meta>
                  <Meta label="ETA">
                    {estimateEta(current.load, current.trip).toLocaleString("en-ZA", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Meta>
                </div>
              </div>

              {/* Live in-app route map (real road route + truck position). */}
              <TripRouteMap
                load={current.load}
                trip={current.trip}
                className="h-[42vh] min-h-[280px] w-full border-y border-border"
              />

              <Link
                to="/driver"
                className="flex items-center justify-center gap-1.5 bg-signal py-2.5 text-xs font-bold uppercase tracking-wide text-signal-foreground hover:brightness-105"
              >
                <PackageCheck className="size-3.5" /> Open full job
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-graphite/40 p-8 text-center">
              <MapPin className="mx-auto mb-2 size-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No active job right now. Check Engagements for open work.
              </p>
            </div>
          )}
        </Section>

        {/* Opportunities + trucks */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            to="/driver/engagements"
            className="flex items-center justify-between rounded-2xl border border-border bg-graphite p-4 shadow-sm hover:border-signal/50"
          >
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Job opportunities
              </div>
              <div className="mt-1 font-mono text-3xl font-black leading-none text-signal">
                {opportunities}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Open loads your truck matches 70+
              </div>
            </div>
            <ClipboardList className="size-8 text-muted-foreground" />
          </Link>

          <div className="rounded-2xl border border-border bg-graphite p-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Your trucks ({trucks.length})
            </div>
            <div className="mt-2 space-y-1.5">
              {trucks.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  No truck assigned yet — a fleet assigns you by email.
                </p>
              )}
              {trucks.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <span className="font-mono font-semibold">{t.registration}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {t.bodyType} · {t.status.replaceAll("_", " ").toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-graphite p-3 shadow-sm">
      <div className="flex items-center gap-1.5 font-mono text-2xl font-bold">
        {icon}
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
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

export default DriverDashboard;
