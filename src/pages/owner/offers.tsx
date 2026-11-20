import { useMemo, useState } from "react";
import { CalendarClock, MapPin, PackageOpen, Search, ShieldCheck, Star, Truck } from "lucide-react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { MatchReviewDialog } from "@/components/tamp/MatchReviewDialog";
import { useTamp } from "@/context/TampContext";
import { hasPermission } from "@/lib/access";
import { fleetVehicleAsset } from "@/lib/fleet-assets";
import { maskRegistration } from "@/lib/tamp-mask";
import { Link } from "@/lib/nav";
import type { Load, Match, Party, TruckPosting } from "@/types/domain";

type Candidate = {
  load: Load;
  truck: TruckPosting;
  operator: Party;
  driver?: Party;
  score: number;
  breakdown: Match["breakdown"];
  match?: Match;
  kind: "REQUEST" | "SUGGESTION";
};
type FleetCarrierPlan = {
  operator: Party;
  candidates: Candidate[];
  allocation: number;
  eligibleCount: number;
  averageScore: number;
  coveragePct: number;
  rank: number | null;
};
type FleetLoadPlan = { load: Load; carriers: FleetCarrierPlan[]; covered: number; required: number };
export default function OwnerOffers() {
  const { loads, trucks, parties, matches, authParty, acceptMatch, acceptRequest } = useTamp();
  const canManage = hasPermission(authParty, "matches.manage");
  const [query, setQuery] = useState("");
  const [review, setReview] = useState<Candidate | null>(null);
  const postedLoads = useMemo(() => loads.filter((load) => load.status === "POSTED" || load.status === "MATCHED"), [loads]);

  const candidates = useMemo(() => {
    const result = new Map<string, Candidate>();
    for (const match of matches.filter((item) => item.status === "OFFERED" || item.status === "SUGGESTED" || item.status === "ACCEPTED")) {
      const load = postedLoads.find((item) => item.id === match.loadId);
      const truck = trucks.find((item) => item.id === match.truckPostingId);
      const operator = parties.find((item) => item.id === truck?.transporterId);
      const driver = parties.find((item) => item.id === truck?.driverId);
      if (load && truck && operator) result.set(`${load.id}:${truck.id}`, { load, truck, operator, ...(driver ? { driver } : {}), score: match.score, breakdown: match.breakdown, match, kind: match.initiatedBy === "TRANSPORTER" ? "REQUEST" : "SUGGESTION" });
    }
    return [...result.values()].sort((a, b) => b.score - a.score);
  }, [matches, postedLoads, trucks, parties]);

  const visible = candidates.filter((item) => [item.load.reference, item.load.origin.label, item.load.destination.label, item.truck.registration, item.truck.make, item.truck.model, item.operator.companyName].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const fleetPlans = useMemo(() => buildFleetPlans(visible), [visible]);
  const singleTruckCandidates = visible.filter((item) => (item.load.trucksRequired ?? 1) === 1);
  const pendingCandidates = candidates.filter((item) => item.match?.status !== "ACCEPTED");
  const requestCount = pendingCandidates.filter((item) => item.kind === "REQUEST").length;

  return <AppShell>
    <PageHeader title="Matches & Offers" />
    <div className="space-y-5 p-4 sm:p-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <Summary label="Pending opportunities" value={pendingCandidates.length} icon={Truck} />
        <Summary label="Transporter offers" value={requestCount} icon={PackageOpen} accent={requestCount > 0} />
        <Summary label="System suggestions" value={pendingCandidates.length - requestCount} icon={Star} />
      </section>
      <section className="app-surface overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-black">Unaccepted matches</h2><p className="mt-1 text-xs text-muted-foreground">Compare eligible vehicles and review the full route and terms before accepting.</p></div>
          <label className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search load, truck or transporter" className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-signal" /></label>
        </div>
        {visible.length === 0 ? <div className="p-16 text-center"><Truck className="mx-auto size-9 text-muted-foreground" /><p className="mt-3 text-sm font-bold">No pending matches or offers</p><p className="mt-1 text-xs text-muted-foreground">New eligible trucks and transporter requests will appear here.</p></div> : <div className="space-y-5 p-4">{fleetPlans.map((plan) => <FleetPlanCard key={plan.load.id} plan={plan} canManage={canManage} onReview={setReview} />)}{singleTruckCandidates.length > 0 && <div className="grid gap-4 lg:grid-cols-2">{singleTruckCandidates.map((candidate) => <OfferCard key={`${candidate.load.id}:${candidate.truck.id}`} candidate={candidate} canManage={canManage} onReview={() => setReview(candidate)} />)}</div>}</div>}
      </section>
    </div>
    {review && <MatchReviewDialog load={review.load} truck={review.truck} actionLabel={review.kind === "REQUEST" ? "Approve offer" : "Accept match"} onClose={() => setReview(null)} onConfirm={(proof) => review.kind === "REQUEST" ? acceptRequest(review.load.id, review.truck.id, proof) : acceptMatch(review.load.id, review.truck.id, proof)} />}
  </AppShell>;
}

function OfferCard({ candidate, canManage, onReview }: { candidate: Candidate; canManage: boolean; onReview: () => void }) {
  const { load, truck, operator, kind } = candidate;
  const accepted = candidate.match?.status === "ACCEPTED";
  const image = fleetVehicleAsset(truck);
  return <article className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
    <div className="relative h-44 overflow-hidden bg-gradient-to-br from-white via-[#f7f7f4] to-[#ecebe5]"><img src={image} onError={(event) => { event.currentTarget.src = "/fleet/tamp-heavy-truck.png"; }} alt={`${truck.bodyType.toLowerCase()} ${truck.registration}`} className="h-full w-full object-contain p-3 pt-7 drop-shadow-[0_12px_12px_rgba(0,0,0,.16)]" /><span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${kind === "REQUEST" ? "bg-signal text-signal-foreground" : "bg-background/90 text-foreground shadow"}`}>{kind === "REQUEST" ? "Transporter offer" : "Recommended match"}</span><span className="absolute right-3 top-3 rounded-xl bg-background/90 px-3 py-2 font-mono text-xl font-black text-signal shadow">{candidate.score.toFixed(1)}<small className="text-[9px] text-muted-foreground">/100</small></span></div>
    <div className="space-y-4 p-4">
      <div><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{operator.companyName}</p><h3 className="mt-1 text-lg font-black">{truck.make || truck.model ? `${truck.year ?? ""} ${truck.make ?? ""} ${truck.model ?? ""}`.trim() : truck.bodyType.replaceAll("_", " ")}</h3><p className="font-mono text-xs text-muted-foreground">{maskRegistration(truck.registration)}</p><div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold text-muted-foreground"><RatingLabel label="Company" value={operator.ratingAvg} count={operator.ratingCount} />{candidate.driver && <RatingLabel label={candidate.driver.contactName} value={candidate.driver.ratingAvg} count={candidate.driver.ratingCount} />}</div></div><span className="inline-flex items-center gap-1 rounded-lg bg-positive/10 px-2 py-1 text-[9px] font-bold uppercase text-positive"><ShieldCheck className="size-3" /> {truck.vehicleVerification === "VERIFIED" ? "Verified" : "Eligible"}</span></div></div>
      <div className="grid grid-cols-2 gap-2 text-xs"><Detail label="Body type" value={truck.bodyType.replaceAll("_", " ")} /><Detail label="Payload" value={`${(truck.payloadCapacityKg / 1000).toFixed(1)} t`} /><Detail label="Available" value={new Date(truck.availableFrom).toLocaleDateString("en-ZA")} icon={CalendarClock} /><Detail label="Current location" value={truck.currentLocation.label} icon={MapPin} /></div>
      <div className="rounded-xl border border-border bg-steel/20 p-3"><p className="font-mono text-[10px] text-muted-foreground">{load.reference}</p><p className="mt-1 line-clamp-2 text-xs font-bold uppercase">{load.origin.label} → {load.destination.label}</p><p className="mt-1 text-[10px] text-muted-foreground">{(load.weightKg / 1000).toFixed(1)} t · {load.cargoType.replaceAll("_", " ")} · pickup {new Date(load.pickupWindow.from).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div>
      <div className="flex gap-2">{accepted ? <div className="flex-1 rounded-lg bg-positive/10 px-4 py-2.5 text-center text-xs font-black uppercase text-positive">Selected · awaiting transporter</div> : canManage && <button onClick={onReview} className="flex-1 rounded-lg bg-signal px-4 py-2.5 text-xs font-black uppercase text-signal-foreground hover:brightness-105">Review route & terms</button>}<Link to="/owner/loads/$loadId" params={{ loadId: load.id }} className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-xs font-bold uppercase hover:bg-steel/30">Load details</Link></div>
    </div>
  </article>;
}

function buildFleetPlans(candidates: Candidate[]): FleetLoadPlan[] {
  const byLoad = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    if ((candidate.load.trucksRequired ?? 1) <= 1) continue;
    byLoad.set(candidate.load.id, [...(byLoad.get(candidate.load.id) ?? []), candidate]);
  }
  return [...byLoad.values()].map((items) => {
    const load = items[0]!.load;
    const required = load.trucksRequired ?? 1;
    const byOperator = new Map<string, Candidate[]>();
    for (const item of items)
      byOperator.set(item.operator.id, [...(byOperator.get(item.operator.id) ?? []), item]);
    const groups = [...byOperator.values()]
      .map((group) => {
        const candidatesForOperator = [...group].sort(
          (a, b) =>
            Number(b.match?.status === "ACCEPTED") - Number(a.match?.status === "ACCEPTED") ||
            Number(b.match?.selectedForFleetPlan ?? false) -
              Number(a.match?.selectedForFleetPlan ?? false) || b.score - a.score,
        );
        const first = candidatesForOperator[0]!;
        return {
          operator: first.operator,
          candidates: candidatesForOperator,
          eligibleCount: first.match?.operatorEligibleCount ?? candidatesForOperator.length,
          averageScore:
            first.match?.operatorAverageScore ??
            candidatesForOperator.reduce((total, item) => total + item.score, 0) /
              candidatesForOperator.length,
          coveragePct:
            first.match?.operatorCoveragePct ??
            Math.min(100, (candidatesForOperator.length / required) * 100),
          allocation: first.match?.recommendedAllocation ?? 0,
          rank: first.match?.fleetPlanRank ?? null,
        } satisfies FleetCarrierPlan;
      })
      .sort(
        (a, b) =>
          (a.rank ?? 9999) - (b.rank ?? 9999) ||
          b.eligibleCount - a.eligibleCount ||
          b.averageScore - a.averageScore ||
          (b.operator.ratingAvg ?? 0) - (a.operator.ratingAvg ?? 0),
      );
    // Legacy matches do not carry fleet metadata. Build the same greedy plan
    // client-side until the next server refresh enriches those records.
    let remaining = required;
    let fallbackRank = 0;
    for (const group of groups) {
      if (group.allocation > 0 || remaining <= 0) {
        remaining = Math.max(0, remaining - group.allocation);
        continue;
      }
      fallbackRank += 1;
      group.rank = fallbackRank;
      group.allocation = Math.min(remaining, group.eligibleCount);
      remaining -= group.allocation;
    }
    return {
      load,
      carriers: groups,
      covered: required - remaining,
      required,
    };
  });
}

function FleetPlanCard({ plan, canManage, onReview }: { plan: FleetLoadPlan; canManage: boolean; onReview: (candidate: Candidate) => void }) {
  const complete = plan.covered >= plan.required;
  const selected = plan.carriers.flatMap((carrier) => carrier.candidates).filter((candidate) => candidate.match?.status === "ACCEPTED").length;
  return <article className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
    <div className="flex flex-col gap-3 border-b border-border bg-steel/15 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-signal px-2.5 py-1 text-[9px] font-black uppercase text-signal-foreground">Fleet requirement</span><span className="font-mono text-[10px] text-muted-foreground">{plan.load.reference}</span></div><h3 className="mt-2 text-sm font-black uppercase">{plan.load.origin.label} → {plan.load.destination.label}</h3><p className="mt-1 text-[11px] text-muted-foreground">{plan.load.requiredBodyTypes.join(" / ").replaceAll("_", " ")} · {(plan.load.weightKg / 1000).toFixed(1)} t · pickup {new Date(plan.load.pickupWindow.from).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div>
      <div className={`min-w-40 rounded-xl border p-3 text-right ${selected >= plan.required ? "border-positive/30 bg-positive/10" : "border-signal/40 bg-signal/10"}`}><div className="font-mono text-2xl font-black">{selected} / {plan.required}</div><div className="text-[9px] font-bold uppercase text-muted-foreground">Trucks selected</div><div className="mt-1 text-[9px] text-muted-foreground">{complete ? `${plan.covered} recommended and available` : `${plan.covered} currently available`}</div></div>
    </div>
    <div className="divide-y divide-border">
      {plan.carriers.map((carrier) => {
        const accepted = carrier.candidates.filter((candidate) => candidate.match?.status === "ACCEPTED");
        const recommended = [
          ...accepted,
          ...carrier.candidates
            .filter((candidate) => candidate.match?.status !== "ACCEPTED")
            .slice(0, Math.max(0, carrier.allocation - accepted.length)),
        ];
        return <div key={carrier.operator.id} className={`p-4 ${carrier.allocation ? "" : "opacity-65"}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-full bg-signal/15 font-mono text-xs font-black text-signal">{carrier.rank ?? "–"}</span><div><div className="text-sm font-black">{carrier.operator.companyName}</div><div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-muted-foreground"><RatingLabel label="Company" value={carrier.operator.ratingAvg} count={carrier.operator.ratingCount} /><span>{carrier.averageScore.toFixed(1)} average match score</span></div></div></div></div><div className="sm:text-right"><div className="font-mono text-lg font-black text-signal">{carrier.allocation} recommended</div><div className="text-[10px] text-muted-foreground">{carrier.eligibleCount} eligible · {carrier.coveragePct.toFixed(0)}% of requirement</div></div></div>
          {recommended.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{recommended.map((candidate) => { const accepted = candidate.match?.status === "ACCEPTED"; return <div key={candidate.truck.id} className={`flex items-center gap-2 rounded-xl border p-2 ${accepted ? "border-positive/40 bg-positive/10" : "border-border bg-steel/15"}`}><div className="size-16 shrink-0 overflow-hidden rounded-lg bg-white"><img src={fleetVehicleAsset(candidate.truck)} alt={`${candidate.truck.bodyType} ${candidate.truck.registration}`} className="h-full w-full object-contain p-1" /></div><div className="min-w-0 flex-1"><div className="truncate font-mono text-xs font-black">{maskRegistration(candidate.truck.registration)}</div><div className="truncate text-[10px] text-muted-foreground">{candidate.truck.bodyType.replaceAll("_", " ")} · {candidate.score.toFixed(1)}/100</div>{candidate.driver && <div className="mt-1 truncate text-[9px] text-muted-foreground">Driver: {candidate.driver.contactName}{candidate.driver.ratingAvg != null ? ` · ★ ${candidate.driver.ratingAvg}` : " · New"}</div>}</div>{accepted ? <span className="rounded-lg bg-positive/15 px-2 py-2 text-[9px] font-black uppercase text-positive">Awaiting transporter</span> : canManage && <button type="button" onClick={() => onReview(candidate)} className="rounded-lg bg-signal px-2 py-2 text-[9px] font-black uppercase text-signal-foreground">Review & select</button>}</div>; })}</div>}
        </div>;
      })}
    </div>
  </article>;
}

function RatingLabel({ label, value, count }: { label: string; value: number | null; count: number }) {
  return <span className="inline-flex items-center gap-1"><Star className={`size-3 ${value != null ? "fill-signal text-signal" : "text-muted-foreground"}`} />{label}: {value != null ? `${value.toFixed(1)} (${count})` : "New"}</span>;
}

function Detail({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof MapPin }) { return <div className="min-w-0 rounded-lg border border-border p-2.5"><p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{Icon && <Icon className="size-3" />}{label}</p><p className="mt-1 truncate font-semibold" title={value}>{value}</p></div>; }
function Summary({ label, value, icon: Icon, accent = false }: { label: string; value: number; icon: typeof Truck; accent?: boolean }) { return <div className={`app-surface flex items-center gap-3 p-4 ${accent ? "border-signal/50" : ""}`}><span className={`grid size-10 place-items-center rounded-xl ${accent ? "bg-signal text-signal-foreground" : "bg-steel text-muted-foreground"}`}><Icon className="size-5" /></span><div><p className="font-mono text-2xl font-black">{value}</p><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p></div></div>; }
