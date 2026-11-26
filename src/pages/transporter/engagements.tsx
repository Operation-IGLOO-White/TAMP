
import { useMemo, useState } from "react";
import { Link } from "@/lib/nav";
import { CheckSquare, ChevronRight, Flag, Star, Truck as TruckIcon, UserPlus } from "lucide-react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { Avatar } from "@/components/tamp/Avatar";
import { BatchEngagementDialog, type BatchEngagementCandidate } from "@/components/tamp/BatchEngagementDialog";
import { MatchReviewDialog } from "@/components/tamp/MatchReviewDialog";
import { RatingBox } from "@/components/tamp/RatingBox";
import { StatusChip } from "@/components/tamp/StatusChip";
import { TripProgress } from "@/components/tamp/TripProgress";
import { formatMoney } from "@/lib/tamp-data";
import { fleetVehicleAsset } from "@/lib/fleet-assets";
import { maskRegistration } from "@/lib/tamp-mask";
import { displayStatusForLoad } from "@/lib/tamp-selectors";
import { useTamp } from "@/context/TampContext";
import type { Load, Party, Rating, Trip, TruckPosting } from "@/types/domain";

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

type ConfirmationGroup = { load: Load; opportunities: Opportunity[] };

function EngagementsPage() {
  const {
    authParty,
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
  const canManageMatches = authParty?.permissions?.includes("matches.manage") ?? false;
  const [review, setReview] = useState<{ opportunity: Opportunity; kind: "confirm" | "request" } | null>(null);
  const [confirmedLoad, setConfirmedLoad] = useState<string | null>(null);
  const [batchReview, setBatchReview] = useState<ConfirmationGroup | null>(null);

  const availableTruckIds = useMemo(
    () => new Set(trucks.filter((truck) => truck.status === "AVAILABLE").map((truck) => truck.id)),
    [trucks],
  );
  const activeLoads = useMemo(
    () => loads.filter((l) => l.status !== "COMPLETED" && l.status !== "CLOSED"),
    [loads],
  );
  const loadById = useMemo(() => new Map(loads.map((load) => [load.id, load])), [loads]);
  const truckById = useMemo(() => new Map(trucks.map((truck) => [truck.id, truck])), [trucks]);
  const partyById = useMemo(() => new Map(parties.map((party) => [party.id, party])), [parties]);

  // Pending requests this carrier has made — awaiting the cargo owner's approval.
  const requested: Opportunity[] = useMemo(
    () => matches
      .filter((m) => m.status === "OFFERED")
      .map((m) => {
        const load = loadById.get(m.loadId);
        const truck = truckById.get(m.truckPostingId);
        return load && truck
          ? { load, truck, operator: partyById.get(truck.transporterId), score: m.score }
          : null;
      })
      .filter((x): x is Opportunity => x !== null),
    [loadById, matches, partyById, truckById],
  );

  const { confirmable, confirmationGroups } = useMemo(() => {
    const nextConfirmable: Opportunity[] = [];
    for (const load of activeLoads) {
      const acceptedMatches = matches.filter((match) => match.loadId === load.id && match.status === "ACCEPTED");
      if (acceptedMatches.length > 0) {
        for (const accepted of acceptedMatches) {
          const truck = truckById.get(accepted.truckPostingId);
          if (!truck) continue;
          nextConfirmable.push({
            load,
            truck,
            operator: partyById.get(truck.transporterId),
            score: accepted.score,
          });
        }
      }
    }
    const grouped = new Map<string, ConfirmationGroup>();
    for (const opportunity of nextConfirmable) {
      const existing = grouped.get(opportunity.load.id);
      if (existing) existing.opportunities.push(opportunity);
      else grouped.set(opportunity.load.id, { load: opportunity.load, opportunities: [opportunity] });
    }
    return { confirmable: nextConfirmable, confirmationGroups: [...grouped.values()] };
  }, [activeLoads, matches, partyById, truckById]);

  // Suggestions are already scored and persisted by the backend whenever
  // loads or fleet inventory change. Reuse that snapshot here instead of
  // issuing one expensive load×fleet scoring request per open load on every
  // page visit.
  const opportunities = useMemo(() => {
    const requestedLoadIds = new Set(requested.map((item) => item.load.id));
    const found: Opportunity[] = [];
    for (const match of matches) {
      if (match.status !== "SUGGESTED" || match.score < 70) continue;
      if (!availableTruckIds.has(match.truckPostingId) || requestedLoadIds.has(match.loadId)) continue;
      const load = loadById.get(match.loadId);
      const truck = truckById.get(match.truckPostingId);
      if (!load || !truck || displayStatusForLoad(load, matches, trips, disputes) !== "POSTED") continue;
      found.push({
        load,
        truck,
        operator: partyById.get(truck.transporterId),
        score: match.score,
      });
    }
    return found.sort((left, right) => right.score - left.score);
  }, [availableTruckIds, disputes, loadById, matches, partyById, requested, trips, truckById]);

  const totalOpen = confirmable.length + requested.length + opportunities.length;

  return (
    <AppShell>
      <PageHeader title="Engagements" />

      <div className="mx-auto max-w-6xl space-y-10 p-4 sm:p-6 lg:p-8">
        {!canManageMatches && (
          <div className="rounded-xl border border-signal/40 bg-signal/10 p-4 text-sm">
            <div className="font-bold">Engagements are currently read-only</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {authParty?.verification !== "VERIFIED"
                ? "Your account must be verified before you can request, confirm, decline or withdraw work."
                : "Your organisation role does not include match-management rights. Ask an organisation administrator or platform administrator to enable them."}
            </p>
          </div>
        )}
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
              appear here the moment freight owners post them.
            </p>
          </div>
        )}

        {confirmable.length > 0 && (
          <section className="space-y-4">
            <SectionHeader
              title="Awaiting your confirmation"
              count={confirmable.length}
              hint="A freight owner picked your truck"
              accent
            />
            <div className="space-y-4">
              {confirmationGroups.filter((group) => group.opportunities.length > 1).map((group) => <FleetConfirmationCard key={group.load.id} group={group} canManage={canManageMatches} onBatchConfirm={(opportunities) => setBatchReview({ load: group.load, opportunities })} onReview={(opportunity) => setReview({ opportunity, kind: "confirm" })} onDecline={(opportunity) => declineMatch(opportunity.load.id, opportunity.truck.id)} />)}
              <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">{confirmationGroups.filter((group) => group.opportunities.length === 1).map((group) => {
                const o = group.opportunities[0]!;
                return (
                <OpportunityCard
                  key={`${o.load.id}-${o.truck.id}`}
                  opp={o}
                  kind="confirm"
                  onAct={canManageMatches ? () => setReview({ opportunity: o, kind: "confirm" }) : undefined}
                  onDecline={canManageMatches ? () => declineMatch(o.load.id, o.truck.id) : undefined}
                />
                );
              })}</div>
            </div>
          </section>
        )}

        {requested.length > 0 && (
          <section className="space-y-4">
            <SectionHeader
              title="Requested — awaiting approval"
              count={requested.length}
              hint="Sent to the freight owner"
            />
            <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
              {requested.map((o) => (
                <OpportunityCard
                  key={`${o.load.id}-${o.truck.id}`}
                  opp={o}
                  kind="requested"
                  onWithdraw={canManageMatches ? () => withdrawRequest(o.load.id, o.truck.id) : undefined}
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
                  onAct={canManageMatches ? () => setReview({ opportunity: o, kind: "request" }) : undefined}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      {confirmedLoad && <div role="status" className="mx-4 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-signal/40 bg-signal/10 p-4 md:mx-6">
        <div><p className="font-semibold">Engagement confirmed — continue in Dispatch</p>
          <p className="mt-1 text-sm text-muted-foreground">Assign or review drivers for the confirmed trucks. {confirmedLoad}</p></div>
        <Link to="/transporter/dispatch" className="rounded-lg bg-signal px-5 py-3 text-sm font-bold text-signal-foreground">Open Dispatch</Link>
      </div>}
      {review && (
        <MatchReviewDialog
          load={review.opportunity.load}
          truck={review.opportunity.truck}
          actionLabel={review.kind === "confirm" ? "Confirm engagement" : "Request job"}
          onClose={() => setReview(null)}
          onConfirm={(proof) =>
            review.kind === "confirm"
              ? confirmMatch(review.opportunity.load.id, review.opportunity.truck.id, proof).then(() => setConfirmedLoad(review.opportunity.load.id))
              : requestJob(
                  review.opportunity.load,
                  review.opportunity.truck.id,
                  review.opportunity.score,
                  proof,
                )
          }
        />
      )}
      {batchReview && (
        <BatchEngagementDialog
          mode="transporter-confirm"
          load={batchReview.load}
          candidates={batchReview.opportunities.map(toBatchCandidate)}
          onClose={() => setBatchReview(null)}
          onConfirm={(candidate, proof) => confirmMatch(batchReview.load.id, candidate.truck.id, proof).then(() => setConfirmedLoad(batchReview.load.id))}
        />
      )}
    </AppShell>
  );
}

function FleetConfirmationCard({
  group,
  canManage,
  onBatchConfirm,
  onReview,
  onDecline,
}: {
  group: ConfirmationGroup;
  canManage: boolean;
  onBatchConfirm: (opportunities: Opportunity[]) => void;
  onReview: (opportunity: Opportunity) => void;
  onDecline: (opportunity: Opportunity) => void;
}) {
  const [selected, setSelected] = useState(() => group.opportunities.map((item) => item.truck.id));
  const selectedOpportunities = group.opportunities.filter((item) => selected.includes(item.truck.id));
  const toggle = (truckId: string) => setSelected((current) => current.includes(truckId) ? current.filter((id) => id !== truckId) : [...current, truckId]);
  const owner = group.opportunities[0]?.operator;
  const readyWithDrivers = group.opportunities.filter((item) => item.truck.driverId).length;

  return <article className="overflow-hidden rounded-2xl border border-signal/35 bg-background shadow-sm">
    <header className="flex flex-col gap-3 border-b border-border bg-signal/5 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-signal px-2.5 py-1 text-[9px] font-black uppercase text-signal-foreground">Fleet engagement</span><span className="font-mono text-[10px] text-muted-foreground">{group.load.reference}</span></div><h3 className="mt-2 text-sm font-black uppercase">{group.load.origin.label} → {group.load.destination.label}</h3><p className="mt-1 text-[11px] text-muted-foreground">Freight Owner selected {group.opportunities.length} of your trucks · pickup {new Date(group.load.pickupWindow.from).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</p></div>
      <div className="grid min-w-52 grid-cols-2 gap-2"><MiniMetric label="Selected" value={`${group.opportunities.length}/${group.load.trucksRequired ?? group.opportunities.length}`} /><MiniMetric label="Drivers ready" value={`${readyWithDrivers}/${group.opportunities.length}`} /></div>
    </header>
    <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
      {group.opportunities.map((opportunity) => {
        const checked = selected.includes(opportunity.truck.id);
        return <div key={opportunity.truck.id} className={`relative rounded-xl border p-3 transition ${checked ? "border-signal bg-signal/5" : "border-border bg-steel/10 opacity-70"}`}>
          <label className="absolute right-3 top-3 grid size-7 cursor-pointer place-items-center rounded-lg border border-border bg-background shadow-sm"><input type="checkbox" checked={checked} onChange={() => toggle(opportunity.truck.id)} disabled={!canManage} className="accent-[#f2b400]" aria-label={`Select ${opportunity.truck.registration}`} /></label>
          <div className="h-24 overflow-hidden rounded-lg bg-white"><img src={fleetVehicleAsset(opportunity.truck)} alt={`${opportunity.truck.bodyType} ${opportunity.truck.registration}`} className="h-full w-full object-contain p-2" /></div>
          <div className="mt-3 pr-8"><p className="font-mono text-sm font-black">{maskRegistration(opportunity.truck.registration)}</p><p className="mt-1 text-[10px] font-semibold uppercase text-muted-foreground">{opportunity.truck.bodyType.replaceAll("_", " ")} · {(opportunity.truck.payloadCapacityKg / 1000).toFixed(1)} t</p><p className={`mt-2 text-[10px] font-bold ${opportunity.truck.driverId ? "text-positive" : "text-signal"}`}>{opportunity.truck.driverId ? "Driver assigned" : "Will enter Needs a driver after confirmation"}</p></div>
          <div className="mt-3 flex gap-2"><button type="button" onClick={() => onReview(opportunity)} disabled={!canManage} className="flex-1 rounded-lg border border-border px-2 py-2 text-[9px] font-black uppercase hover:bg-steel/30 disabled:opacity-40">Review separately</button><button type="button" onClick={() => onDecline(opportunity)} disabled={!canManage} className="rounded-lg border border-danger/30 px-2 py-2 text-[9px] font-black uppercase text-danger hover:bg-danger/10 disabled:opacity-40">Decline</button></div>
        </div>;
      })}
    </div>
    <footer className="flex flex-col gap-3 border-t border-border bg-steel/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-xs text-muted-foreground"><TruckIcon className="size-4 text-signal" /><span>{selectedOpportunities.length} truck{selectedOpportunities.length === 1 ? "" : "s"} selected for confirmation{owner ? ` · ${owner.companyName}` : ""}</span></div><button type="button" onClick={() => onBatchConfirm(selectedOpportunities)} disabled={!canManage || selectedOpportunities.length === 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-signal px-5 text-xs font-black uppercase text-signal-foreground hover:brightness-105 disabled:opacity-40"><CheckSquare className="size-4" /> Confirm {selectedOpportunities.length} selected</button></footer>
  </article>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-background p-3 text-center"><p className="font-mono text-lg font-black">{value}</p><p className="mt-1 text-[8px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p></div>;
}

function toBatchCandidate(opportunity: Opportunity): BatchEngagementCandidate {
  return {
    truck: opportunity.truck,
    operator: opportunity.operator ?? ({ id: opportunity.truck.transporterId, companyName: "Transporter" } as Party),
    score: opportunity.score,
    kind: "SUGGESTION",
  };
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
  onAct?: (() => void) | undefined;
  onDecline?: (() => void) | undefined;
  onWithdraw?: (() => void) | undefined;
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
          Request sent to the freight owner. You'll get the job once they approve it.
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
            disabled={!onWithdraw}
            className="flex-1 rounded-md border border-border py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
          >
            {onWithdraw ? "Withdraw request" : "Permission required"}
          </button>
        ) : (
          <button
            onClick={onAct}
            disabled={!onAct}
            className="flex-1 rounded-md bg-signal py-2 text-[10px] font-black uppercase tracking-widest text-signal-foreground hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {!onAct ? "Permission required" : kind === "confirm" ? "Confirm engagement" : "Request job"}
          </button>
        )}
      </div>
    </div>
  );
}

const NEXT_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Start trip",
  EN_ROUTE_PICKUP: "Confirm pickup arrival",
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
          title="Rate the freight owner"
          receivedTitle="Freight owner rated you"
          myRating={myRating}
          receivedRating={receivedRating}
          onRate={onRate}
        />
      )}
    </div>
  );
}

export default EngagementsPage;
