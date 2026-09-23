"use client";

import { useParams } from "next/navigation";
import { BadgeCheck } from "lucide-react";

import { Link } from "@/lib/nav";
import { useMemo, useState } from "react";
import { LaneRail } from "@/components/tamp/LaneRail";
import { MatchTicket } from "@/components/tamp/MatchTicket";
import { ShareTrackingLink } from "@/components/tamp/ShareTrackingLink";
import { StatusChip } from "@/components/tamp/StatusChip";
import { Waybill } from "@/components/tamp/Waybill";
import { scoreLoadAgainstTrucks, type ScoredMatch } from "@/lib/tamp-matching";
import { activeMatchForLoad, displayStatusForLoad, tripForMatch } from "@/lib/tamp-selectors";
import { useTamp } from "@/lib/tamp-store";
import type { MatchScoreComponent, Trip, TripStatus } from "@/lib/tamp-types";

// §6.2 weighted score rules — the matching-rules explainer, stated plainly
// and never collapsed away (C2 obligation).
const RULES: { ruleId: string; label: string; weight: number; logic: string }[] = [
  {
    ruleId: "R-PROXIMITY",
    label: "Truck is near the pickup point",
    weight: 25,
    logic: "Real-time location: linear from 25 at 0 km to 0 at 150 km",
  },
  {
    ruleId: "R-CAPACITY-FIT",
    label: "Capacity suits the load size",
    weight: 20,
    logic:
      "Load characteristics: peak at 80-100% utilisation; penalised below 50% and at exactly 100%",
  },
  {
    ruleId: "R-TIMING",
    label: "Timing works comfortably",
    weight: 15,
    logic: "Availability: full marks with 6+ hours slack; tapers to 0 at zero slack",
  },
  {
    ruleId: "R-LANE",
    label: "Destination matches a preferred lane",
    weight: 15,
    logic: "Routing: full marks on exact match; half on province match; 0 otherwise",
  },
  {
    ruleId: "R-HISTORY",
    label: "Track record and experience",
    weight: 15,
    logic: "Historical behaviour: (ratingAvg / 5) × 10 plus up to 5 for completed trips",
  },
  {
    ruleId: "R-COST",
    label: "Cost-efficient against the quoted rate",
    weight: 10,
    logic: "Pricing: less deadhead against the paid trip earns more",
  },
];

const HARD_FILTERS = [
  { ruleId: "R-CAPACITY", label: "Payload capacity ≥ load weight" },
  { ruleId: "R-BODY", label: "Body type suits the cargo" },
  { ruleId: "R-WINDOW", label: "Truck availability overlaps the pickup window" },
  { ruleId: "R-RADIUS", label: "Truck within 150 km of origin" },
  { ruleId: "R-STATUS", label: "Truck posting is AVAILABLE" },
];

type SortKey = "score" | "R-PROXIMITY" | "R-HISTORY" | "R-CAPACITY-FIT";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "score", label: "Score" },
  { key: "R-PROXIMITY", label: "Proximity" },
  { key: "R-HISTORY", label: "Track record" },
  { key: "R-CAPACITY-FIT", label: "Capacity fit" },
];

function ruleEarned(breakdown: MatchScoreComponent[], ruleId: string): number {
  return breakdown.find((c) => c.ruleId === ruleId)?.earned ?? 0;
}

