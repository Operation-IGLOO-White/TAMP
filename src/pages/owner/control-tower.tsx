import { AlertTriangle, Clock3, MapPinned, RadioTower, Truck } from "lucide-react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { FleetMap } from "@/components/tamp/FleetMap";
import { Panel, StatCard } from "@/components/tamp/StatCard";
import { StatusChip } from "@/components/tamp/StatusChip";
import { TripProgress } from "@/components/tamp/TripProgress";
import { useTamp } from "@/context/TampContext";
import { enrichTrip, isActiveTrip, lastEventAt, tripDisputed } from "@/lib/tamp-dashboard";
import { displayStatusForLoad } from "@/lib/tamp-selectors";
import { Link } from "@/lib/nav";

function elapsed(iso?: string | null) {
  if (!iso) return "No GPS fix";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "Updated now";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  return `Updated ${Math.floor(minutes / 60)} h ago`;
}

export default function OwnerControlTower() {
  const { loads, matches, trips, trucks, parties, disputes, dispatches, incidents } = useTamp();
  const data = { loads, matches, trucks, parties };
  const active = trips
    .filter((trip) => isActiveTrip(trip.status))
    .map((trip) => enrichTrip(trip, data))
    .filter((item) => item.load);
  const onRoad = active.filter(({ trip }) => ["LOADED", "IN_TRANSIT"].includes(trip.status)).length;
  const atPickup = active.filter(({ trip }) => ["EN_ROUTE_PICKUP", "AT_PICKUP"].includes(trip.status)).length;
  const atDropoff = active.filter(({ trip }) => trip.status === "AT_DROPOFF").length;
  const exceptions = active.filter(({ trip }) =>
    tripDisputed(trip, disputes) || ["DELAYED", "ACTION_REQUIRED"].includes(trip.operationalStatus ?? ""),
  );
  const stale = active.filter(({ trip }) => {
    const updatedAt = trip.livePosition?.updatedAt ?? trip.simulatedPosition?.updatedAt ?? lastEventAt(trip);
    return updatedAt && Date.now() - new Date(updatedAt).getTime() > 15 * 60_000;
  });
  const shipmentGroups = loads
    .map((load) => {
      const allocations = matches
        .filter((match) => match.loadId === load.id && (match.status === "ACCEPTED" || match.status === "CONFIRMED" || trips.some((trip) => trip.matchId === match.id)))
        .map((match) => {
          const trip = trips.find((candidate) => candidate.matchId === match.id);
          const truck = trucks.find((candidate) => candidate.id === match.truckPostingId);
          const assignment = trip ? [...dispatches].reverse().find((candidate) => candidate.tripId === trip.id) : undefined;
          const driver = parties.find((candidate) => candidate.id === assignment?.driverId);
          const activeIncidents = trip ? incidents.filter((candidate) => candidate.tripId === trip.id && candidate.status !== "RESOLVED") : [];
          const updatedAt = trip?.livePosition?.updatedAt ?? trip?.simulatedPosition?.updatedAt ?? (trip ? lastEventAt(trip) : undefined);
          const gpsStale = Boolean(updatedAt && Date.now() - new Date(updatedAt).getTime() > 15 * 60_000);
          return { match, trip, truck, assignment, driver, activeIncidents, updatedAt, gpsStale };
        });
      const live = allocations.filter((allocation) => allocation.trip?.status !== "CANCELLED");
      const required = load.trucksRequired ?? 1;
      const delivered = live.filter((allocation) => allocation.trip && ["DELIVERED", "COMPLETED"].includes(allocation.trip.status)).length;
      const operating = live.filter((allocation) => allocation.trip && isActiveTrip(allocation.trip.status) && allocation.trip.status !== "SCHEDULED").length;
      const exceptions = live.filter((allocation) => allocation.activeIncidents.length || allocation.gpsStale || ["DELAYED", "ACTION_REQUIRED"].includes(allocation.trip?.operationalStatus ?? "")).length;
      const openSlots = Math.max(0, required - live.length);
      return { load, allocations, live, required, delivered, operating, exceptions, openSlots };
    })
    .filter((group) => group.allocations.length && (group.required > 1 || group.operating || group.exceptions || group.openSlots))
    .sort((a, b) => b.exceptions - a.exceptions || +new Date(a.load.pickupWindow.from) - +new Date(b.load.pickupWindow.from));

  return (
    <AppShell>
      <PageHeader
        title="Control Tower"
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border border-positive/30 bg-positive/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-positive">
            <span className="relative flex size-2"><span className="absolute size-full animate-ping rounded-full bg-positive" /><span className="relative size-2 rounded-full bg-positive" /></span>
            Live operations
          </span>
        }
      />
      <div className="space-y-5 p-3 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Active movements" value={String(active.length)} icon={RadioTower} accent />
          <StatCard label="On the road" value={String(onRoad)} icon={Truck} />
          <StatCard label="At pickup" value={String(atPickup)} icon={MapPinned} />
          <StatCard label="At drop-off" value={String(atDropoff)} icon={MapPinned} />
          <StatCard label="Exceptions" value={String(exceptions.length)} icon={AlertTriangle} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(290px,.8fr)]">
          <FleetMap loadIds={loads.map((load) => load.id)} className="shadow-sm" />
          <Panel title={`Needs attention (${exceptions.length + stale.length})`}>
            <div className="max-h-[520px] divide-y divide-border overflow-y-auto">
              {exceptions.length === 0 && stale.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <RadioTower className="mx-auto mb-3 size-7 text-positive" />
                  <p className="text-sm font-semibold">Operations are clear</p>
                  <p className="mt-1 text-xs text-muted-foreground">No active exceptions or stale GPS updates.</p>
                </div>
              )}
              {exceptions.map(({ trip, load }) => (
                <Link key={`exception-${trip.id}`} to="/owner/loads/$loadId" params={{ loadId: load!.id }} className="block px-4 py-3 hover:bg-danger/5">
                  <p className="flex items-center gap-2 text-xs font-bold text-danger"><AlertTriangle className="size-4" /> Trip requires attention</p>
                  <p className="mt-1 line-clamp-2 text-[11px] font-medium">{load!.origin.label} → {load!.destination.label}</p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">#{trip.id}</p>
                </Link>
              ))}
              {stale.map(({ trip, load }) => (
                <Link key={`stale-${trip.id}`} to="/owner/loads/$loadId" params={{ loadId: load!.id }} className="block px-4 py-3 hover:bg-signal/5">
                  <p className="flex items-center gap-2 text-xs font-bold"><Clock3 className="size-4 text-signal" /> GPS update is stale</p>
                  <p className="mt-1 line-clamp-2 text-[11px] font-medium">{load!.origin.label} → {load!.destination.label}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{elapsed(trip.livePosition?.updatedAt ?? trip.simulatedPosition?.updatedAt)}</p>
                </Link>
              ))}
            </div>
          </Panel>
        </div>

        <Panel title={`Shipment fleet execution (${shipmentGroups.length})`}>
          <div className="divide-y divide-border">
            {shipmentGroups.length === 0 && <p className="px-4 py-10 text-center text-xs text-muted-foreground">No multi-truck or exception-managed shipments are active.</p>}
            {shipmentGroups.map((group) => (
              <div key={group.load.id} className="p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><StatusChip status={displayStatusForLoad(group.load, matches, trips, disputes)} /><span className="font-mono text-[10px] text-muted-foreground">{group.load.reference || group.load.id}</span></div>
                    <Link to="/owner/loads/$loadId" params={{ loadId: group.load.id }} className="mt-2 block line-clamp-2 text-sm font-black uppercase hover:text-signal">{group.load.origin.label} → {group.load.destination.label}</Link>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <FleetMetric label="Delivered" value={`${group.delivered}/${group.required}`} positive={group.delivered === group.required} />
                    <FleetMetric label="Operating" value={String(group.operating)} />
                    <FleetMetric label="Open slots" value={String(group.openSlots)} alert={group.openSlots > 0} />
                    <FleetMetric label="Exceptions" value={String(group.exceptions)} alert={group.exceptions > 0} />
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-steel"><div className="h-full bg-positive transition-[width] duration-500" style={{ width: `${Math.min(100, (group.delivered / group.required) * 100)}%` }} /></div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                  {group.allocations.map((allocation) => {
                    const cancelled = allocation.trip?.status === "CANCELLED";
                    const issue = allocation.activeIncidents[0];
                    return <Link key={allocation.match.id} to="/owner/loads/$loadId" params={{ loadId: group.load.id }} className={`rounded-xl border p-3 transition hover:border-signal ${cancelled ? "border-danger/30 bg-danger/5 opacity-70" : issue || allocation.gpsStale ? "border-danger/40 bg-danger/5" : "border-border bg-background"}`}>
                      <div className="flex items-start justify-between gap-2"><div><p className="font-mono text-xs font-black">{allocation.truck?.registration ?? "Truck pending"}</p><p className="mt-0.5 text-[9px] uppercase text-muted-foreground">{allocation.driver?.contactName ?? (allocation.assignment?.status === "OFFERED" ? "Driver response pending" : "Driver required")}</p></div><span className={`rounded px-2 py-1 text-[8px] font-black uppercase ${cancelled || issue ? "bg-danger/10 text-danger" : allocation.trip && ["DELIVERED", "COMPLETED"].includes(allocation.trip.status) ? "bg-positive/10 text-positive" : "bg-signal/15 text-signal"}`}>{cancelled ? "Cancelled" : allocation.trip?.status.replaceAll("_", " ") ?? allocation.match.status}</span></div>
                      <div className="mt-3 flex items-end justify-between gap-3"><div><p className="text-[9px] text-muted-foreground">{allocation.trip ? `${allocation.trip.progressPct}% complete` : "Trip pending"}</p><p className={`mt-1 text-[9px] ${allocation.gpsStale ? "font-bold text-danger" : "text-muted-foreground"}`}>{allocation.gpsStale ? "GPS update overdue" : elapsed(allocation.updatedAt)}</p></div>{issue && <span className="rounded-full bg-danger/10 px-2 py-1 text-[8px] font-black uppercase text-danger">{issue.kind.replaceAll("_", " ")}</span>}</div>
                    </Link>;
                  })}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={`Active movements (${active.length})`}>
          <div className="divide-y divide-border">
            {active.length === 0 && <p className="px-4 py-10 text-center text-xs text-muted-foreground">No active movements.</p>}
            {active.map(({ trip, load, truck, driver }) => {
              const updatedAt = trip.livePosition?.updatedAt ?? trip.simulatedPosition?.updatedAt ?? lastEventAt(trip);
              return (
                <Link key={trip.id} to="/owner/loads/$loadId" params={{ loadId: load!.id }} className="grid gap-3 px-4 py-4 hover:bg-steel/25 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,.8fr)_minmax(150px,.5fr)] lg:items-center">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2"><StatusChip status={displayStatusForLoad(load!, matches, trips, disputes)} /><span className="font-mono text-[10px] text-muted-foreground">#{trip.id}</span></div>
                    <p className="line-clamp-2 text-sm font-bold uppercase">{load!.origin.label} → {load!.destination.label}</p>
                  </div>
                  <TripProgress status={trip.status} />
                  <div className="text-xs lg:text-right">
                    <p className="font-semibold">{truck?.registration ?? "Truck unassigned"}</p>
                    <p className="text-muted-foreground">{driver?.contactName ?? "Driver unassigned"}</p>
                    <p className={`mt-1 text-[10px] ${stale.some((item) => item.trip.id === trip.id) ? "text-danger" : "text-muted-foreground"}`}>{elapsed(updatedAt)}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function FleetMetric({ label, value, positive = false, alert = false }: { label: string; value: string; positive?: boolean; alert?: boolean }) {
  return <div className={`min-w-20 rounded-xl border px-3 py-2 text-center ${alert ? "border-danger/30 bg-danger/5" : "border-border bg-background"}`}><p className={`font-mono text-base font-black ${positive ? "text-positive" : alert ? "text-danger" : "text-foreground"}`}>{value}</p><p className="mt-0.5 text-[8px] font-bold uppercase text-muted-foreground">{label}</p></div>;
}
