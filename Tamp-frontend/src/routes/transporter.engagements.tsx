"use client";

import { Link } from "@/lib/nav";
import { ChevronRight, Flag, Star, UserPlus } from "lucide-react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { Avatar } from "@/components/tamp/Avatar";
import { RatingBox } from "@/components/tamp/RatingBox";
import { StatusChip } from "@/components/tamp/StatusChip";
import { TripProgress } from "@/components/tamp/TripProgress";
import { formatMoney } from "@/lib/tamp-data";
import { maskRegistration } from "@/lib/tamp-mask";
import { scoreLoadAgainstTrucks } from "@/lib/tamp-matching";
import { displayStatusForLoad } from "@/lib/tamp-selectors";
import { useTamp } from "@/lib/tamp-store";
import type { Load, Party, Rating, Trip, TruckPosting } from "@/lib/tamp-types";

export interface Engagement {
  trip: Trip;
  load: Load;
  truck: TruckPosting;
  operator: Party | undefined;
}

type Opportunity = {
  load: Load;
  truck: TruckPosting;
  operator: Party | undefined;
  score: number;
};

function EngagementsPage() {
  const {
    loads,
    matches,
    trips,
    disputes,
    trucks,
    parties,
    confirmMatch,
    declineMatch,
    requestJob,
    withdrawRequest,
  } = useTamp();

  const availableTrucks = trucks.filter((t) => t.status === "AVAILABLE");
  const activeLoads = loads.filter((l) => l.status !== "COMPLETED" && l.status !== "CLOSED");

  // Pending requests this carrier has made — awaiting the cargo owner's approval.
  const requested: Opportunity[] = matches
    .filter((m) => m.status === "OFFERED")
    .map((m) => {
      const load = loads.find((l) => l.id === m.loadId);
      const truck = trucks.find((t) => t.id === m.truckPostingId);
      return load && truck
        ? {
            load,
            truck,
            operator: parties.find((p) => p.id === truck.transporterId),
            score: m.score,
          }
        : null;
    })
    .filter((x): x is Opportunity => x !== null);
  const requestedLoadIds = new Set(requested.map((r) => r.load.id));

  const confirmable: Opportunity[] = [];
  const opportunities: Opportunity[] = [];

  for (const load of activeLoads) {
    if (requestedLoadIds.has(load.id)) continue; // already requested — shown below
    const ds = displayStatusForLoad(load, matches, trips, disputes);
    const owner = parties.find((p) => p.id === load.ownerId);
    if (ds === "MATCHED") {
      // The cargo owner accepted a specific truck — confirm to engage.
      const accepted = matches.find((m) => m.loadId === load.id && m.status === "ACCEPTED");
      const truck = accepted ? trucks.find((t) => t.id === accepted.truckPostingId) : undefined;
      if (accepted && truck) {
        confirmable.push({
          load,
          truck,
          operator: parties.find((p) => p.id === truck.transporterId),
          score: accepted.score,
        });
      }
    } else if (ds === "POSTED" && owner) {
      // Open job — surface it only if a truck matches 70+.
      let best: { truck: TruckPosting; score: number } | undefined;
      for (const truck of availableTrucks) {
        const scored = scoreLoadAgainstTrucks(load, [truck], parties, owner).find((m) => m.passed);
        if (scored && scored.score >= 70 && (!best || scored.score > best.score)) {
          best = { truck, score: scored.score };
        }
      }
      if (best) {
        const b = best;
        opportunities.push({
          load,
          truck: b.truck,
          operator: parties.find((p) => p.id === b.truck.transporterId),
          score: b.score,
        });
      }
    }
  }
  opportunities.sort((a, b) => b.score - a.score);

  const totalOpen = confirmable.length + requested.length + opportunities.length;

  return (
    <AppShell>
      <PageHeader title="Engagements" />

      <div className="mx-auto max-w-6xl space-y-10 p-4 sm:p-6 lg:p-8">
        {/* Snapshot strip */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <StatTile label="To confirm" value={confirmable.length} tone="signal" />
          <StatTile label="Requested" value={requested.length} tone="muted" />
          <StatTile label="Opportunities" value={opportunities.length} tone="muted" />
        </div>

        {totalOpen === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-graphite/40 p-10 text-center">
            <p className="text-sm font-semibold text-foreground">You're all caught up</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              No confirmations, requests or open jobs matching your trucks right now. New loads
              appear here the moment cargo owners post them.
            </p>
          </div>
        )}

        {confirmable.length > 0 && (
          <section className="space-y-4">
            <SectionHeader
              title="Awaiting your confirmation"
              count={confirmable.length}
              hint="A cargo owner picked your truck"
              accent
            />
            <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
              {confirmable.map((o) => (
                <OpportunityCard
                  key={`${o.load.id}-${o.truck.id}`}
                  opp={o}
                  kind="confirm"
                  onAct={() => confirmMatch(o.load.id, o.truck.id)}
                  onDecline={() => declineMatch(o.load.id, o.truck.id)}
                />
              ))}
            </div>
          </section>
        )}

        {requested.length > 0 && (
          <section className="space-y-4">
            <SectionHeader
              title="Requested — awaiting approval"
              count={requested.length}
              hint="Sent to the cargo owner"
            />
            <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
              {requested.map((o) => (
                <OpportunityCard
                  key={`${o.load.id}-${o.truck.id}`}
                  opp={o}
                  kind="requested"
                  onWithdraw={() => withdrawRequest(o.load.id, o.truck.id)}
                />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <SectionHeader
            title="Job opportunities"
            count={opportunities.length}
            hint="Open loads your trucks match 70+"
          />
          {opportunities.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-graphite/40 p-6 text-center">
              <p className="text-xs text-muted-foreground">
                No open jobs match your available trucks at 70+ right now.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
              {opportunities.map((o) => (
                <OpportunityCard
                  key={`${o.load.id}-${o.truck.id}`}
                  opp={o}
                  kind="request"
                  onAct={() => requestJob(o.load, o.truck.id, o.score)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "signal" | "muted";
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        tone === "signal" && value > 0
          ? "border-signal/40 bg-signal/10"
          : "border-border bg-graphite"
      }`}
    >
      <div
        className={`font-mono text-3xl font-black leading-none ${
          tone === "signal" && value > 0 ? "text-signal" : "text-foreground"
        }`}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  hint,
  accent,
}: {
  title: string;
  count: number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className={`h-4 w-1 rounded-full ${accent ? "bg-signal" : "bg-steel"}`} />
      <h2 className="text-sm font-bold tracking-tight text-foreground">{title}</h2>
      <span className="grid min-w-5 place-items-center rounded-full bg-steel px-1.5 text-[11px] font-bold text-foreground">
        {count}
      </span>
      {hint && <span className="ml-auto text-[10px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

function OpportunityCard({
  opp,
  kind,
  onAct,
  onDecline,
  onWithdraw,
}: {
  opp: Opportunity;
  kind: "request" | "confirm" | "requested";
  onAct?: () => void;
  onDecline?: () => void;
  onWithdraw?: () => void;
}) {
  const { load, truck, operator, score } = opp;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-graphite shadow-sm transition hover:border-signal/40 hover:shadow-md">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="font-mono text-[11px] text-muted-foreground">#{load.id}</div>
          <div className="text-lg font-bold uppercase leading-tight">
            {load.origin.label} → {load.destination.label}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {(load.weightKg / 1000).toFixed(0)}t · {load.cargoType.replaceAll("_", " ")}
            {load.targetRate ? ` · ${formatMoney(load.targetRate)}` : ""}
          </div>
        </div>
        <div className="text-right">
          {kind === "requested" ? (
            <span className="rounded bg-signal/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-signal-foreground">
              Awaiting approval
            </span>
          ) : (
            <StatusChip status={kind === "confirm" ? "MATCHED" : "POSTED"} />
          )}
          <div className="mt-1.5 flex items-baseline justify-end gap-0.5">
            <span className="font-mono text-2xl font-black leading-none text-signal">{score}</span>
            <span className="text-[9px] font-bold text-muted-foreground">/100</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 px-4 py-3">
        {operator && <Avatar party={operator} size="sm" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{operator?.companyName ?? "Your truck"}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {truck.bodyType} · {maskRegistration(truck.registration)}
          </div>
        </div>
        {operator?.ratingAvg != null && (
          <span className="inline-flex items-center gap-1 font-mono text-xs font-bold">
            <Star className="size-3.5 fill-signal text-signal" />
            {operator.ratingAvg}
          </span>
        )}
      </div>

      {kind === "requested" ? (
        <p className="px-4 text-[10px] leading-snug text-muted-foreground">
          Request sent to the cargo owner. You'll get the job once they approve it.
        </p>
      ) : (
        <p className="px-4 text-[9px] leading-snug text-muted-foreground">
          {kind === "confirm" ? "Confirming" : "Requesting"} is a digital acceptance under the
          Electronic Communications and Transactions Act 25 of 2002 — not an advanced electronic
          signature.
        </p>
      )}

      <div className="flex gap-2 border-t border-border px-4 py-3">
        {kind === "confirm" && onDecline && (
          <button
            onClick={onDecline}
            className="rounded-md border border-foreground/20 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:bg-foreground/10"
          >
            Decline
          </button>
        )}
        {kind === "requested" ? (
          <button
            onClick={onWithdraw}
            className="flex-1 rounded-md border border-border py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-danger/10 hover:text-danger"
          >
            Withdraw request
          </button>
        ) : (
          <button
            onClick={onAct}
            className="flex-1 rounded-md bg-signal py-2 text-[10px] font-black uppercase tracking-widest text-signal-foreground hover:brightness-105"
          >
            {kind === "confirm" ? "Confirm engagement" : "Request job"}
          </button>
        )}
      </div>
    </div>
  );
}

const NEXT_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Arrive at pickup",
  AT_PICKUP: "Mark loaded",
  LOADED: "Depart — in transit",
  IN_TRANSIT: "Arrive at drop-off",
  AT_DROPOFF: "Mark delivered",
};

export function EngagementCard({
  engagement,
  status,
  disputed,
  onAdvance,
  onFlag,
  myRating,
  receivedRating,
  onRate,
}: {
  engagement: Engagement;
  status: ReturnType<typeof displayStatusForLoad>;
  disputed: boolean;
  onAdvance?: () => void;
  onFlag?: () => void;
  myRating?: Rating | undefined;
  receivedRating?: Rating | undefined;
  onRate?: (stars: 1 | 2 | 3 | 4 | 5, comment: string, tags: string[]) => void;
}) {
  const { trip, load, truck, operator } = engagement;
  const nextLabel = NEXT_STATUS_LABEL[trip.status];
  const needsDriver = !truck.driverId;

  return (
    <div className="border border-border bg-graphite/40">
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="font-mono text-[10px] text-muted-foreground">
          {trip.id} · {load.id}
        </span>
        <StatusChip status={status} />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start px-4 py-3 border-b border-dashed border-border">
        <div>
          <div className="text-[9px] font-bold uppercase text-muted-foreground mb-0.5">Load</div>
          <div className="text-sm font-bold uppercase">
            {load.origin.label} → {load.destination.label}
          </div>
          <div className="text-xs text-muted-foreground">
            {(load.weightKg / 1000).toFixed(1)}t · {load.cargoType.replaceAll("_", " ")}
          </div>
        </div>
        <div className="text-center px-2">
          <div className="text-2xl font-black font-mono text-signal leading-none">
            {trip.progressPct}
            <span className="text-sm">%</span>
          </div>
          <div className="text-[8px] font-bold uppercase text-muted-foreground">progress</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold uppercase text-muted-foreground mb-0.5">Truck</div>
          <div className="text-sm font-bold">{operator?.companyName ?? "—"}</div>
          <div className="text-xs text-muted-foreground">
            {truck.bodyType} · {maskRegistration(truck.registration)}
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-dashed border-border">
        <TripProgress status={trip.status} />
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="text-[10px] text-muted-foreground">
          {load.targetRate ? (
            <>
              Agreed rate{" "}
              <span className="font-mono text-foreground">{formatMoney(load.targetRate)}</span>
            </>
          ) : (
            "Rate on file"
          )}
        </div>
        {(onAdvance || onFlag) && (
          <div className="flex gap-2">
            {onFlag && !disputed && (
              <button
                onClick={onFlag}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-foreground/20 text-foreground hover:bg-foreground/10"
              >
                <Flag className="size-3" /> Flag issue
              </button>
            )}
            {onAdvance &&
              nextLabel &&
              (needsDriver ? (
                <Link
                  to="/trucks/$truckId"
                  params={{ truckId: truck.id }}
                  className="inline-flex items-center gap-1.5 border border-danger/40 bg-danger/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-danger hover:bg-danger/20"
                >
                  <UserPlus className="size-3" /> Assign a driver
                </Link>
              ) : (
                <button
                  onClick={onAdvance}
                  className="inline-flex items-center gap-1.5 bg-signal text-signal-foreground px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:brightness-110"
                >
                  {nextLabel} <ChevronRight className="size-3" />
                </button>
              ))}
          </div>
        )}
      </div>

      {disputed && (
        <div className="px-4 py-2 bg-danger/15 border-t border-danger/30 text-[10px] font-bold uppercase tracking-widest text-danger">
          Dispute flagged — under review by the administrator
        </div>
      )}

      {onAdvance && needsDriver && (
        <div className="flex items-center gap-2 border-t border-danger/30 bg-danger/10 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-danger">
          <UserPlus className="size-3.5" /> No driver assigned — the trip can't start until one is
          assigned.
        </div>
      )}

      {onRate && (
        <RatingBox
          title="Rate the cargo owner"
          receivedTitle="Cargo owner rated you"
          myRating={myRating}
          receivedRating={receivedRating}
          onRate={onRate}
        />
      )}
    </div>
  );
}

export default EngagementsPage;
