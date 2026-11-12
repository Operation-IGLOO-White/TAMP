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
  const { loads, matches, trips, trucks, parties, disputes } = useTamp();
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
