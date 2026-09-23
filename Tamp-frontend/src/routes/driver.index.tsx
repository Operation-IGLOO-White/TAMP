"use client";

import {
  CheckCircle2,
  ChevronRight,
  Copy,
  Flag,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Minus,
  Package,
  PackageCheck,
  Phone,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Truck,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/tamp/AppShell";
import { Avatar } from "@/components/tamp/Avatar";
import { DisputeDialog } from "@/components/tamp/DisputeDialog";
import { PodCapture } from "@/components/tamp/PodCapture";
import { TripRouteMap } from "@/components/tamp/TripRouteMap";
import { zar } from "@/lib/tamp-data";
import { estimateEta, isActiveTrip } from "@/lib/tamp-dashboard";
import { openDisputeForTrip } from "@/lib/tamp-selectors";
import { useTamp } from "@/lib/tamp-store";
import type { Load, Party, Trip, TruckPosting } from "@/lib/tamp-types";

interface Job {
  trip: Trip;
  load: Load;
  truck: TruckPosting;
  owner: Party | undefined;
}

const NEXT_STEP: Record<string, string> = {
  SCHEDULED: "Arrived at pickup",
  AT_PICKUP: "Loaded",
  LOADED: "In transit",
  IN_TRANSIT: "Arrived at drop-off",
  AT_DROPOFF: "Delivered",
};

const STATUS_ORDER: Record<string, number> = {
  SCHEDULED: -1,
  AT_PICKUP: 0,
  LOADED: 1,
  IN_TRANSIT: 2,
  AT_DROPOFF: 3,
  DELIVERED: 4,
  COMPLETED: 4,
};

// Colour-coded status pill matching the tracking design.
function statusMeta(status: string): { label: string; cls: string } {
  if (status === "DELIVERED" || status === "COMPLETED")
    return { label: "Delivered", cls: "bg-positive/15 text-positive" };
  if (status === "CANCELLED") return { label: "Cancelled", cls: "bg-danger/15 text-danger" };
  if (status === "SCHEDULED") return { label: "Upcoming", cls: "bg-signal/20 text-signal-foreground" };
  return { label: "In-transit", cls: "bg-sky-400/15 text-sky-500" };
}

type FilterKey = "all" | "in-transit" | "delivered";

function DriverJobs() {
  const { trucks, matches, loads, trips, parties, disputes, advanceTrip } = useTamp();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [disputeLoadId, setDisputeLoadId] = useState<string | null>(null);
  const [mapJob, setMapJob] = useState<Job | null>(null);
  const [podJob, setPodJob] = useState<Job | null>(null);

  // Delivering requires proof: at drop-off, capture POD first, then advance.
  const advance = (job: Job) => {
    if (job.trip.status === "AT_DROPOFF") setPodJob(job);
    else void advanceTrip(job.load.id);
  };

  const jobs: Job[] = useMemo(
    () =>
      trips
        .map((trip) => {
          const match = matches.find((m) => m.id === trip.matchId);
          const truck = trucks.find((t) => t.id === match?.truckPostingId);
          if (!truck) return null;
          const load = loads.find((l) => l.id === match?.loadId);
          if (!load) return null;
          const owner = parties.find((p) => p.id === load.ownerId);
          return { trip, load, truck, owner } satisfies Job;
        })
        .filter((j): j is Job => j !== null)
        // Active jobs first, then most recent.
        .sort((a, b) => Number(isActiveTrip(b.trip.status)) - Number(isActiveTrip(a.trip.status))),
    [trips, matches, trucks, loads, parties],
  );

  const counts = {
    all: jobs.length,
    "in-transit": jobs.filter((j) => isActiveTrip(j.trip.status)).length,
    delivered: jobs.filter((j) => !isActiveTrip(j.trip.status)).length,
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (filter === "in-transit" && !isActiveTrip(j.trip.status)) return false;
      if (filter === "delivered" && isActiveTrip(j.trip.status)) return false;
      if (!q) return true;
      return [j.load.id, j.trip.id, j.load.origin.label, j.load.destination.label, j.owner?.contactName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [jobs, filter, query]);

  // Selected job drives the map + tracking panel; default to the first visible.
  const selected = (selectedId && jobs.find((j) => j.trip.id === selectedId)) || visible[0] || null;

  return (
    <AppShell>
      <div className="flex h-full flex-col lg:flex-row">
        {/* ── Loads list ─────────────────────────────────────────── */}
        <div className="flex w-full shrink-0 flex-col border-b border-border lg:w-[400px] lg:border-b-0 lg:border-r">
          <div className="border-b border-border p-4 sm:p-5">
            <h1 className="mb-3 text-xl font-extrabold tracking-tight">My jobs</h1>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search route, client or ref…"
                className="w-full rounded-lg border border-border bg-graphite py-2.5 pl-9 pr-3 text-sm outline-none focus:border-signal"
              />
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              {(
                [
                  ["all", "All"],
                  ["in-transit", "In-transit"],
                  ["delivered", "Delivered"],
                ] as [FilterKey, string][]
              ).map(([key, label]) => {
                const on = filter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      on
                        ? "bg-signal text-signal-foreground"
                        : "text-muted-foreground hover:bg-steel/40"
                    }`}
                  >
                    {label}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        on ? "bg-signal-foreground/15" : "bg-steel/60"
                      }`}
                    >
                      {counts[key]}
                    </span>
                  </button>
                );
              })}
              <span className="ml-auto grid size-8 place-items-center rounded-lg border border-border text-muted-foreground">
                <SlidersHorizontal className="size-4" />
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
            {visible.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-graphite/40 p-10 text-center">
                <MapPin className="mx-auto mb-3 size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {jobs.length === 0
                    ? "No job assigned. New deliveries for your truck appear here."
                    : "No jobs match your filters."}
                </p>
              </div>
            ) : (
              visible.map((job) => (
                <LoadCard
                  key={job.trip.id}
                  job={job}
                  selected={selected?.trip.id === job.trip.id}
                  onSelect={() => {
                    setSelectedId(job.trip.id);
                    // On mobile the map is hidden — open the fullscreen map.
                    if (window.matchMedia("(max-width: 1023px)").matches) setMapJob(job);
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Map + tracking panel (desktop) ─────────────────────── */}
        <div className="relative hidden min-w-0 flex-1 lg:block">
          {selected ? (
            <>
              <TripRouteMap
                key={selected.trip.id}
                load={selected.load}
                trip={selected.trip}
                className="h-full w-full"
                zoomable={false}
              />
              <TrackingPanel
                job={selected}
                disputed={!!openDisputeForTrip(selected.trip.id, disputes)}
                onAdvance={() => advance(selected)}
                onFlag={() => setDisputeLoadId(selected.load.id)}
                onFullscreen={() => setMapJob(selected)}
              />
            </>
          ) : (
            <div className="flex h-full items-center justify-center bg-graphite/30 text-center">
              <div>
                <MapPin className="mx-auto mb-3 size-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Select a job to track it on the map.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <DisputeDialog
        loadId={disputeLoadId ?? ""}
        open={disputeLoadId !== null}
        onClose={() => setDisputeLoadId(null)}
      />

      {/* Fullscreen route map (mobile + "expand"). */}
      {mapJob && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/60 p-3 sm:p-6"
          onClick={() => setMapJob(null)}
        >
          <div
            className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-graphite shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold uppercase">
                  {mapJob.load.origin.label} → {mapJob.load.destination.label}
                </div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {mapJob.trip.id} · live route
                </div>
              </div>
              <button
                onClick={() => setMapJob(null)}
                aria-label="Close map"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-steel/50 hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            <TripRouteMap load={mapJob.load} trip={mapJob.trip} className="min-h-0 flex-1" />
          </div>
        </div>
      )}

      {/* Proof of delivery capture — on marking the trip Delivered. */}
      {podJob && (
        <PodCapture
          route={`${podJob.load.origin.label} → ${podJob.load.destination.label}`}
          onCancel={() => setPodJob(null)}
          onConfirm={(pod) => {
            // POD + delivery are one authoritative, atomic server command.
            void advanceTrip(podJob.load.id, {
              recipientName: pod.recipientName,
              signature: pod.signature,
              photoName: pod.photoName,
              photoUrl: pod.photoUrl,
              note: pod.note,
            });
            setPodJob(null);
          }}
        />
      )}
    </AppShell>
  );
}

// ── List item ───────────────────────────────────────────────────
function LoadCard({
  job,
  selected,
  onSelect,
}: {
  job: Job;
  selected: boolean;
  onSelect: () => void;
}) {
  const { trip, load, owner } = job;
  const meta = statusMeta(trip.status);
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-2xl border bg-graphite p-4 text-left shadow-sm transition-colors ${
        selected ? "border-signal ring-1 ring-signal/40" : "border-border hover:border-signal/50"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-steel/50 text-foreground">
            <Package className="size-4" />
          </span>
          <span className="font-mono text-sm font-bold">#{load.id}</span>
        </span>
        <span className={`rounded-md px-2 py-1 text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>
      </div>

      <RouteRail status={trip.status} pct={trip.progressPct} />

      <div className="mt-1.5 flex items-start justify-between gap-3 text-[11px] text-muted-foreground">
        <span className="max-w-[45%] truncate">{load.origin.label}</span>
        <span className="max-w-[45%] truncate text-right">{load.destination.label}</span>
      </div>

      {owner && (
        <div className="mt-3 flex items-center gap-2.5 border-t border-border pt-3">
          <Avatar party={owner} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{owner.contactName}</div>
            <div className="text-[11px] text-muted-foreground">Client</div>
          </div>
          <a
            href={`tel:${owner.phone.replace(/\s/g, "")}`}
            onClick={(e) => e.stopPropagation()}
            className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
            aria-label="Call client"
          >
            <Phone className="size-3.5" />
          </a>
        </div>
      )}
    </button>
  );
}

// Origin → truck(progress) → destination rail.
function RouteRail({ status, pct }: { status: string; pct: number }) {
  const delivered = status === "DELIVERED" || status === "COMPLETED";
  const p = delivered ? 100 : Math.min(96, Math.max(4, pct));
  return (
    <div className="flex items-center gap-2">
      <span className="size-2 shrink-0 rounded-full bg-foreground" />
      <div className="relative h-0.5 flex-1 rounded bg-border">
        <div className="absolute inset-y-0 left-0 rounded bg-foreground" style={{ width: `${p}%` }} />
        <span
          className="absolute top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-background text-foreground shadow-sm"
          style={{ left: `${p}%` }}
        >
          <Truck className="size-3" />
        </span>
      </div>
      <span
        className={`size-2 shrink-0 rounded-full ${delivered ? "bg-foreground" : "border-2 border-border bg-background"}`}
      />
    </div>
  );
}

// ── Floating tracking panel over the map ─────────────────────────
type PanelTab = "info" | "tracking" | "docs";

function TrackingPanel({
  job,
  disputed,
  onAdvance,
  onFlag,
  onFullscreen,
}: {
  job: Job;
  disputed: boolean;
  onAdvance: () => void;
  onFlag: () => void;
  onFullscreen: () => void;
}) {
  const [tab, setTab] = useState<PanelTab>("tracking");
  const [minimized, setMinimized] = useState(false);
  const { trip, load, truck, owner } = job;
  const meta = statusMeta(trip.status);
  const nextStep = NEXT_STEP[trip.status];
  const eta = estimateEta(load, trip);
  const delivered = trip.status === "DELIVERED" || trip.status === "COMPLETED";

  // Minimized: a compact pill that expands back to the full panel.
  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="absolute left-4 top-4 z-[500] flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 shadow-2xl hover:border-signal/50"
      >
        <span className="text-sm font-bold">No: #{load.id}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${meta.cls}`}>
          {meta.label}
        </span>
        <Maximize2 className="size-3.5 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="absolute left-4 top-4 z-[500] flex max-h-[calc(100%-2rem)] w-[340px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">No: #{load.id}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${meta.cls}`}>
            {meta.label}
          </span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <button
            onClick={() => navigator.clipboard?.writeText(load.id).catch(() => {})}
            className="rounded p-1 hover:bg-steel/50 hover:text-foreground"
            aria-label="Copy reference"
          >
            <Copy className="size-3.5" />
          </button>
          <button
            onClick={onFullscreen}
            className="rounded p-1 hover:bg-steel/50 hover:text-foreground"
            aria-label="Fullscreen map"
          >
            <MapIcon className="size-3.5" />
          </button>
          <button
            onClick={() => setMinimized(true)}
            className="rounded p-1 hover:bg-steel/50 hover:text-foreground"
            aria-label="Minimize"
          >
            <Minus className="size-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border px-3 py-2">
        {(
          [
            ["info", "Load info"],
            ["tracking", "Tracking"],
            ["docs", "Docs"],
          ] as [PanelTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === key ? "bg-signal text-signal-foreground" : "text-muted-foreground hover:bg-steel/40"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {tab === "tracking" && <StageTimeline job={job} />}

        {tab === "info" && (
          <dl className="space-y-2.5 text-sm">
            <InfoRow label="Route" value={`${load.origin.label} → ${load.destination.label}`} />
            <InfoRow label="Rate" value={load.targetRate ? zar(load.targetRate.amount) : "On file"} />
            <InfoRow
              label="Cargo"
              value={`${load.cargoType.replaceAll("_", " ")} · ${(load.weightKg / 1000).toFixed(1)}t`}
            />
            <InfoRow label="Distance" value={`${load.distanceKm} km`} />
            <InfoRow label="Vehicle" value={`${truck.bodyType} · ${truck.registration}`} />
            <InfoRow
              label="ETA"
              value={eta.toLocaleString("en-ZA", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            />
            {owner && <InfoRow label="Client" value={`${owner.contactName} · ${owner.companyName}`} />}
          </dl>
        )}

        {tab === "docs" && (
          <div className="space-y-2 text-sm">
            <DocRow label="Waybill" status={`#${load.id}`} />
            <DocRow
              label="Proof of delivery"
              status={delivered ? "Captured" : "Pending"}
              done={delivered}
            />
          </div>
        )}
      </div>

      {/* Action footer */}
      {!delivered && (
        <div className="space-y-2 border-t border-border p-3">
          {nextStep && (
            <button
              onClick={onAdvance}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-signal py-2.5 text-xs font-black uppercase tracking-widest text-signal-foreground hover:brightness-105"
            >
              {nextStep} <ChevronRight className="size-4" />
            </button>
          )}
          {!disputed ? (
            <button
              onClick={onFlag}
              className="flex w-full items-center justify-center gap-1.5 py-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-danger"
            >
              <Flag className="size-3.5" /> Report an issue
            </button>
          ) : (
            <div className="flex items-center justify-center gap-1.5 py-1 text-[11px] font-bold uppercase tracking-widest text-danger">
              <Flag className="size-3.5" /> Issue reported
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium capitalize text-foreground">{value}</dd>
    </div>
  );
}

function DocRow({ label, status, done }: { label: string; status: string; done?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
      <span className="font-semibold">{label}</span>
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
          done ? "text-positive" : "text-muted-foreground"
        }`}
      >
        {done && <CheckCircle2 className="size-3.5" />}
        {status}
      </span>
    </div>
  );
}

// ── Delivery timeline (reused inside the tracking panel) ─────────
function StageTimeline({ job }: { job: Job }) {
  const { trip, load } = job;
  const finished = trip.status === "DELIVERED" || trip.status === "COMPLETED";
  const currentIdx = STATUS_ORDER[trip.status] ?? -1;

  const stages = [
    { key: "AT_PICKUP", title: "At pickup", desc: `Collect at ${load.origin.label}`, Icon: ShoppingBag },
    { key: "LOADED", title: "Loaded", desc: "Cargo loaded & secured", Icon: Package },
    { key: "IN_TRANSIT", title: "In transit", desc: "On the road", Icon: Truck },
    { key: "AT_DROPOFF", title: "At drop-off", desc: `Arrive at ${load.destination.label}`, Icon: MapPin },
    { key: "DELIVERED", title: "Delivered", desc: "Handed to consignee", Icon: PackageCheck },
  ];

  const timeFor = (key: string) => {
    const evt = trip.events.find((e) => e.status === key);
    return evt
      ? new Date(evt.at).toLocaleString("en-ZA", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
  };

  return (
    <ol>
      {stages.map((s, i) => {
        const done = i < currentIdx || (finished && i <= currentIdx);
        const active = i === currentIdx && !finished;
        const on = done || active;
        const at = timeFor(s.key);
        const isLast = i === stages.length - 1;
        return (
          <li key={s.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full border transition-colors ${
                  active
                    ? "border-signal bg-signal/10 text-foreground ring-4 ring-signal/15"
                    : done
                      ? "border-solid border-positive/50 bg-positive/10 text-positive"
                      : "border-dashed border-border text-muted-foreground"
                }`}
              >
                <s.Icon className="size-4" />
              </span>
              {!isLast && (
                <span className={`my-1 w-px flex-1 ${done ? "bg-positive/40" : "bg-border"}`} />
              )}
            </div>
            <div className={`flex flex-1 items-start justify-between gap-3 ${isLast ? "" : "pb-4"}`}>
              <div className="min-w-0">
                <div className={`text-sm font-bold leading-tight ${on ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.title}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">{s.desc}</div>
              </div>
              <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                {at ?? (active ? "now" : "—")}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default DriverJobs;
