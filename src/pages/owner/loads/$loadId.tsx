import { useParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  EllipsisVertical,
  Flag,
  History,
  MapPin,
  MessageCircle,
  Route,
  ShieldCheck,
  Truck,
  XCircle,
} from "lucide-react";

import { Link, useNavigate } from "@/lib/nav";
import { useEffect, useMemo, useState } from "react";
import { LaneRail } from "@/components/tamp/LaneRail";
import { AppShell } from "@/components/tamp/AppShell";
import { IncidentDialog } from "@/components/tamp/IncidentDialog";
import { MatchReviewDialog } from "@/components/tamp/MatchReviewDialog";
import { ShareTrackingLink } from "@/components/tamp/ShareTrackingLink";
import { StatusChip } from "@/components/tamp/StatusChip";
import { Waybill } from "@/components/tamp/Waybill";
import { scoreLoadAgainstTrucks, type ScoredMatch } from "@/fns/matching";
import { activeMatchForLoad, displayStatusForLoad, tripForMatch } from "@/lib/tamp-selectors";
import { useTamp } from "@/context/TampContext";
import { hasPermission } from "@/lib/access";
import { fleetVehicleAsset } from "@/lib/fleet-assets";
import { formatMoney } from "@/lib/tamp-data";
import { maskRegistration } from "@/lib/tamp-mask";
import type { Load, Match, MatchScoreComponent, Trip, TripStatus, TruckPosting } from "@/types/domain";

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
  { ruleId: "R-VEHICLE-REVIEW", label: "Vehicle compliance review is approved" },
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
  const navigate = useNavigate();
  const {
    loads,
    trucks,
    parties,
    matches,
    trips,
    disputes,
    incidents,
    dispatches,
    audit,
    proofs,
    authParty,
    acceptMatch,
    rejectMatch,
  } = useTamp();
  const canManageMatches = hasPermission(authParty, "matches.manage");
  const canReportIncidents = hasPermission(authParty, "incidents.report");
  const canCancelTrips = hasPermission(authParty, "trips.manage");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [showUnqualified, setShowUnqualified] = useState(false);
  const [reviewTruck, setReviewTruck] = useState<TruckPosting | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueMode, setIssueMode] = useState<"incident" | "cancel">("incident");
  const [allocationCancellation, setAllocationCancellation] = useState<{ truckId: string; label: string } | null>(null);
  const [replacementOpen, setReplacementOpen] = useState(false);

  const load = loads.find((l) => l.id === loadId);
  const owner = load ? parties.find((p) => p.id === load.ownerId) : undefined;

  const [scored, setScored] = useState<ScoredMatch[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!load || !owner) {
      setScored([]);
      return;
    }
    scoreLoadAgainstTrucks(load, trucks, parties, owner).then((result) => {
      if (!cancelled) setScored(result);
    });
    return () => {
      cancelled = true;
    };
  }, [load, owner, trucks, parties]);

  const actionableMatches = useMemo(
    () =>
      matches.filter(
        (match) =>
          match.loadId === loadId &&
          ["OFFERED", "SUGGESTED", "ACCEPTED"].includes(match.status),
      ),
    [matches, loadId],
  );

  const suggestions = useMemo(() => {
    const byTruck = new Map(scored.filter((match) => match.passed).map((match) => [match.truck.id, match]));
    for (const match of actionableMatches) {
      const truck = trucks.find((candidate) => candidate.id === match.truckPostingId);
      const operator = parties.find((candidate) => candidate.id === truck?.transporterId);
      if (!truck || !operator) continue;
      byTruck.set(truck.id, {
        truck,
        operator,
        score: match.score,
        breakdown: match.breakdown,
        hardFilterResults: match.hardFilterResults,
        passed: true,
        ...(match.fleetPlanRank != null ? { fleetPlanRank: match.fleetPlanRank } : {}),
        ...(match.operatorEligibleCount != null ? { operatorEligibleCount: match.operatorEligibleCount } : {}),
        ...(match.operatorAverageScore != null ? { operatorAverageScore: match.operatorAverageScore } : {}),
        ...(match.recommendedAllocation != null ? { recommendedAllocation: match.recommendedAllocation } : {}),
        ...(match.selectedForFleetPlan != null ? { selectedForFleetPlan: match.selectedForFleetPlan } : {}),
        ...(match.operatorCoveragePct != null ? { operatorCoveragePct: match.operatorCoveragePct } : {}),
        ...(match.companyRating !== undefined ? { companyRating: match.companyRating } : {}),
      });
    }
    return [...byTruck.values()].sort((a, b) => {
      const av = sortKey === "score" ? a.score : ruleEarned(a.breakdown, sortKey);
      const bv = sortKey === "score" ? b.score : ruleEarned(b.breakdown, sortKey);
      if (bv !== av) return bv - av;
      return new Date(a.truck.createdAt).getTime() - new Date(b.truck.createdAt).getTime();
    });
  }, [scored, actionableMatches, trucks, parties, sortKey]);

  const actionableByTruck = useMemo(
    () => new Map(actionableMatches.map((match) => [match.truckPostingId, match])),
    [actionableMatches],
  );

  const unqualified = scored.filter((m) => !m.passed);

  if (!load) {
    return (
      <AppShell>
        <main className="flex min-h-full items-center justify-center">
          <p className="text-xs text-muted-foreground">Load {loadId} not found.</p>
        </main>
      </AppShell>
    );
  }

  const status = displayStatusForLoad(load, matches, trips, disputes);

  if (load.status !== "POSTED") {
    // Match accepted/confirmed/closed — the engagement is live. Show the
    // waybill alongside a trip timeline and the load's audit history.
    const match = activeMatchForLoad(load.id, matches);
    const trip = tripForMatch(match?.id, trips);
    const allocations = matches
      .filter(
        (item) =>
          item.loadId === load.id &&
          (["ACCEPTED", "CONFIRMED"].includes(item.status) ||
            trips.some((candidate) => candidate.matchId === item.id)),
      )
      .map((item) => {
        const allocationTruck = trucks.find((candidate) => candidate.id === item.truckPostingId);
        const allocationTrip = tripForMatch(item.id, trips);
        const assignment = allocationTrip
          ? [...dispatches].reverse().find((candidate) => candidate.tripId === allocationTrip.id)
          : undefined;
        return {
          match: item,
          truck: allocationTruck,
          trip: allocationTrip,
          assignment,
          driver: parties.find((candidate) => candidate.id === assignment?.driverId),
          proof: allocationTrip
            ? proofs.find((candidate) => candidate.tripId === allocationTrip.id && (candidate.kind ?? "DELIVERY") === "DELIVERY")
            : undefined,
          incidents: allocationTrip
            ? incidents.filter((candidate) => candidate.tripId === allocationTrip.id && candidate.status !== "RESOLVED")
            : [],
          carrier: parties.find((candidate) => candidate.id === allocationTruck?.transporterId),
        };
      })
      .filter((item) => item.truck);
    const requiredAllocations = load.trucksRequired ?? 1;
    const liveAllocations = allocations.filter(
      (item) => !item.trip || item.trip.status !== "CANCELLED",
    );
    const awaitingAllocations = liveAllocations.filter((item) => item.match.status === "ACCEPTED");
    const deliveredAllocations = liveAllocations.filter((item) => item.trip && ["DELIVERED", "COMPLETED"].includes(item.trip.status));
    const driverReadyAllocations = liveAllocations.filter((item) => item.assignment?.status === "ACCEPTED");
    const exceptionAllocations = liveAllocations.filter((item) => item.incidents.length || ["DELAYED", "ACTION_REQUIRED"].includes(item.trip?.operationalStatus ?? ""));
    const outstandingAllocations = Math.max(0, requiredAllocations - liveAllocations.length);
    const shipmentComplete = deliveredAllocations.length === requiredAllocations && outstandingAllocations === 0;
    const allocatedTruckIds = new Set(allocations.map((item) => item.match.truckPostingId));
    const replacementCandidates = suggestions
      .filter((candidate) => !allocatedTruckIds.has(candidate.truck.id))
      .slice(0, Math.max(3, outstandingAllocations));
    const loadEvents = audit
      .filter(
        (e) => e.subjectId === load.id || e.subjectId === trip?.id || e.subjectId === match?.id,
      )
      .slice(0, 8);

    return (
      <AppShell>
      <main className="min-h-full">
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-3 py-2.5 backdrop-blur-md sm:p-4">
          <div className="relative flex min-w-0 items-center gap-2 md:hidden">
            <Link
              to="/owner/board"
              aria-label="Back to freight board"
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-foreground"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-xs font-bold">{load.reference || load.id}</div>
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {load.origin.label} → {load.destination.label}
              </div>
            </div>
            <StatusChip status={status} />
            <button
              type="button"
              aria-label="More load actions"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground"
            >
              <EllipsisVertical className="size-4" />
            </button>
            {mobileMenuOpen && (
              <div className="absolute right-0 top-11 z-30 w-56 overflow-hidden rounded-xl border border-border bg-graphite p-1 shadow-2xl">
                <MobileAction icon={Route} label="Trip progress" onClick={() => scrollToSection("load-trip-timeline", setMobileMenuOpen)} />
                {trip && canReportIncidents && (
                  <MobileAction
                    icon={MessageCircle}
                    label="Message trip"
                    onClick={() =>
                      navigate({ to: "/messages", search: { tripId: trip.id } })
                    }
                  />
                )}
                <MobileAction icon={History} label="Audit history" onClick={() => scrollToSection("load-audit-history", setMobileMenuOpen)} />
                {trip && (
                  <MobileAction
                    icon={Flag}
                    label="Report an issue"
                    danger
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setAllocationCancellation(null);
                      setIssueMode("incident");
                      setIssueOpen(true);
                    }}
                  />
                )}
                {trip && !["COMPLETED", "CANCELLED"].includes(trip.status) && canCancelTrips && (
                  <MobileAction
                    icon={XCircle}
                    label="Cancel shipment"
                    danger
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setAllocationCancellation(null);
                      setIssueMode("cancel");
                      setIssueOpen(true);
                    }}
                  />
                )}
              </div>
            )}
          </div>

          <div className="hidden items-center justify-between gap-4 md:flex">
            <div className="flex min-w-0 items-center gap-3">
              <Link to="/owner/board" className="text-[10px] font-bold uppercase tracking-widest text-signal">← Back to board</Link>
              <h1 className="font-mono text-sm font-bold tracking-tight">{load.id}</h1>
              <StatusChip status={status} />
            </div>
            <div className="flex items-center gap-3">
              <div className="max-w-xl truncate font-mono text-xs text-muted-foreground">{load.origin.label} → {load.destination.label}</div>
              {trip && !["COMPLETED", "CANCELLED"].includes(trip.status) && canCancelTrips && (
                <button
                  type="button"
                  onClick={() => {
                    setAllocationCancellation(null);
                    setIssueMode("cancel");
                    setIssueOpen(true);
                  }}
                  className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-danger/40 px-3 text-[10px] font-black uppercase text-danger transition hover:bg-danger/10"
                >
                  <XCircle className="size-4" /> Cancel shipment
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 p-3 sm:p-6 lg:grid-cols-[minmax(360px,440px)_1fr] lg:gap-6">
          <Waybill load={load} />

          <aside className="space-y-6">
            {allocations.length > 0 && (
              <section className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
                <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide"><Truck className="size-4 text-signal" /> Fleet allocation lifecycle</h3>
                    <p className="mt-1 text-[10px] text-muted-foreground">Every truck remains independently traceable from selection through delivery or replacement.</p>
                  </div>
                  <span className={`rounded-lg px-3 py-2 font-mono text-xs font-bold ${outstandingAllocations ? "bg-signal/15 text-signal" : "bg-positive/10 text-positive"}`}>
                    {liveAllocations.length}/{requiredAllocations} active
                  </span>
                </div>
                <div className="grid gap-px border-b border-border bg-border sm:grid-cols-5">
                  <AllocationMetric label="Delivered" value={deliveredAllocations.length} tone={shipmentComplete ? "positive" : "neutral"} />
                  <AllocationMetric label="Driver ready" value={driverReadyAllocations.length} tone="positive" />
                  <AllocationMetric label="Awaiting carrier" value={awaitingAllocations.length} tone="signal" />
                  <AllocationMetric label="Open slots" value={outstandingAllocations} tone={outstandingAllocations ? "danger" : "neutral"} />
                  <AllocationMetric label="Exceptions" value={exceptionAllocations.length} tone={exceptionAllocations.length ? "danger" : "neutral"} />
                </div>
                <div className="h-1.5 bg-steel">
                  <div
                    className="h-full bg-positive transition-[width] duration-500"
                    style={{ width: `${Math.min(100, (deliveredAllocations.length / requiredAllocations) * 100)}%` }}
                  />
                </div>
                <div className={`border-b border-border px-4 py-2 text-[10px] font-semibold ${shipmentComplete ? "bg-positive/10 text-positive" : "bg-steel/20 text-muted-foreground"}`}>
                  {shipmentComplete
                    ? `Shipment complete — all ${requiredAllocations} truck allocations delivered.`
                    : `${deliveredAllocations.length}/${requiredAllocations} delivered. The shipment remains open until every required allocation is delivered or an open slot is explicitly closed.`}
                </div>
                <div className="divide-y divide-border">
                  {allocations.map((allocation) => {
                    const allocationTruck = allocation.truck!;
                    const closed = allocation.trip && ["COMPLETED", "CANCELLED"].includes(allocation.trip.status);
                    const cancelled = allocation.trip?.status === "CANCELLED";
                    return (
                      <div key={allocation.match.id} className={`flex flex-col gap-3 p-3 sm:flex-row sm:items-center ${cancelled ? "bg-danger/5 opacity-70" : ""}`}>
                        <div className="size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-white">
                          <img src={fleetVehicleAsset(allocationTruck)} alt={`${allocationTruck.bodyType} ${allocationTruck.registration}`} className="h-full w-full object-contain p-1" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-black">{maskRegistration(allocationTruck.registration)}</span><span className={`rounded px-2 py-1 text-[9px] font-black uppercase ${cancelled ? "bg-danger/10 text-danger" : allocation.match.status === "ACCEPTED" ? "bg-signal/15 text-signal" : "bg-positive/10 text-positive"}`}>{cancelled ? "Cancelled · replacement needed" : (allocation.trip?.status ?? allocation.match.status).replaceAll("_", " ")}</span></div>
                          <p className="mt-1 text-xs font-semibold">{allocation.carrier?.companyName ?? allocation.carrier?.contactName ?? "Transporter"}</p>
                          <p className="text-[10px] text-muted-foreground">{allocationTruck.bodyType.replaceAll("_", " ")} · {allocationTruck.payloadCapacityKg.toLocaleString("en-ZA")} kg · {allocation.driver?.contactName ?? (allocation.assignment?.status === "OFFERED" ? "Driver response pending" : "Needs a driver")}</p>
                          {allocation.trip && (
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] font-semibold uppercase text-muted-foreground">
                              <span>{allocation.trip.progressPct}% complete</span>
                              <span>·</span>
                              <span>{allocation.trip.etaAt ? `ETA ${new Date(allocation.trip.etaAt).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : "ETA pending"}</span>
                              <span>·</span>
                              <span>{allocation.trip.livePosition?.updatedAt || allocation.trip.simulatedPosition?.updatedAt ? `GPS ${gpsAge(allocation.trip.livePosition?.updatedAt ?? allocation.trip.simulatedPosition?.updatedAt)}` : "GPS unavailable"}</span>
                            </div>
                          )}
                          {allocation.incidents.length > 0 && <p className="mt-2 inline-flex rounded-full bg-danger/10 px-2 py-1 text-[9px] font-black uppercase text-danger">{allocation.incidents.length} active {allocation.incidents.length === 1 ? "exception" : "exceptions"} · {allocation.incidents[0]!.kind.replaceAll("_", " ")}</p>}
                          {allocation.trip && ["DELIVERED", "COMPLETED"].includes(allocation.trip.status) && <p className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase ${allocation.proof ? "bg-positive/10 text-positive" : "bg-warning/10 text-warning"}`}><BadgeCheck className="size-3" />{allocation.proof ? `POD received · ${allocation.proof.recipientName}` : "POD required before settlement"}</p>}
                        </div>
                        {canCancelTrips && allocation.trip && !closed && (
                          <button
                            type="button"
                            onClick={() => {
                              setAllocationCancellation({ truckId: allocationTruck.id, label: `${allocationTruck.registration} · ${allocation.carrier?.companyName ?? "Transporter"}` });
                              setIssueMode("cancel");
                              setIssueOpen(true);
                            }}
                            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-danger/40 px-3 text-[10px] font-black uppercase text-danger hover:bg-danger/10"
                          >
                            <XCircle className="size-3.5" /> Cancel allocation
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {outstandingAllocations > 0 && (
                  <div className="border-t border-border bg-signal/5 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-black">{outstandingAllocations} fleet {outstandingAllocations === 1 ? "slot" : "slots"} still open</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">Select replacement capacity without changing the confirmed trucks already assigned to this shipment.</p>
                      </div>
                      <button type="button" onClick={() => setReplacementOpen((open) => !open)} className="min-h-10 rounded-lg bg-signal px-4 text-[10px] font-black uppercase text-signal-foreground hover:brightness-105">
                        {replacementOpen ? "Hide replacements" : "Find replacement trucks"}
                      </button>
                    </div>
                    {replacementOpen && (
                      <div className="mt-4 grid gap-3 xl:grid-cols-2">
                        {replacementCandidates.map((candidate) => (
                          <ReplacementCandidate
                            key={candidate.truck.id}
                            candidate={candidate}
                            onReview={() => setReviewTruck(candidate.truck)}
                          />
                        ))}
                        {replacementCandidates.length === 0 && (
                          <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground xl:col-span-2">
                            No eligible replacement is available yet. The open slot remains visible and will receive new recommendations as capacity is posted.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
            {load.stops && load.stops.length > 2 && <ConsignmentStops load={load} trip={trip} />}
            {trip && <ShareTrackingLink loadId={load.id} />}
            {trip && (
              <Link
                to="/messages"
                search={{ tripId: trip.id }}
                className="hidden min-h-11 items-center justify-center gap-2 rounded-lg border border-border text-xs font-bold uppercase tracking-wide hover:border-signal md:flex"
              >
                <MessageCircle className="size-4" /> Message trip
              </Link>
            )}

            {trip && (
              <div id="load-trip-timeline" className="scroll-mt-24 border border-border">
                <h3 className="text-[10px] font-bold uppercase tracking-widest p-3 border-b border-border bg-graphite/50">
                  Trip timeline
                </h3>
                <TripTimeline trip={trip} />
              </div>
            )}

            {trip && incidents.some((item) => item.tripId === trip.id) && (
              <div className="overflow-hidden rounded-xl border border-danger/30 bg-danger/5">
                <h3 className="border-b border-danger/20 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-danger">
                  Operational updates
                </h3>
                <div className="divide-y divide-danger/15">
                  {incidents
                    .filter((item) => item.tripId === trip.id)
                    .map((item) => (
                      <div key={item.id} className="p-4 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <strong>{item.kind.replaceAll("_", " ")}</strong>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {new Date(item.reportedAt).toLocaleString("en-ZA")}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{item.description}</p>
                        {item.delayMinutes && (
                          <p className="mt-2 font-bold text-danger">
                            ETA delayed by {item.delayMinutes} minutes
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {trip &&
              (() => {
                const tripProofs = proofs.filter((p) => p.tripId === trip.id);
                if (!tripProofs.length) return null;
                return (
                  <div className="space-y-3">
                    {tripProofs.map((pod) => {
                      const kind = pod.kind ?? "DELIVERY";
                      return (
                        <div key={pod.id} className="border border-border">
                          <h3 className="flex items-center gap-1.5 border-b border-border bg-graphite/50 p-3 text-[10px] font-bold uppercase tracking-widest">
                            <BadgeCheck className="size-3.5 text-positive" /> Proof of{" "}
                            {kind.toLowerCase()}
                          </h3>
                          <div className="space-y-3 p-3 text-xs">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                {kind === "PICKUP" ? "Released by" : "Received by"}
                              </span>
                              <div className="font-semibold">{pod.recipientName}</div>
                            </div>
                            {pod.signature && (
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                  Signature
                                </span>
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
                                  {kind === "PICKUP" ? "Pickup photo" : "Delivery photo"}
                                </span>
                                <a href={pod.photoUrl} target="_blank" rel="noreferrer">
                                  <img
                                    src={pod.photoUrl}
                                    alt={pod.photoName ?? "Delivery photo"}
                                    className="mt-1 max-h-40 w-full rounded border border-border object-cover"
                                  />
                                </a>
                              </div>
                            ) : (
                              pod.photoName && (
                                <div className="text-muted-foreground">
                                  📷 Photo: {pod.photoName}
                                </div>
                              )
                            )}
                            {pod.note && <div className="text-muted-foreground">“{pod.note}”</div>}
                            <div className="font-mono text-[10px] text-muted-foreground">
                              Captured {new Date(pod.capturedAt).toLocaleString("en-ZA")}
                            </div>
                            {pod.location?.verified && (
                              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-positive">
                                <BadgeCheck className="size-3.5" /> GPS location verified
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

            <div id="load-audit-history" className="scroll-mt-24 border border-border">
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
      {(canReportIncidents || canCancelTrips) && (
        <IncidentDialog
          loadId={load.id}
          {...(allocationCancellation ? { truckId: allocationCancellation.truckId, truckLabel: allocationCancellation.label } : {})}
          open={issueOpen}
          initialMode={issueMode}
          onClose={() => {
            setIssueOpen(false);
            setAllocationCancellation(null);
          }}
        />
      )}
      {canManageMatches && reviewTruck && (
        <MatchReviewDialog
          load={load}
          truck={reviewTruck}
          actionLabel="Select replacement truck"
          onClose={() => setReviewTruck(null)}
          onConfirm={(proof) => acceptMatch(load.id, reviewTruck.id, proof)}
        />
      )}
      </AppShell>
    );
  }

  return (
    <AppShell>
    <main className="min-h-full">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-3 py-2.5 backdrop-blur-md sm:p-4">
        <div className="flex min-w-0 items-center gap-2 md:hidden">
          <Link
            to="/owner/board"
            aria-label="Back to freight board"
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-xs font-bold">{load.reference || load.id}</div>
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {(load.weightKg / 1000).toFixed(1)}t · {load.cargoType.replaceAll("_", " ")}
            </div>
          </div>
          <StatusChip status={status} />
        </div>

        <div className="hidden space-y-3 md:block">
          <Link to="/owner/board" className="text-[10px] font-bold uppercase tracking-widest text-signal">← Back to board</Link>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-sm font-bold tracking-tight">{load.id}</h1>
              <StatusChip status={status} />
            </div>
            <div className="font-mono text-xs text-muted-foreground">
            {(load.weightKg / 1000).toFixed(1)}t · {load.requiredBodyTypes.join("/")} ·{" "}
            {load.cargoType.replaceAll("_", " ")}
            </div>
          </div>
          <div className="max-w-lg">
            <LaneRail origin={load.origin} destination={load.destination} distanceKm={load.distanceKm} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-3 sm:p-6 lg:grid-cols-[1fr_360px] lg:gap-6">
        <section className="space-y-4">
          {load.stops && load.stops.length > 2 && <ConsignmentStops load={load} trip={undefined} />}
          <LoadDecisionSummary load={load} suggestionCount={suggestions.length} />
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
              <DecisionTruckCard
                key={m.truck.id}
                rank={i + 1}
                load={load}
                suggestion={m}
                {...(actionableByTruck.get(m.truck.id)
                  ? { savedMatch: actionableByTruck.get(m.truck.id)! }
                  : {})}
                {...(canManageMatches ? {
                  onAccept: () => setReviewTruck(m.truck),
                  onReject: () => rejectMatch(load.id, m.truck.id),
                } : {})}
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
      {canManageMatches && reviewTruck && (
        <MatchReviewDialog
          load={load}
          truck={reviewTruck}
          actionLabel="Accept match"
          onClose={() => setReviewTruck(null)}
          onConfirm={(proof) => acceptMatch(load.id, reviewTruck.id, proof)}
        />
      )}
    </main>
    </AppShell>
  );
}

function LoadDecisionSummary({ load, suggestionCount }: { load: Load; suggestionCount: number }) {
  const rate = load.offeredRate ?? load.targetRate ?? load.platformQuote;
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
      <div className="flex flex-col gap-2 border-b border-border bg-steel/15 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-black">Load decision summary</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Confirm the shipment requirements before selecting a recommended truck.
          </p>
        </div>
        <span className="rounded-full bg-signal/15 px-3 py-1.5 text-[10px] font-black uppercase text-signal">
          {suggestionCount} eligible {suggestionCount === 1 ? "truck" : "trucks"}
        </span>
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <DecisionFact
          label="Cargo requirement"
          value={`${(load.weightKg / 1000).toFixed(1)} t · ${load.cargoType.replaceAll("_", " ")}`}
          detail={`${load.trucksRequired ?? 1} truck${(load.trucksRequired ?? 1) === 1 ? "" : "s"} · ${load.requiredBodyTypes.join(" / ").replaceAll("_", " ")}`}
        />
        <DecisionFact
          label="Pickup window"
          value={new Date(load.pickupWindow.from).toLocaleDateString("en-ZA", { dateStyle: "medium" })}
          detail={`${new Date(load.pickupWindow.from).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}–${new Date(load.pickupWindow.to).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`}
        />
        <DecisionFact
          label="Delivery required"
          value={new Date(load.deliveryBy).toLocaleDateString("en-ZA", { dateStyle: "medium" })}
          detail={new Date(load.deliveryBy).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
        />
        <DecisionFact
          label={load.pricingMode === "CUSTOM" ? "Freight owner offer" : "Target rate"}
          value={rate ? formatMoney(rate) : "Not specified"}
          detail={(load.rateBasis ?? "PER_TRIP").replaceAll("_", " ").toLowerCase()}
        />
      </div>
      <div className="grid gap-3 border-t border-border p-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-steel/10 p-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <MapPin className="size-3.5 text-signal" /> Route
          </div>
          <p className="mt-2 text-xs font-semibold leading-5">{load.origin.label}</p>
          <p className="my-1 text-[10px] font-black uppercase text-signal">to</p>
          <p className="text-xs font-semibold leading-5">{load.destination.label}</p>
          <p className="mt-2 text-[10px] text-muted-foreground">{load.distanceKm.toFixed(1)} km freight distance</p>
        </div>
        <div className="rounded-xl border border-border bg-steel/10 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Special requirements</div>
          <p className="mt-2 text-xs leading-5 text-foreground">
            {load.specialRequirements?.trim() || "No additional loading, access or handling instructions were supplied."}
          </p>
        </div>
      </div>
    </section>
  );
}

function DecisionFact({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 bg-background p-4">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-black" title={value}>{value}</p>
      <p className="mt-1 truncate text-[10px] text-muted-foreground" title={detail}>{detail}</p>
    </div>
  );
}

function DecisionTruckCard({
  rank,
  load,
  suggestion,
  savedMatch,
  onAccept,
  onReject,
}: {
  rank: number;
  load: Load;
  suggestion: ScoredMatch;
  savedMatch?: Match;
  onAccept?: () => void;
  onReject?: () => void;
}) {
  const { truck, operator, score, breakdown } = suggestion;
  const accepted = savedMatch?.status === "ACCEPTED";
  const capacityUse = Math.min(999, (load.weightKg / truck.payloadCapacityKg) * 100);
  const rate = savedMatch?.agreedRate ?? load.offeredRate ?? load.targetRate ?? load.platformQuote;
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
      <div className="relative h-52 overflow-hidden border-b border-border bg-gradient-to-br from-white via-[#f7f7f4] to-[#ecebe5]">
        <img
          src={fleetVehicleAsset(truck)}
          onError={(event) => { event.currentTarget.src = "/fleet/tamp-heavy-truck.png"; }}
          alt={`${truck.bodyType.replaceAll("_", " ")} ${truck.registration}`}
          className="size-full object-contain p-4 drop-shadow-[0_14px_14px_rgba(0,0,0,.18)]"
        />
        <span className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1.5 text-[9px] font-black uppercase tracking-wide shadow backdrop-blur">
          #{rank} recommended truck
        </span>
        <span className="absolute right-3 top-3 rounded-xl bg-background/95 px-3 py-2 font-mono text-2xl font-black text-signal shadow backdrop-blur">
          {score.toFixed(1)}<small className="text-[9px] text-muted-foreground">/100</small>
        </span>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{operator.companyName}</p>
            <h3 className="mt-1 text-lg font-black">
              {[truck.year, truck.make, truck.model].filter(Boolean).join(" ") || truck.bodyType.replaceAll("_", " ")}
            </h3>
            <p className="font-mono text-xs text-muted-foreground">{maskRegistration(truck.registration)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-positive/10 px-2.5 py-1 text-[9px] font-black uppercase text-positive">
              <ShieldCheck className="size-3" /> {truck.vehicleVerification === "VERIFIED" ? "Verified" : "Eligible"}
            </span>
            <span className="rounded-full bg-steel px-2.5 py-1 text-[9px] font-bold uppercase text-muted-foreground">
              Company {operator.ratingAvg != null ? `★ ${operator.ratingAvg.toFixed(1)}` : "new"}
            </span>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <TruckFact label="Body type" value={truck.bodyType.replaceAll("_", " ")} />
          <TruckFact label="Payload fit" value={`${(truck.payloadCapacityKg / 1000).toFixed(1)} t · ${capacityUse.toFixed(0)}% used`} />
          <TruckFact label="Availability" value={`${new Date(truck.availableFrom).toLocaleDateString("en-ZA")}–${new Date(truck.availableTo).toLocaleDateString("en-ZA")}`} icon={CalendarClock} />
          <TruckFact label="Current location" value={truck.currentLocation.label} icon={MapPin} />
        </div>

        <div className="rounded-xl border border-border bg-steel/10 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-black">Why this truck matches</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Every scoring factor remains visible before confirmation.</p>
            </div>
            <span className="font-mono text-xs font-bold">{rate ? formatMoney(rate) : "Rate not specified"}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {breakdown.map((component) => (
              <div key={component.ruleId} className="rounded-lg border border-border bg-background p-2.5">
                <div className="flex items-start justify-between gap-2 text-[10px]">
                  <span className="font-bold">{component.label}</span>
                  <span className="shrink-0 font-mono font-black text-positive">+{component.earned.toFixed(1)}/{component.weight}</span>
                </div>
                <p className="mt-1 text-[9px] leading-4 text-muted-foreground">{component.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {!truck.driverId && (
          <p className="rounded-lg border border-signal/30 bg-signal/5 px-3 py-2 text-[10px] text-muted-foreground">
            Driver not assigned yet. The Transporter can assign a compliant driver in Dispatch after both parties confirm the engagement.
          </p>
        )}

        {accepted ? (
          <div className="rounded-lg bg-positive/10 px-4 py-3 text-center text-xs font-black uppercase text-positive">
            Selected · awaiting Transporter confirmation
          </div>
        ) : (onAccept || onReject) ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={onAccept} className="min-h-11 flex-1 rounded-lg bg-signal px-4 text-xs font-black uppercase text-signal-foreground hover:brightness-105">
              Review route & terms
            </button>
            <button type="button" onClick={onReject} className="min-h-11 rounded-lg border border-danger/40 px-5 text-xs font-bold uppercase text-danger hover:bg-danger/5">
              Reject suggestion
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function TruckFact({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof MapPin }) {
  return (
    <div className="min-w-0 rounded-lg border border-border p-3">
      <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
        {Icon ? <Icon className="size-3" /> : null}{label}
      </p>
      <p className="mt-1 line-clamp-2 text-xs font-semibold" title={value}>{value}</p>
    </div>
  );
}

function AllocationMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "signal" | "danger" | "neutral";
}) {
  const toneClass = {
    positive: "text-positive",
    signal: "text-signal",
    danger: "text-danger",
    neutral: "text-foreground",
  }[tone];
  return (
    <div className="bg-background px-4 py-3">
      <p className={`font-mono text-xl font-black ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function ReplacementCandidate({ candidate, onReview }: { candidate: ScoredMatch; onReview: () => void }) {
  const { truck, operator } = candidate;
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center">
      <div className="h-20 w-full shrink-0 overflow-hidden rounded-lg bg-white sm:w-28">
        <img
          src={fleetVehicleAsset(truck)}
          onError={(event) => { event.currentTarget.src = "/fleet/tamp-heavy-truck.png"; }}
          alt={`${truck.bodyType} ${truck.registration}`}
          className="size-full object-contain p-1"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="truncate text-xs font-black">{operator.companyName}</p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{maskRegistration(truck.registration)}</p>
          </div>
          <span className="shrink-0 font-mono text-base font-black text-signal">{candidate.score.toFixed(1)}</span>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          {truck.bodyType.replaceAll("_", " ")} · {(truck.payloadCapacityKg / 1000).toFixed(1)} t · {truck.driverId ? "driver assigned" : "driver pending"}
        </p>
        <button type="button" onClick={onReview} className="mt-2 min-h-9 w-full rounded-lg border border-signal px-3 text-[9px] font-black uppercase text-signal hover:bg-signal/10">
          Review replacement
        </button>
      </div>
    </article>
  );
}

function scrollToSection(id: string, close: (open: boolean) => void) {
  close(false);
  window.requestAnimationFrame(() =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }),
  );
}

function MobileAction({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: typeof Route;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-xs font-semibold hover:bg-steel/50 ${danger ? "text-danger" : "text-foreground"}`}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </button>
  );
}

function ConsignmentStops({ load, trip }: { load: Load; trip: Trip | undefined }) {
  const current = trip?.currentStopIndex ?? 0;
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <h3 className="border-b border-border bg-graphite/50 px-4 py-3 text-[10px] font-bold uppercase tracking-widest">
        Consignment stops · {load.stops?.length}
      </h3>
      <div className="divide-y divide-border">
        {load.stops?.map((stop, index) => (
          <div
            key={stop.id}
            className={`px-4 py-3 ${index === current && trip ? "bg-signal/5" : ""}`}
          >
            <div className="flex items-center justify-between gap-3">
              <strong className="text-xs uppercase">
                {index + 1}. {stop.kind.replace("DROPOFF", "Drop-off")}
              </strong>
              <span className="text-[9px] font-bold uppercase text-muted-foreground">
                {stop.status}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold">{stop.place.label}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {new Date(stop.window.from).toLocaleString("en-ZA")}
              {stop.contactName ? ` · ${stop.contactName}` : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

const TRIP_STEPS: { status: TripStatus; label: string }[] = [
  { status: "SCHEDULED", label: "Scheduled" },
  { status: "EN_ROUTE_PICKUP", label: "Heading to pickup" },
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

function gpsAge(value?: string | null) {
  if (!value) return "unavailable";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "updated now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export default LoadDetail;