function LoadDetail() {
  const { loadId } = useParams<{ loadId: string }>();
  const { loads, trucks, parties, matches, trips, disputes, audit, proofs, acceptMatch, rejectMatch } =
    useTamp();
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [showUnqualified, setShowUnqualified] = useState(false);

  const load = loads.find((l) => l.id === loadId);
  const owner = load ? parties.find((p) => p.id === load.ownerId) : undefined;

  const scored: ScoredMatch[] = useMemo(() => {
    if (!load || !owner) return [];
    return scoreLoadAgainstTrucks(load, trucks, parties, owner);
  }, [load, owner, trucks, parties]);

  const suggestions = useMemo(() => {
    const passed = scored.filter((m) => m.passed);
    return [...passed].sort((a, b) => {
      const av = sortKey === "score" ? a.score : ruleEarned(a.breakdown, sortKey);
      const bv = sortKey === "score" ? b.score : ruleEarned(b.breakdown, sortKey);
      if (bv !== av) return bv - av;
      return new Date(a.truck.createdAt).getTime() - new Date(b.truck.createdAt).getTime();
    });
  }, [scored, sortKey]);

  const unqualified = scored.filter((m) => !m.passed);

  if (!load) {
    return (
      <main className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Load {loadId} not found.</p>
      </main>
    );
  }

  const status = displayStatusForLoad(load, matches, trips, disputes);

  if (load.status !== "POSTED") {
    // Match accepted/confirmed/closed — the engagement is live. Show the
    // waybill alongside a trip timeline and the load's audit history.
    const match = activeMatchForLoad(load.id, matches);
    const trip = tripForMatch(match?.id, trips);
    const loadEvents = audit
      .filter(
        (e) => e.subjectId === load.id || e.subjectId === trip?.id || e.subjectId === match?.id,
      )
      .slice(0, 8);

    return (
      <main className="h-[calc(100vh-3.5rem)] overflow-y-auto">
        <div className="sticky top-0 bg-background/90 backdrop-blur-md p-4 border-b border-border z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/owner/board"
              className="text-[10px] font-bold uppercase tracking-widest text-signal"
            >
              ← Back to board
            </Link>
            <h1 className="text-sm font-bold tracking-tight font-mono">{load.id}</h1>
            <StatusChip status={status} />
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {load.origin.label} → {load.destination.label}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(360px,440px)_1fr] gap-6 p-6 items-start">
          <Waybill load={load} />

          <aside className="space-y-6">
            {trip && <ShareTrackingLink loadId={load.id} />}

            {trip && (
              <div className="border border-border">
                <h3 className="text-[10px] font-bold uppercase tracking-widest p-3 border-b border-border bg-graphite/50">
                  Trip timeline
                </h3>
                <TripTimeline trip={trip} />
              </div>
            )}

            {trip &&
              (() => {
                const pod = proofs.find((p) => p.tripId === trip.id);
                if (!pod) return null;
                return (
                  <div className="border border-border">
                    <h3 className="flex items-center gap-1.5 border-b border-border bg-graphite/50 p-3 text-[10px] font-bold uppercase tracking-widest">
                      <BadgeCheck className="size-3.5 text-positive" /> Proof of delivery
                    </h3>
                    <div className="space-y-3 p-3 text-xs">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          Received by
                        </span>
                        <div className="font-semibold">{pod.recipientName}</div>
                      </div>
                      {pod.signature && (
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            Signature
                          </span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={pod.signature}
                            alt="Recipient signature"
                            className="mt-1 h-20 w-full rounded border border-border bg-white object-contain"
                          />
                        </div>
                      )}
                      {pod.photoUrl ? (
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            Delivery photo
                          </span>
                          <a href={pod.photoUrl} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={pod.photoUrl}
                              alt={pod.photoName ?? "Delivery photo"}
                              className="mt-1 max-h-40 w-full rounded border border-border object-cover"
                            />
                          </a>
                        </div>
                      ) : (
                        pod.photoName && (
                          <div className="text-muted-foreground">📷 Photo: {pod.photoName}</div>
                        )
                      )}
                      {pod.note && <div className="text-muted-foreground">“{pod.note}”</div>}
                      <div className="font-mono text-[10px] text-muted-foreground">
                        Captured {new Date(pod.capturedAt).toLocaleString("en-ZA")}
                      </div>
                    </div>
                  </div>
                );
              })()}

            <div className="border border-border">
              <h3 className="text-[10px] font-bold uppercase tracking-widest p-3 border-b border-border bg-graphite/50">
                Audit history ({loadEvents.length})
              </h3>
              <ol className="divide-y divide-border">
                {loadEvents.map((e) => (
                  <li key={e.id} className="p-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium">{e.summary}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {e.eventId} · {e.actorRole}
                      </div>
                    </div>
                    <time className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                      {new Date(e.at).toLocaleString("en-ZA", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </li>
                ))}
                {loadEvents.length === 0 && (
                  <li className="p-3 text-xs text-muted-foreground">No events recorded yet.</li>
                )}
              </ol>
            </div>
          </aside>
        </div>
      </main>
    );
  }

  return (
    <main className="h-[calc(100vh-3.5rem)] overflow-y-auto">
      <div className="sticky top-0 bg-background/90 backdrop-blur-md p-4 border-b border-border z-10 space-y-3">
        <Link
          to="/owner/board"
          className="text-[10px] font-bold uppercase tracking-widest text-signal"
        >
          ← Back to board
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-bold tracking-tight font-mono">{load.id}</h1>
            <StatusChip status={status} />
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {(load.weightKg / 1000).toFixed(1)}t · {load.requiredBodyTypes.join("/")} ·{" "}
            {load.cargoType.replaceAll("_", " ")}
          </div>
        </div>
        <div className="max-w-lg">
          <LaneRail
            origin={load.origin}
            destination={load.destination}
            distanceKm={load.distanceKm}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 p-6">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Suggested trucks ({suggestions.length})
            </h2>
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
              Sort by
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="bg-background border border-border px-1.5 py-1 text-[10px] text-foreground outline-none"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key} className="bg-graphite">
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {suggestions.length === 0 && (
            <div className="border border-dashed border-border p-6 text-center">
              <p className="text-xs text-muted-foreground">
                No available truck satisfies every hard filter for this load (§6.1). Widen body
                type, capacity or the sourcing radius, or wait for new capacity.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {suggestions.slice(0, 10).map((m, i) => (
              <MatchTicket
                key={m.truck.id}
                rank={i + 1}
                load={load}
                truck={m.truck}
                operator={m.operator}
                score={m.score}
                breakdown={m.breakdown}
                variant="suggested"
                onAccept={() => acceptMatch(load.id, m.truck.id)}
                onReject={() => rejectMatch(load.id, m.truck.id)}
              />
            ))}
          </div>

          <div className="border border-border">
            <button
              onClick={() => setShowUnqualified((s) => !s)}
              className="w-full flex items-center justify-between p-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              <span>Trucks that didn't qualify ({unqualified.length})</span>
              <span>{showUnqualified ? "−" : "+"}</span>
            </button>
            {showUnqualified && (
              <div className="divide-y divide-border border-t border-border">
                {unqualified.length === 0 && (
                  <p className="p-4 text-xs text-muted-foreground">Every posted truck qualifies.</p>
                )}
                {unqualified.map((m) => (
                  <div key={m.truck.id} className="p-3 text-xs">
                    <div className="flex justify-between">
                      <span className="font-bold">
                        {m.truck.id} · {m.operator.companyName}
                      </span>
                      <span className="text-muted-foreground">{m.truck.bodyType}</span>
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {m.hardFilterResults
                        .filter((r) => !r.passed)
                        .map((r) => (
                          <li key={r.ruleId} className="text-danger text-[10px]">
                            {r.detail}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="border border-border p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Rule-based matching — how scores are built
            </h3>
            <div className="space-y-2">
              {RULES.map((r) => (
                <div key={r.ruleId} className="text-xs">
                  <div className="flex justify-between font-medium">
                    <span>{r.label}</span>
                    <span className="font-mono text-muted-foreground">/{r.weight}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">{r.logic}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[9px] text-muted-foreground italic">
              Rule-based matching. No AI, no black box — every score is explainable.
            </p>
          </div>

          <div className="border border-border p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Hard filters (must all pass)
            </h3>
            <ul className="space-y-1.5">
              {HARD_FILTERS.map((f) => (
                <li key={f.ruleId} className="text-[10px] text-muted-foreground">
                  <span className="font-mono text-foreground">{f.ruleId}</span> — {f.label}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}

const TRIP_STEPS: { status: TripStatus; label: string }[] = [
  { status: "SCHEDULED", label: "Scheduled" },
  { status: "AT_PICKUP", label: "At pickup" },
  { status: "LOADED", label: "Loaded" },
  { status: "IN_TRANSIT", label: "In transit" },
  { status: "AT_DROPOFF", label: "At drop-off" },
  { status: "DELIVERED", label: "Delivered" },
];

function TripTimeline({ trip }: { trip: Trip }) {
  const currentIdx = TRIP_STEPS.findIndex((s) => s.status === trip.status);
  const doneIdx = trip.status === "COMPLETED" ? TRIP_STEPS.length - 1 : currentIdx;
  const eventAt = (status: TripStatus) => trip.events.find((e) => e.status === status)?.at;

  return (
    <ol className="p-4 space-y-0">
      {TRIP_STEPS.map((step, i) => {
        const done = i <= doneIdx;
        const active = i === doneIdx;
        const at = eventAt(step.status);
        return (
          <li key={step.status} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`size-3 rounded-full border-2 shrink-0 ${
                  active
                    ? "bg-signal border-signal"
                    : done
                      ? "bg-positive border-positive"
                      : "bg-transparent border-border"
                }`}
              />
              {i < TRIP_STEPS.length - 1 && (
                <span className={`w-px flex-1 min-h-6 ${done ? "bg-positive/50" : "bg-border"}`} />
              )}
            </div>
            <div className="pb-4 -mt-0.5">
              <div
                className={`text-xs font-bold uppercase tracking-wide ${
                  done ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </div>
              {at && (
                <div className="text-[10px] text-muted-foreground font-mono">
                  {new Date(at).toLocaleString("en-ZA", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default LoadDetail;
