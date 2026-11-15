
import { Link } from "@/lib/nav";
import { BellRing, Gauge, MapPin, PackageCheck, Star, TrendingUp, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { StatusChip } from "@/components/tamp/StatusChip";
import { TripRouteMap } from "@/components/tamp/TripRouteMap";
import { estimateEta, isActiveTrip } from "@/lib/tamp-dashboard";
import { displayStatusForLoad } from "@/lib/tamp-selectors";
import { useTamp } from "@/context/TampContext";
import { fleetVehicleAsset } from "@/lib/fleet-assets";
import type { TruckPosting } from "@/types/domain";

function DriverDashboard() {
  const { me, trucks, matches, loads, trips, dispatches, disputes } = useTamp();

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
  const assignedTruck = current?.truck ?? trucks.find((truck) => truck.driverId === me.id) ?? trucks[0];

  const onTime = done.filter((j) => {
    const delivered = j.trip.events.find((e) => e.status === "DELIVERED")?.at;
    return delivered && new Date(delivered) <= new Date(j.load.deliveryBy);
  }).length;
  const onTimePct = done.length ? Math.round((onTime / done.length) * 100) : null;

  const pendingAssignments = dispatches.filter(
    (assignment) => assignment.driverId === me.id && assignment.status === "OFFERED",
  ).length;

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
        {assignedTruck && <DriverVehicleHero truck={assignedTruck} active={Boolean(current)} />}

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

        {/* Assignment inbox + assigned vehicles */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            to="/driver"
            className="flex items-center justify-between rounded-2xl border border-border bg-graphite p-4 shadow-sm hover:border-signal/50"
          >
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Assignment inbox
              </div>
              <div className="mt-1 font-mono text-3xl font-black leading-none text-signal">
                {pendingAssignments}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {pendingAssignments ? "New work waiting for your response" : "No assignments awaiting a response"}
              </div>
            </div>
            <BellRing className="size-8 text-muted-foreground" />
          </Link>

          <div className="rounded-2xl border border-border bg-graphite p-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Assigned vehicle{trucks.length === 1 ? "" : "s"} ({trucks.length})
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

function DriverVehicleHero({ truck, active }: { truck: TruckPosting; active: boolean }) {
  return (
    <section className="group relative isolate overflow-hidden rounded-[1.75rem] border border-signal/25 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 text-white shadow-[0_22px_55px_-28px_rgba(0,0,0,0.8)]">
      <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-signal/25 blur-3xl transition-transform duration-700 group-hover:scale-125" />
      <div className="pointer-events-none absolute -bottom-24 left-1/4 h-40 w-72 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="relative grid min-h-[210px] items-center gap-2 px-5 py-5 sm:grid-cols-[0.9fr_1.25fr] sm:px-7 sm:py-6">
        <div className="z-10 min-w-0">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.24em] text-amber-300">
            <span className={`size-2 rounded-full ${active ? "animate-pulse bg-emerald-400" : "bg-amber-400"}`} />
            {active ? "Your active vehicle" : "Your assigned vehicle"}
          </div>
          <h2 className="mt-2 font-mono text-2xl font-black tracking-tight sm:text-3xl">
            {truck.registration}
          </h2>
          <p className="mt-1 text-xs font-semibold text-white/60">
            {truck.year ? `${truck.year} ` : ""}{truck.make ?? "TAMP Fleet"}{truck.model ? ` ${truck.model}` : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <VehiclePill icon={<Truck className="size-3" />} text={truck.bodyType.replaceAll("_", " ")} />
            <VehiclePill icon={<Gauge className="size-3" />} text={`${(truck.payloadCapacityKg / 1000).toFixed(0)}t capacity`} />
            <VehiclePill
              icon={<MapPin className="size-3" />}
              text={truck.status.replaceAll("_", " ")}
            />
          </div>
        </div>

        <div className="relative -mb-3 mt-2 flex min-h-32 items-center justify-center sm:-mb-6 sm:mt-0 sm:min-h-44">
          <div className="absolute left-1/2 top-1/2 h-28 w-[85%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-gradient-to-r from-transparent via-signal/35 to-transparent blur-2xl" />
          <div className="absolute bottom-4 h-5 w-4/5 rounded-[50%] bg-black/70 blur-lg sm:bottom-5" />
          <img
            src={fleetVehicleAsset(truck)}
            alt={`${truck.bodyType.replaceAll("_", " ").toLowerCase()} ${truck.registration}`}
            className="relative z-10 h-36 w-full object-contain drop-shadow-[0_18px_18px_rgba(0,0,0,0.55)] transition-transform duration-500 group-hover:scale-[1.04] sm:h-48"
          />
        </div>
      </div>
      <div className="relative flex items-center justify-between border-t border-white/10 bg-white/[0.035] px-5 py-2.5 text-[10px] sm:px-7">
        <span className="font-semibold text-white/55">Assigned to you by your fleet</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-bold uppercase tracking-wide text-amber-300">
          {active ? "On duty" : "Fleet vehicle"}
        </span>
      </div>
    </section>
  );
}

function VehiclePill({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide text-white/75 backdrop-blur-md">
      <span className="text-amber-300">{icon}</span>
      {text}
    </span>
  );
}
