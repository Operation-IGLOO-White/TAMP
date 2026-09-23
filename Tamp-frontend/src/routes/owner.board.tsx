"use client";

import { useSearchParams } from "next/navigation";
import { Link } from "@/lib/nav";
import { ChevronRight, Plus, Search, Star, Truck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { Avatar } from "@/components/tamp/Avatar";
import { BODY_TYPE_LABEL } from "@/components/tamp/BodyTypeIcon";
import { PostLoadForm } from "@/components/tamp/PostLoadForm";
import { StatusChip } from "@/components/tamp/StatusChip";
import { formatMoney } from "@/lib/tamp-data";
import { maskRegistration } from "@/lib/tamp-mask";
import { scoreLoadAgainstTrucks, type ScoredMatch } from "@/lib/tamp-matching";
import {
  activeMatchForLoad,
  type DisplayStatus,
  displayStatusForLoad,
  tripForMatch,
} from "@/lib/tamp-selectors";
import { useTamp } from "@/lib/tamp-store";
import type { Load, Party, Trip, TruckPosting } from "@/lib/tamp-types";

type TruckRequest = {
  truck: TruckPosting;
  operator: Party | undefined;
  driver: Party | undefined;
  score: number;
};

type SortKey = "newest" | "pickup" | "rate-desc" | "rate-asc";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "pickup", label: "Pick-up soonest" },
  { key: "rate-desc", label: "Rate: high to low" },
  { key: "rate-asc", label: "Rate: low to high" },
];

// Posts older than this (with no carrier requests) expire off the board.
const LOAD_EXPIRY_DAYS = 7;

