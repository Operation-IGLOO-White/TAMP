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
  score: number;
  breakdown: Match["breakdown"];
  match?: Match;
  kind: "REQUEST" | "SUGGESTION";
};
export default function OwnerOffers() {
  const { loads, trucks, parties, matches, authParty, acceptMatch, acceptRequest } = useTamp();
  const canManage = hasPermission(authParty, "matches.manage");
  const [query, setQuery] = useState("");
  const [review, setReview] = useState<Candidate | null>(null);
  const postedLoads = useMemo(() => loads.filter((load) => load.status === "POSTED"), [loads]);

  const candidates = useMemo(() => {
    const result = new Map<string, Candidate>();
    for (const match of matches.filter((item) => item.status === "OFFERED" || item.status === "SUGGESTED")) {
      const load = postedLoads.find((item) => item.id === match.loadId);
      const truck = trucks.find((item) => item.id === match.truckPostingId);
      const operator = parties.find((item) => item.id === truck?.transporterId);
      if (load && truck && operator) result.set(`${load.id}:${truck.id}`, { load, truck, operator, score: match.score, breakdown: match.breakdown, match, kind: match.initiatedBy === "TRANSPORTER" ? "REQUEST" : "SUGGESTION" });
    }
    return [...result.values()].sort((a, b) => b.score - a.score);
  }, [matches, postedLoads, trucks, parties]);

  const visible = candidates.filter((item) => [item.load.reference, item.load.origin.label, item.load.destination.label, item.truck.registration, item.truck.make, item.truck.model, item.operator.companyName].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const requestCount = candidates.filter((item) => item.kind === "REQUEST").length;

  return <AppShell>
    <PageHeader title="Matches & Offers" />
    <div className="space-y-5 p-4 sm:p-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <Summary label="Pending opportunities" value={candidates.length} icon={Truck} />
        <Summary label="Transporter offers" value={requestCount} icon={PackageOpen} accent={requestCount > 0} />
        <Summary label="System suggestions" value={candidates.length - requestCount} icon={Star} />
      </section>
      <section className="app-surface overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-black">Unaccepted matches</h2><p className="mt-1 text-xs text-muted-foreground">Compare eligible vehicles and review the full route and terms before accepting.</p></div>
          <label className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search load, truck or transporter" className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-signal" /></label>
        </div>
        {visible.length === 0 ? <div className="p-16 text-center"><Truck className="mx-auto size-9 text-muted-foreground" /><p className="mt-3 text-sm font-bold">No pending matches or offers</p><p className="mt-1 text-xs text-muted-foreground">New eligible trucks and transporter requests will appear here.</p></div> : <div className="grid gap-4 p-4 lg:grid-cols-2">{visible.map((candidate) => <OfferCard key={`${candidate.load.id}:${candidate.truck.id}`} candidate={candidate} canManage={canManage} onReview={() => setReview(candidate)} />)}</div>}
      </section>
    </div>
    {review && <MatchReviewDialog load={review.load} truck={review.truck} actionLabel={review.kind === "REQUEST" ? "Approve offer" : "Accept match"} onClose={() => setReview(null)} onConfirm={(proof) => review.kind === "REQUEST" ? acceptRequest(review.load.id, review.truck.id, proof) : acceptMatch(review.load.id, review.truck.id, proof)} />}
  </AppShell>;
}

function OfferCard({ candidate, canManage, onReview }: { candidate: Candidate; canManage: boolean; onReview: () => void }) {
  const { load, truck, operator, kind } = candidate;
  const image = fleetVehicleAsset(truck);
  return <article className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
    <div className="relative h-44 overflow-hidden bg-gradient-to-br from-white via-[#f7f7f4] to-[#ecebe5]"><img src={image} onError={(event) => { event.currentTarget.src = "/fleet/tamp-heavy-truck.png"; }} alt={`${truck.bodyType.toLowerCase()} ${truck.registration}`} className="h-full w-full object-contain p-3 pt-7 drop-shadow-[0_12px_12px_rgba(0,0,0,.16)]" /><span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${kind === "REQUEST" ? "bg-signal text-signal-foreground" : "bg-background/90 text-foreground shadow"}`}>{kind === "REQUEST" ? "Transporter offer" : "Recommended match"}</span><span className="absolute right-3 top-3 rounded-xl bg-background/90 px-3 py-2 font-mono text-xl font-black text-signal shadow">{candidate.score.toFixed(1)}<small className="text-[9px] text-muted-foreground">/100</small></span></div>
    <div className="space-y-4 p-4">
      <div><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{operator.companyName}</p><h3 className="mt-1 text-lg font-black">{truck.make || truck.model ? `${truck.year ?? ""} ${truck.make ?? ""} ${truck.model ?? ""}`.trim() : truck.bodyType.replaceAll("_", " ")}</h3><p className="font-mono text-xs text-muted-foreground">{maskRegistration(truck.registration)}</p></div><span className="inline-flex items-center gap-1 rounded-lg bg-positive/10 px-2 py-1 text-[9px] font-bold uppercase text-positive"><ShieldCheck className="size-3" /> {truck.vehicleVerification === "VERIFIED" ? "Verified" : "Eligible"}</span></div></div>
      <div className="grid grid-cols-2 gap-2 text-xs"><Detail label="Body type" value={truck.bodyType.replaceAll("_", " ")} /><Detail label="Payload" value={`${(truck.payloadCapacityKg / 1000).toFixed(1)} t`} /><Detail label="Available" value={new Date(truck.availableFrom).toLocaleDateString("en-ZA")} icon={CalendarClock} /><Detail label="Current location" value={truck.currentLocation.label} icon={MapPin} /></div>
      <div className="rounded-xl border border-border bg-steel/20 p-3"><p className="font-mono text-[10px] text-muted-foreground">{load.reference}</p><p className="mt-1 line-clamp-2 text-xs font-bold uppercase">{load.origin.label} → {load.destination.label}</p><p className="mt-1 text-[10px] text-muted-foreground">{(load.weightKg / 1000).toFixed(1)} t · {load.cargoType.replaceAll("_", " ")} · pickup {new Date(load.pickupWindow.from).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div>
      <div className="flex gap-2">{canManage && <button onClick={onReview} className="flex-1 rounded-lg bg-signal px-4 py-2.5 text-xs font-black uppercase text-signal-foreground hover:brightness-105">Review route & terms</button>}<Link to="/owner/loads/$loadId" params={{ loadId: load.id }} className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-xs font-bold uppercase hover:bg-steel/30">Load details</Link></div>
    </div>
  </article>;
}

function Detail({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof MapPin }) { return <div className="min-w-0 rounded-lg border border-border p-2.5"><p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{Icon && <Icon className="size-3" />}{label}</p><p className="mt-1 truncate font-semibold" title={value}>{value}</p></div>; }
function Summary({ label, value, icon: Icon, accent = false }: { label: string; value: number; icon: typeof Truck; accent?: boolean }) { return <div className={`app-surface flex items-center gap-3 p-4 ${accent ? "border-signal/50" : ""}`}><span className={`grid size-10 place-items-center rounded-xl ${accent ? "bg-signal text-signal-foreground" : "bg-steel text-muted-foreground"}`}><Icon className="size-5" /></span><div><p className="font-mono text-2xl font-black">{value}</p><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p></div></div>; }
