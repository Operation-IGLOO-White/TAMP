import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  CircleAlert,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  Truck,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { StatCard } from "@/components/tamp/StatCard";
import { StatusChip } from "@/components/tamp/StatusChip";
import { useTamp } from "@/context/TampContext";
import { isActiveTrip } from "@/lib/tamp-dashboard";
import { activeMatchForLoad, displayStatusForLoad, tripForMatch } from "@/lib/tamp-selectors";
import { Link } from "@/lib/nav";
import type { Load } from "@/types/domain";

type View = "all" | "active" | "scheduled" | "recurring";

const viewLabels: Record<View, string> = {
  all: "All shipments",
  active: "Active",
  scheduled: "Scheduled",
  recurring: "Recurring",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OwnerShipments() {
  const { loads, matches, trips, disputes, trucks, parties } = useTamp();
  const [params, setParams] = useSearchParams();
  const requestedView = params.get("view") as View | null;
  const view: View = requestedView && requestedView in viewLabels ? requestedView : "all";
  const [query, setQuery] = useState("");

  const rows = useMemo(
    () =>
      loads
        .map((load) => {
          const match = activeMatchForLoad(load.id, matches);
          const trip = tripForMatch(match?.id, trips);
          const truck = trucks.find((item) => item.id === match?.truckPostingId);
          const carrier = truck
            ? parties.find((party) => party.id === truck.transporterId)
            : undefined;
          return { load, match, trip, truck, carrier };
        })
        .sort(
          (a, b) =>
            new Date(b.load.pickupWindow.from).getTime() -
            new Date(a.load.pickupWindow.from).getTime(),
        ),
    [loads, matches, trips, trucks, parties],
  );

  const isScheduled = (load: Load, trip?: (typeof trips)[number]) =>
    trip?.status === "SCHEDULED" ||
    (new Date(load.pickupWindow.from).getTime() > Date.now() &&
      !["COMPLETED", "CANCELLED", "CLOSED"].includes(load.status));
  const activeCount = rows.filter(
    ({ trip }) => trip && isActiveTrip(trip.status) && trip.status !== "SCHEDULED",
  ).length;
  const scheduledCount = rows.filter(({ load, trip }) => isScheduled(load, trip)).length;
  const recurringCount = rows.filter(({ load }) => load.recurrence?.active).length;
  const attentionCount = rows.filter(
    ({ trip }) =>
      trip?.operationalStatus === "DELAYED" ||
      trip?.operationalStatus === "ACTION_REQUIRED" ||
      (trip && disputes.some((item) => item.tripId === trip.id && item.status !== "RESOLVED")),
  ).length;

  const filtered = rows.filter(({ load, trip, truck, carrier }) => {
    if (view === "active" && !(trip && isActiveTrip(trip.status) && trip.status !== "SCHEDULED"))
      return false;
    if (view === "scheduled" && !isScheduled(load, trip)) return false;
    if (view === "recurring" && !load.recurrence?.active) return false;
    const haystack = [
      load.id,
      load.reference,
      load.origin.label,
      load.destination.label,
      load.cargoType,
      truck?.registration,
      carrier?.contactName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <AppShell>
      <PageHeader
        title="Shipments"
        actions={
          <Link
            to="/owner/board"
            search={{ post: true }}
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-signal px-4 text-xs font-bold uppercase tracking-wide text-signal-foreground"
          >
            <Plus className="size-4" /> Post a load
          </Link>
        }
      />

      <div className="space-y-5 p-3 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="All shipments" value={String(rows.length)} icon={PackageOpen} />
          <StatCard label="Active" value={String(activeCount)} icon={Truck} accent={activeCount > 0} />
          <StatCard label="Scheduled" value={String(scheduledCount)} icon={CalendarDays} />
          <StatCard label="Recurring" value={String(recurringCount)} icon={RefreshCw} />
          <StatCard label="Needs attention" value={String(attentionCount)} icon={CircleAlert} />
        </div>

        <section className="app-surface overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="flex gap-1 overflow-x-auto rounded-lg bg-steel/50 p-1">
              {(Object.keys(viewLabels) as View[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setParams(item === "all" ? {} : { view: item })}
                  className={`whitespace-nowrap rounded-md px-3 py-2 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                    view === item
                      ? "bg-signal text-signal-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background hover:text-foreground"
                  }`}
                >
                  {viewLabels[item]}
                </button>
              ))}
            </div>
            <label className="relative block w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search route, reference, truck or carrier"
                className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-signal"
              />
            </label>
          </div>

          <div className="divide-y divide-border">
            {filtered.length === 0 && (
              <div className="px-4 py-16 text-center">
                <PackageOpen className="mx-auto mb-3 size-8 text-muted-foreground" />
                <p className="text-sm font-semibold">No {viewLabels[view].toLowerCase()} found.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try another filter or post a new load.
                </p>
              </div>
            )}
            {filtered.map(({ load, trip, truck, carrier }) => (
              <Link
                key={load.id}
                to="/owner/loads/$loadId"
                params={{ loadId: load.id }}
                className="grid gap-3 px-4 py-4 transition-colors hover:bg-steel/25 lg:grid-cols-[minmax(0,1.8fr)_minmax(170px,.7fr)_minmax(170px,.7fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">#{load.id}</span>
                    <StatusChip status={displayStatusForLoad(load, matches, trips, disputes)} />
                    {load.recurrence?.active && (
                      <span className="rounded bg-signal/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-signal">
                        Recurring
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-sm font-bold uppercase leading-snug">
                    {load.origin.label} → {load.destination.label}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {Math.round(load.weightKg / 100) / 10} t · {load.cargoType.replaceAll("_", " ")} · {load.distanceKm.toFixed(0)} km
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Pickup</p>
                  <p className="mt-1 text-xs font-medium">{formatDate(load.pickupWindow.from)}</p>
                  <p className="text-[10px] text-muted-foreground">Deliver by {formatDate(load.deliveryBy)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Carrier</p>
                  <p className="mt-1 text-xs font-semibold">{carrier?.contactName ?? "Not assigned"}</p>
                  <p className="text-[10px] text-muted-foreground">{truck?.registration ?? "Awaiting match"}</p>
                </div>
                <div className="text-left lg:text-right">
                  <p className="font-mono text-sm font-bold">
                    {load.targetRate
                      ? `R ${load.targetRate.amount.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`
                      : "Rate open"}
                  </p>
                  {trip && <p className="mt-1 text-[10px] text-muted-foreground">{trip.progressPct}% complete</p>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