function BoardPage() {
  // All domain data comes from the store, hydrated from Postgres on load.
  const { loads, matches, trips, disputes, trucks, parties, acceptMatch, acceptRequest } =
    useTamp();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status") ?? undefined;
  const postParam = searchParams.get("post") === "true";
  const [posting, setPosting] = useState(postParam);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DisplayStatus | "ALL">(
    (statusParam as DisplayStatus) ?? "ALL",
  );
  const [sort, setSort] = useState<SortKey>("newest");

  // The board is the active ledger — completed/closed loads live under History.
  // For open loads we compute the highest-ranked suggested match live.
  const rows = useMemo(
    () =>
      loads
        .filter((l) => l.status !== "COMPLETED" && l.status !== "CLOSED")
        // Drop stale posts: POSTED > 7 days with no carrier requests. They move
        // to the dashboard's "Expired posts" where they can be re-posted.
        .filter((l) => {
          if (l.status !== "POSTED") return true;
          const ageDays = (Date.now() - new Date(l.createdAt).getTime()) / 864e5;
          if (ageDays < LOAD_EXPIRY_DAYS) return true;
          return matches.some((m) => m.loadId === l.id && m.status === "OFFERED");
        })
        .map((load) => {
          const status = displayStatusForLoad(load, matches, trips, disputes);
          const activeMatch = activeMatchForLoad(load.id, matches);
          const trip = tripForMatch(activeMatch?.id, trips);
          const owner = parties.find((p) => p.id === load.ownerId);
          const topMatch =
            status === "POSTED" && owner
              ? scoreLoadAgainstTrucks(load, trucks, parties, owner).find((m) => m.passed)
              : undefined;
          const engagedTruck = activeMatch
            ? trucks.find((t) => t.id === activeMatch.truckPostingId)
            : undefined;
          const engagedOperator = engagedTruck
            ? parties.find((p) => p.id === engagedTruck.transporterId)
            : undefined;
          // Carrier requests awaiting this owner's approval.
          const requests = matches
            .filter((m) => m.loadId === load.id && m.status === "OFFERED")
            .map((m) => {
              const truck = trucks.find((t) => t.id === m.truckPostingId);
              const operator = truck
                ? parties.find((p) => p.id === truck.transporterId)
                : undefined;
              const driver = truck?.driverId
                ? parties.find((p) => p.id === truck.driverId)
                : undefined;
              return truck ? { truck, operator, driver, score: m.score } : null;
            })
            .filter((r): r is TruckRequest => r !== null)
            .sort((a, b) => b.score - a.score);
          return { load, status, trip, topMatch, engagedTruck, engagedOperator, requests };
        }),
    [loads, matches, trips, disputes, trucks, parties],
  );

  const statusOptions = useMemo(() => {
    const seen = new Set<DisplayStatus>();
    rows.forEach((r) => seen.add(r.status));
    return [...seen];
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      const { load, status } = row;
      if (statusFilter !== "ALL" && status !== statusFilter) return false;
      if (!q) return true;
      // Match the load itself…
      const loadHay = [
        load.id,
        load.origin.label,
        load.destination.label,
        load.cargoType.replaceAll("_", " "),
      ];
      // …and every truck/carrier/driver attached to it (requests, best match,
      // engaged carrier) so an owner can search for a specific truck.
      const truckHay: (string | undefined)[] = [];
      const addTruck = (t?: TruckPosting, op?: Party, dr?: Party) => {
        if (t) truckHay.push(t.registration, t.bodyType, BODY_TYPE_LABEL[t.bodyType]);
        if (op) truckHay.push(op.companyName, op.contactName);
        if (dr) truckHay.push(dr.contactName);
      };
      row.requests.forEach((r) => addTruck(r.truck, r.operator, r.driver));
      addTruck(row.topMatch?.truck, row.topMatch?.operator);
      addTruck(row.engagedTruck, row.engagedOperator);
      return [...loadHay, ...truckHay]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    const rate = (r: (typeof rows)[number]) => r.load.targetRate?.amount ?? -1;
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "pickup":
          return (
            new Date(a.load.pickupWindow.from).getTime() -
            new Date(b.load.pickupWindow.from).getTime()
          );
        case "rate-desc":
          return rate(b) - rate(a);
        case "rate-asc":
          return rate(a) - rate(b);
        case "newest":
        default:
          return new Date(b.load.createdAt).getTime() - new Date(a.load.createdAt).getTime();
      }
    });
  }, [rows, query, statusFilter, sort]);

  const filtering = query.trim() !== "" || statusFilter !== "ALL";

  return (
    <AppShell>
      <PageHeader
        title="Freight Board"
        actions={
          <button
            onClick={() => setPosting((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 text-xs font-bold uppercase tracking-wide text-signal-foreground hover:brightness-105"
          >
            <Plus className="size-3.5" /> Post New Load
          </button>
        }
      />

      {posting && <PostLoadForm onDone={() => setPosting(false)} />}

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search route, cargo, ref, truck or carrier…"
            className="w-full rounded-md border border-border bg-graphite py-2 pl-9 pr-8 text-sm outline-none focus:border-signal"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DisplayStatus | "ALL")}
          className="rounded-md border border-border bg-graphite px-3 py-2 text-xs font-semibold outline-none focus:border-signal"
        >
          <option value="ALL">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-md border border-border bg-graphite px-3 py-2 text-xs font-semibold outline-none focus:border-signal"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>

        <span className="ml-auto text-xs text-muted-foreground">
          {visible.length} of {rows.length} {rows.length === 1 ? "load" : "loads"}
        </span>
      </div>

      {loads.length === 0 && (
        <div className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No loads posted yet. Post your first load to start receiving truck suggestions.
          </p>
        </div>
      )}

      {loads.length > 0 && visible.length === 0 && (
        <div className="p-10 text-center">
          <p className="text-sm text-muted-foreground">No loads match your filters.</p>
          {filtering && (
            <button
              onClick={() => {
                setQuery("");
                setStatusFilter("ALL");
              }}
              className="mt-3 text-xs font-bold uppercase tracking-wide text-signal hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4 p-4 sm:p-6 xl:grid-cols-2">
        {visible.map((row) => (
          <LoadCard
            key={row.load.id}
            {...row}
            onAccept={() => row.topMatch && acceptMatch(row.load.id, row.topMatch.truck.id)}
            onAcceptRequest={(truckId) => acceptRequest(row.load.id, truckId)}
          />
        ))}
      </div>
    </AppShell>
  );
}

function LoadCard({
  load,
  status,
  trip,
  topMatch,
  engagedTruck,
  engagedOperator,
  requests,
  onAccept,
  onAcceptRequest,
}: {
  load: Load;
  status: DisplayStatus;
  trip: Trip | undefined;
  topMatch: ScoredMatch | undefined;
  engagedTruck: TruckPosting | undefined;
  engagedOperator: Party | undefined;
  requests: TruckRequest[];
  onAccept: () => void;
  onAcceptRequest: (truckId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-graphite shadow-sm transition-shadow hover:shadow-md">
      {/* Load header */}
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="font-mono text-[11px] text-muted-foreground">#{load.id}</div>
          <Link
            to="/owner/loads/$loadId"
            params={{ loadId: load.id }}
            className="text-lg font-bold uppercase leading-tight hover:text-signal"
          >
            {load.origin.label} → {load.destination.label}
          </Link>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {(load.weightKg / 1000).toFixed(0)}t · {load.requiredBodyTypes.join("/")} ·{" "}
            {load.cargoType.replaceAll("_", " ")}
          </div>
        </div>
        <div className="text-right">
          <StatusChip status={status} />
          <div className="mt-1.5 font-mono text-sm font-semibold">
            {load.targetRate ? formatMoney(load.targetRate) : "—"}
          </div>
          <div className="text-[10px] uppercase text-muted-foreground">
            {trip
              ? `Progress ${trip.progressPct}%`
              : `Pick-up ${new Date(load.pickupWindow.from).toLocaleDateString("en-ZA")}`}
          </div>
        </div>
      </div>

      {/* Requests / best match / engagement */}
      <div className="flex-1 p-4">
        {requests.length > 0 ? (
          <div className="rounded-lg border border-signal/40 bg-signal/5 p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-signal-foreground">
              {requests.length > 1 ? `Best of ${requests.length} requests` : "Carrier request"}
            </div>
            {/* Highest-scoring request first, the rest under "View more". */}
            <RequestRow r={requests[0]!} onAccept={() => onAcceptRequest(requests[0]!.truck.id)} />
            {requests.length > 1 && (
              <>
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="mt-2 text-[10px] font-bold uppercase tracking-widest text-signal hover:underline"
                >
                  {showAll ? "Hide other requests" : `View more (${requests.length - 1})`}
                </button>
                {showAll && (
                  <div className="mt-2 space-y-2 border-t border-signal/20 pt-2">
                    {requests.slice(1).map((r) => (
                      <RequestRow
                        key={r.truck.id}
                        r={r}
                        onAccept={() => onAcceptRequest(r.truck.id)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : topMatch ? (
          <div className="rounded-lg border border-signal/40 bg-signal/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-foreground">
                Best match
              </span>
              <span className="flex items-baseline gap-0.5">
                <span className="font-mono text-2xl font-black leading-none text-signal">
                  {topMatch.score}
                </span>
                <span className="text-[9px] font-bold text-muted-foreground">/100</span>
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <Avatar party={topMatch.operator} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{topMatch.operator.companyName}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {topMatch.truck.bodyType} · {maskRegistration(topMatch.truck.registration)}
                </div>
              </div>
              <RatingBadge
                value={topMatch.operator.ratingAvg}
                count={topMatch.operator.ratingCount}
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={onAccept}
                className="flex-1 rounded-md bg-signal py-2 text-[11px] font-black uppercase tracking-widest text-signal-foreground hover:brightness-105"
              >
                Accept match
              </button>
              <Link
                to="/owner/loads/$loadId"
                params={{ loadId: load.id }}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-foreground hover:bg-steel/40"
              >
                View more <ChevronRight className="size-3.5" />
              </Link>
            </div>
          </div>
        ) : engagedTruck && engagedOperator ? (
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {status === "CONFIRMED" || trip ? "Assigned carrier" : "Accepted carrier"}
            </div>
            <div className="flex items-center gap-2.5">
              <Avatar party={engagedOperator} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{engagedOperator.companyName}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {engagedTruck.bodyType} · {maskRegistration(engagedTruck.registration)}
                </div>
              </div>
              <Link
                to="/owner/loads/$loadId"
                params={{ loadId: load.id }}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-foreground hover:bg-steel/40"
              >
                View <ChevronRight className="size-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-3">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Truck className="size-4" /> No eligible trucks yet
            </span>
            <Link
              to="/owner/loads/$loadId"
              params={{ loadId: load.id }}
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-signal hover:underline"
            >
              View more <ChevronRight className="size-3.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function RequestRow({ r, onAccept }: { r: TruckRequest; onAccept: () => void }) {
  // Surface the assigned driver as the person who'll do the run; the fleet
  // operator and truck are the supporting detail.
  const face = r.driver ?? r.operator;
  const fleet = r.operator?.companyName;
  return (
    <div className="flex items-center gap-2.5">
      {face && <Avatar party={face} size="sm" />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">
          {r.driver ? r.driver.contactName : (fleet ?? "Carrier")}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {r.driver && fleet ? `${fleet} · ` : ""}
          {r.truck.bodyType} · {maskRegistration(r.truck.registration)}
        </div>
      </div>
      <RatingBadge
        value={(r.driver ?? r.operator)?.ratingAvg ?? null}
        count={(r.driver ?? r.operator)?.ratingCount ?? 0}
      />
      <span className="font-mono text-lg font-black text-signal">{r.score}</span>
      <button
        onClick={onAccept}
        className="rounded-md bg-signal px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-signal-foreground hover:brightness-105"
      >
        Accept
      </button>
    </div>
  );
}

function RatingBadge({ value, count }: { value: number | null; count: number }) {
  if (value === null) {
    return <span className="text-[10px] font-semibold text-muted-foreground">New</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs font-bold">
      <Star className="size-3.5 fill-signal text-signal" />
      {value}
      <span className="text-[10px] font-normal text-muted-foreground">({count})</span>
    </span>
  );
}

export default BoardPage;
