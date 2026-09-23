import { useState } from "react";
import { formatMoney } from "@/lib/tamp-data";
import {
  acceptedMatchForLoad,
  confirmedMatchForLoad,
  topSuggestionForLoad,
  tripForMatch,
} from "@/lib/tamp-selectors";
import { useTamp } from "@/lib/tamp-store";
import type { Acceptance, Load } from "@/lib/tamp-types";
import { DisputeDialog } from "./DisputeDialog";

const RATING_TAGS = [
  "On time",
  "Professional",
  "Cargo secured",
  "Good comms",
  "Late",
  "Damaged",
  "Poor comms",
  "Doc issues",
];

export function Waybill({ load }: { load: Load }) {
  const {
    trucks,
    parties,
    matches,
    trips,
    ratings,
    audit,
    acceptances,
    acceptMatch,
    rejectMatch,
    rateLoad,
    role,
    me,
  } = useTamp();
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const owner = parties.find((p) => p.id === load.ownerId);
  const confirmed = confirmedMatchForLoad(load.id, matches);
  const pending = acceptedMatchForLoad(load.id, matches); // owner accepted, awaiting carrier
  const engaged = confirmed ?? pending;
  const suggestion = engaged ?? topSuggestionForLoad(load.id, matches);
  const truck = suggestion ? trucks.find((t) => t.id === suggestion.truckPostingId) : undefined;
  const operator = truck ? parties.find((p) => p.id === truck.transporterId) : undefined;
  const trip = tripForMatch(confirmed?.id, trips);
  const ownerSeal = acceptances.find(
    (a) => a.matchId === confirmed?.id && a.party === "FREIGHT_OWNER",
  );
  const carrierSeal = acceptances.find(
    (a) => a.matchId === confirmed?.id && a.party === "TRANSPORTER",
  );
  const delivered = !!trip && (trip.status === "DELIVERED" || trip.status === "COMPLETED");
  // My rating of the carrier vs. the rating I received from the carrier.
  const myRating = trip
    ? ratings.find((r) => r.tripId === trip.id && r.raterId === me.id)
    : undefined;
  const receivedRating = trip
    ? ratings.find((r) => r.tripId === trip.id && r.rateeId === me.id)
    : undefined;
  const events = audit
    .filter((e) => e.subjectId === load.id || e.subjectId === trip?.id)
    .slice(0, 3);

  return (
    <div className="bg-paper text-paper-foreground shadow-2xl animate-slide">
      <div className="p-6 border-b-2 border-dashed border-paper-foreground/20">
        <div className="flex justify-between items-center mb-8">
          <div className="text-2xl font-extrabold italic tracking-tighter">WAYBILL</div>
          <div className="text-right">
            <div className="text-[9px] font-bold uppercase leading-none">
              {confirmed ? "Confirmed" : pending ? "Accepted" : "Match Score"}
            </div>
            <div className="text-4xl font-black text-signal [text-shadow:1px_1px_0_black]">
              {confirmed ? "✓" : suggestion ? `${Math.round(suggestion.score)}%` : "—"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8">
          <div>
            <span className="text-[9px] font-bold block mb-1 uppercase">Freight owner</span>
            <div className="text-sm font-bold">{owner?.companyName ?? "Unknown"}</div>
            <div className="text-xs leading-tight opacity-70">{owner?.province}</div>
          </div>
          <div>
            <span className="text-[9px] font-bold block mb-1 uppercase">
              {confirmed ? "Assigned Carrier" : pending ? "Accepted Carrier" : "Proposed Carrier"}
            </span>
            <div className="text-sm font-bold underline">
              {operator ? operator.companyName : "No eligible truck"}
            </div>
            <div className="text-xs leading-tight opacity-70 italic">
              {truck && operator
                ? `${truck.bodyType} · ${truck.registration} · ${operator.verification}`
                : "Widen body type or capacity"}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <h4 className="text-[10px] font-black uppercase tracking-widest border-b border-paper-foreground/10 pb-1">
          {engaged ? "Consignment Detail" : "Matching Parameters (C2: rule-based, no black box)"}
        </h4>

        {engaged ? (
          <div className="space-y-2 text-xs">
            <Row label="Commodity" value={load.cargoType.replaceAll("_", " ")} />
            <Row label="Weight" value={`${load.weightKg.toLocaleString("en-ZA")} KG`} />
            <Row label="Route" value={`${load.origin.label} → ${load.destination.label}`} />
            <Row
              label="Pick-up"
              value={new Date(load.pickupWindow.from).toLocaleDateString("en-ZA")}
            />
            {trip && (
              <div className="pt-3">
                <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                  <span>Trip progress ({trip.status.replaceAll("_", " ")})</span>
                  <span className="font-mono">{trip.progressPct}%</span>
                </div>
                <div className="h-2 bg-paper-foreground/10">
                  <div
                    className="h-full bg-signal transition-all duration-500"
                    style={{ width: `${trip.progressPct}%` }}
                  />
                </div>
              </div>
            )}
            {confirmed && (
              <div className="mt-3 border border-paper-foreground/20 bg-paper-foreground/5 p-3 font-mono text-[10px] leading-relaxed">
                <div className="mb-1.5 font-bold uppercase tracking-widest">
                  Digital Acceptance Receipt
                </div>
                <Receipt k="Contract ref" v={confirmed.id} />
                <Receipt k="Load" v={load.id} />
                <Receipt k="Route" v={`${load.origin.label} → ${load.destination.label}`} />
                <Receipt k="Freight owner" v={owner?.companyName ?? "—"} />
                <Receipt k="Carrier" v={operator?.companyName ?? "—"} />
                {confirmed.agreedRate && (
                  <Receipt k="Agreed rate" v={formatMoney(confirmed.agreedRate)} />
                )}
                {ownerSeal && <Seal title="Accepted — freight owner" seal={ownerSeal} />}
                {carrierSeal && <Seal title="Confirmed — carrier" seal={carrierSeal} />}
                <div className="mt-2 border-t border-paper-foreground/15 pt-2 opacity-70">
                  Digitally accepted under the Electronic Communications and Transactions Act 25 of
                  2002. Not an advanced electronic signature.
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {suggestion && suggestion.breakdown.length > 0 ? (
              suggestion.breakdown.map((b) => (
                <div key={b.ruleId} className="flex justify-between text-xs" title={b.detail}>
                  <span>
                    {b.label} <span className="opacity-50">/{b.weight}</span>
                  </span>
                  <span className="font-bold text-positive font-mono">+{b.earned.toFixed(1)}</span>
                </div>
              ))
            ) : (
              <p className="text-xs italic opacity-70">
                No available truck satisfies the hard filters for this load (§6.1).
              </p>
            )}
          </div>
        )}

        {load.targetRate && (
          <div className="bg-paper-foreground/5 p-4 border border-paper-foreground/10 mt-6">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-[10px] font-bold uppercase">Target Rate</div>
                <div className="text-2xl font-bold font-mono">{formatMoney(load.targetRate)}</div>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-bold opacity-60 uppercase">
                  Platform Fee (5%, excl. VAT)
                </div>
                <div className="text-sm font-medium font-mono">
                  {formatMoney({
                    amount: Math.round(load.targetRate.amount * 0.05),
                    currency: "ZAR",
                    vat: "excl",
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {delivered && (
          <div className="space-y-3 pt-2">
            <div>
              <h4 className="mb-2 text-[10px] font-black uppercase tracking-widest">
                Rate the carrier
              </h4>
              {myRating ? (
                <RatingSummary
                  stars={myRating.stars}
                  tags={myRating.tags}
                  comment={myRating.comment}
                  prefix
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {RATING_TAGS.map((t) => (
                      <button
                        key={t}
                        onClick={() => toggleTag(t)}
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          tags.includes(t)
                            ? "border-paper-foreground bg-paper-foreground text-paper"
                            : "border-paper-foreground/25 text-paper-foreground/70 hover:border-paper-foreground/60"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional feedback"
                    className="w-full border border-paper-foreground/20 bg-paper-foreground/5 px-2 py-1.5 text-xs outline-none focus:border-paper-foreground/60"
                  />
                  <div className="flex gap-1">
                    {([1, 2, 3, 4, 5] as const).map((n) => (
                      <button
                        key={n}
                        onClick={() => rateLoad(load.id, n, note || "No comment", tags)}
                        className="flex-1 border border-paper-foreground/20 py-1.5 text-xs font-bold hover:bg-signal"
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-paper-foreground/50">
                    Pick a star rating to submit
                    {tags.length > 0 ? ` with ${tags.length} tag(s)` : ""}.
                  </p>
                </div>
              )}
            </div>

            {receivedRating && (
              <div className="border-t border-paper-foreground/10 pt-2">
                <h4 className="mb-1 text-[10px] font-black uppercase tracking-widest">
                  Carrier rated you
                </h4>
                <RatingSummary
                  stars={receivedRating.stars}
                  tags={receivedRating.tags}
                  comment={receivedRating.comment}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-6 bg-signal-foreground flex gap-2">
        {load.status === "MATCHED" && pending && (
          <div className="flex flex-1 items-center gap-2 py-3 font-mono text-[10px] uppercase text-background/80">
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-signal" />
            Accepted · awaiting carrier confirmation
          </div>
        )}
        {load.status === "POSTED" && (
          <>
            <button
              disabled={!suggestion}
              onClick={() => suggestion && acceptMatch(load.id, suggestion.truckPostingId)}
              className="flex-1 bg-signal text-signal-foreground font-black text-xs py-3 uppercase tracking-widest hover:brightness-110 active:translate-y-px transition-all disabled:opacity-40"
            >
              Accept Match
            </button>
            <button
              disabled={!suggestion}
              onClick={() => suggestion && rejectMatch(load.id, suggestion.truckPostingId)}
              className="px-6 bg-foreground/10 text-foreground font-bold text-xs py-3 uppercase border border-foreground/20 hover:bg-foreground/20 transition-colors disabled:opacity-40"
            >
              Reject
            </button>
          </>
        )}
        {load.status === "CONFIRMED" && trip && trip.status !== "DELIVERED" && (
          <>
            {/* Cargo owners track — the carrier/driver advances the status. */}
            <div className="flex flex-1 items-center gap-2 py-3 font-mono text-[10px] uppercase text-background/80">
              <span className="size-2 shrink-0 animate-pulse rounded-full bg-signal" />
              Tracking · {trip.status.replaceAll("_", " ")} · {trip.progressPct}%
            </div>
            <button
              onClick={() => setDisputeOpen(true)}
              className="border border-background/25 bg-background/10 px-6 py-3 text-xs font-bold uppercase text-background transition-colors hover:bg-background/20"
            >
              Report an issue
            </button>
          </>
        )}
        {(load.status === "COMPLETED" || load.status === "CLOSED") && (
          <p className="flex-1 py-3 font-mono text-[10px] uppercase text-background/70">
            Trip closed · viewing as {role}
          </p>
        )}
      </div>

      <div className="p-4 bg-paper-foreground/5 font-mono text-[9px] text-paper-foreground/60 leading-relaxed">
        [AUDIT_LOG]{" "}
        {events.length
          ? events
              .map((e) => `${e.eventType} (${new Date(e.at).toLocaleString("en-ZA")})`)
              .join(" | ")
          : "NO EVENTS RECORDED"}
      </div>

      <DisputeDialog loadId={load.id} open={disputeOpen} onClose={() => setDisputeOpen(false)} />
    </div>
  );
}

function RatingSummary({
  stars,
  tags,
  comment,
  prefix,
}: {
  stars: number;
  tags: string[];
  comment?: string | undefined;
  prefix?: boolean;
}) {
  return (
    <div className="space-y-1.5 text-xs">
      <p>
        <span className="font-bold">
          {prefix ? "Rated " : ""}
          {stars}/5
        </span>{" "}
        {comment && <span className="opacity-70 italic">{comment}</span>}
      </p>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-paper-foreground/10 px-2 py-0.5 text-[10px] font-semibold"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-dashed border-paper-foreground/10 pb-1">
      <span>{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

function Receipt({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="opacity-60">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

function Seal({ title, seal }: { title: string; seal: Acceptance }) {
  return (
    <div className="mt-2 border-t border-paper-foreground/15 pt-2">
      <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wider opacity-70">{title}</div>
      <Receipt k="At" v={new Date(seal.at).toLocaleString("en-ZA")} />
      <Receipt k="By user" v={seal.byUserId} />
      <Receipt k="IP" v={seal.ip} />
      <div className="mt-0.5" title={seal.hash}>
        <span className="opacity-60">SHA-256 </span>
        <span className="break-all">{seal.hash.slice(0, 32)}…</span>
      </div>
    </div>
  );
}
