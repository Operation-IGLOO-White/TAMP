import { AlertTriangle, Check, Loader2, MapPin, ShieldCheck, Truck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { computeRoute } from "@/fns/routes";
import { prepareOfferCmd, type OfferProof } from "@/fns/commands";
import { userFacingError } from "@/lib/api-errors";
import { fleetVehicleAsset } from "@/lib/fleet-assets";
import { formatMoney } from "@/lib/tamp-data";
import { maskRegistration } from "@/lib/tamp-mask";
import type { MatchOffer } from "@/types/api";
import type { Load, Party, TruckPosting } from "@/types/domain";

export type BatchEngagementCandidate = {
  truck: TruckPosting;
  operator: Party;
  score: number;
  kind: "REQUEST" | "SUGGESTION";
};

type PreparedCandidate = BatchEngagementCandidate & {
  offer: MatchOffer | null;
  error: string | null;
};

export function BatchEngagementDialog({
  load,
  candidates,
  mode = "owner-accept",
  onClose,
  onConfirm,
}: {
  load: Load;
  candidates: BatchEngagementCandidate[];
  mode?: "owner-accept" | "transporter-confirm";
  onClose: () => void;
  onConfirm: (candidate: BatchEngagementCandidate, proof: OfferProof) => Promise<void>;
}) {
  const [prepared, setPrepared] = useState<PreparedCandidate[]>([]);
  const [preparing, setPreparing] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  useEffect(() => {
    let cancelled = false;
    setPreparing(true);
    setPrepared([]);
    void (async () => {
      const journey = await computeRoute(
        load.origin,
        load.destination,
        load.stops?.slice(1, -1).map((stop) => stop.place) ?? [],
      );
      if (!journey) throw new Error("The freight route could not be calculated.");
      const results = await Promise.all(
        candidates.map(async (candidate): Promise<PreparedCandidate> => {
          try {
            const deadhead = await computeRoute(candidate.truck.currentLocation, load.origin);
            const offer = await prepareOfferCmd(
              load.id,
              candidate.truck.id,
              journey.routeToken,
              deadhead?.routeToken,
            );
            return { ...candidate, offer, error: null };
          } catch (cause) {
            return {
              ...candidate,
              offer: null,
              error: cause instanceof Error ? cause.message : "Terms could not be prepared.",
            };
          }
        }),
      );
      if (!cancelled) setPrepared(results);
    })()
      .catch((cause: unknown) => {
        if (!cancelled) {
          setPrepared(
            candidates.map((candidate) => ({
              ...candidate,
              offer: null,
              error: cause instanceof Error ? cause.message : "The route could not be prepared.",
            })),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setPreparing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [candidates, load]);

  const ready = prepared.filter((candidate) => candidate.offer);
  const allocationRate = load.targetRate;
  const total = allocationRate ? allocationRate.amount * ready.length : null;
  const carrierCount = useMemo(
    () => new Set(candidates.map((candidate) => candidate.operator.id)).size,
    [candidates],
  );

  const confirm = async () => {
    if (!agreed || ready.length !== candidates.length || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    const accepted = [...completed];
    const remaining = ready.filter((candidate) => !completed.includes(candidate.truck.id));
    try {
      for (const candidate of remaining) {
        const offer = candidate.offer!;
        await onConfirm(candidate, {
          offerId: offer.id,
          revision: offer.revision,
          termsHash: offer.termsHash,
        });
        accepted.push(candidate.truck.id);
        setCompleted([...accepted]);
      }
      onClose();
    } catch (cause) {
      setSubmitError(
        `${accepted.length} of ${ready.length} trucks were accepted. ${userFacingError(cause, "The remaining allocation could not be accepted.")}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-3 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="batch-engagement-title" className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <header className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2"><span className="rounded-full bg-signal px-2.5 py-1 text-[9px] font-black uppercase text-signal-foreground">Fleet engagement</span><span className="font-mono text-[10px] text-muted-foreground">{load.reference}</span></div>
            <h2 id="batch-engagement-title" className="mt-2 text-lg font-black">{mode === "transporter-confirm" ? "Confirm" : "Review"} {candidates.length} truck allocations</h2>
            <p className="mt-1 text-xs text-muted-foreground">{mode === "transporter-confirm" ? "Confirm the trucks selected by the Freight Owner. A trip and dispatch record will be created for every confirmed allocation." : "Each truck receives its own auditable offer and must still be confirmed by its transporter."}</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close" className="rounded-lg p-2 hover:bg-steel/40 disabled:opacity-40"><X className="size-5" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="grid gap-3 border-b border-border bg-steel/15 p-4 sm:grid-cols-4">
            <Summary label="Trucks selected" value={`${candidates.length} / ${load.trucksRequired ?? 1}`} />
            <Summary label="Transporters" value={String(carrierCount)} />
            <Summary label="Combined rate" value={preparing ? "Calculating…" : total != null && allocationRate ? formatMoney({ ...allocationRate, amount: total }) : "On file"} />
            <Summary label="Pickup" value={new Date(load.pickupWindow.from).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })} />
          </section>

          <section className="border-b border-border p-4">
            <div className="flex items-start gap-3"><MapPin className="mt-0.5 size-4 shrink-0 text-signal" /><div><p className="text-xs font-black uppercase">{load.origin.label}</p><p className="mt-1 text-xs text-muted-foreground">to {load.destination.label}</p></div></div>
          </section>

          <section className="space-y-3 p-4">
            {preparing && <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-5 animate-spin text-signal" /> Preparing individual route terms…</div>}
            {!preparing && prepared.map((candidate, index) => {
              const done = completed.includes(candidate.truck.id);
              return <article key={candidate.truck.id} className={`grid gap-3 rounded-xl border p-3 sm:grid-cols-[5rem_1fr_auto] sm:items-center ${candidate.error ? "border-danger/40 bg-danger/5" : done ? "border-positive/40 bg-positive/5" : "border-border"}`}>
                <div className="h-16 overflow-hidden rounded-lg bg-white"><img src={fleetVehicleAsset(candidate.truck)} alt={candidate.truck.registration} className="h-full w-full object-contain p-1" /></div>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-steel font-mono text-[10px] font-black">{index + 1}</span><span className="font-mono text-sm font-black">{maskRegistration(candidate.truck.registration)}</span><span className="rounded bg-steel px-2 py-1 text-[9px] font-black uppercase text-muted-foreground">{candidate.truck.bodyType.replaceAll("_", " ")}</span></div><p className="mt-1 text-xs font-semibold">{candidate.operator.companyName}</p><p className="mt-1 text-[10px] text-muted-foreground">{candidate.score.toFixed(1)}/100 match · {(candidate.truck.payloadCapacityKg / 1000).toFixed(1)} t capacity · {candidate.kind === "REQUEST" ? "Transporter offer" : "System suggestion"}</p>{candidate.error && <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-danger"><AlertTriangle className="size-3.5" /> {candidate.error}</p>}</div>
                <div className="text-left sm:text-right">{done ? <span className="inline-flex items-center gap-1 rounded-lg bg-positive/10 px-3 py-2 text-[10px] font-black uppercase text-positive"><Check className="size-3.5" /> Accepted</span> : candidate.offer ? <><p className="font-mono text-base font-black">{allocationRate ? formatMoney(allocationRate) : "On file"}</p><p className="mt-1 text-[9px] uppercase text-muted-foreground">Individual allocation</p></> : null}</div>
              </article>;
            })}
          </section>
        </div>

        <footer className="border-t border-border bg-background p-4">
          {submitError && <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs font-semibold text-danger">{submitError}</div>}
          <label className="mb-3 flex cursor-pointer items-start gap-2 text-xs"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} disabled={preparing || submitting} className="mt-0.5 accent-[#f2b400]" /><span>I agree to the displayed trucks, routes, pickup window and individual rates. {mode === "transporter-confirm" ? "Confirming creates a separate operational trip for every truck." : "I understand that every transporter must confirm its allocated truck."}</span></label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} disabled={submitting} className="min-h-11 rounded-lg border border-border px-5 text-xs font-black uppercase hover:bg-steel/30 disabled:opacity-40">Cancel</button><button type="button" onClick={() => void confirm()} disabled={!agreed || preparing || submitting || ready.length !== candidates.length || completed.length === ready.length} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-signal px-6 text-xs font-black uppercase text-signal-foreground hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45">{submitting ? <><Loader2 className="size-4 animate-spin" /> {mode === "transporter-confirm" ? "Confirming" : "Accepting"} {Math.min(completed.length + 1, ready.length)} of {ready.length}</> : <><ShieldCheck className="size-4" /> {completed.length ? `Retry ${ready.length - completed.length} remaining` : `${mode === "transporter-confirm" ? "Confirm" : "Accept"} ${ready.length} truck allocations`}</>}</button></div>
        </footer>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-background p-3"><p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 truncate font-mono text-sm font-black" title={value}>{value}</p></div>;
}
