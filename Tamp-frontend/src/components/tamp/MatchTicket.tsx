// CMP-01 Match Ticket — the signature element (spec §7.1). A perforated-edge
// docket: load on the left, truck on the right, lane rail between, score
// rail across the bottom.

import { useState } from "react";
import { formatMoney } from "@/lib/tamp-data";
import { maskRegistration } from "@/lib/tamp-mask";
import type { Load, MatchScoreComponent, Party, TruckPosting } from "@/lib/tamp-types";
import { BODY_TYPE_LABEL, BodyTypeIcon } from "./BodyTypeIcon";
import { LaneRail } from "./LaneRail";
import { ScoreRail } from "./ScoreRail";

type Variant = "suggested" | "offered" | "accepted" | "confirmed" | "rejected";

const VARIANT_LABEL: Record<Variant, string> = {
  suggested: "SUGGESTED",
  offered: "AWAITING RESPONSE",
  accepted: "ACCEPTED",
  confirmed: "CONFIRMED",
  rejected: "REJECTED",
};

// Colour-coded match-status indicators (OR009).
const VARIANT_BADGE: Record<Variant, string> = {
  suggested: "bg-steel text-foreground",
  offered: "bg-signal/20 text-signal-foreground",
  accepted: "bg-signal text-signal-foreground",
  confirmed: "bg-positive text-background",
  rejected: "bg-danger/20 text-danger",
};

export function MatchTicket({
  load,
  truck,
  operator,
  score,
  breakdown,
  variant,
  rank,
  onAccept,
  onReject,
}: {
  load: Load;
  truck: TruckPosting;
  operator: Party;
  score: number;
  breakdown: MatchScoreComponent[];
  variant: Variant;
  rank?: number;
  onAccept?: () => void;
  onReject?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const desaturated = variant === "rejected";

  return (
    <div
      className={`border border-border bg-graphite/40 ${desaturated ? "opacity-50 grayscale" : ""}`}
    >
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="font-mono text-[10px] text-muted-foreground">
          {rank !== undefined && <span className="text-signal font-bold">#{rank}</span>} MATCH{" "}
          {load.id} × {truck.id}
        </span>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 ${VARIANT_BADGE[variant]}`}>
          {VARIANT_LABEL[variant]}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start px-4 py-3 border-b border-dashed border-border">
        <div>
          <div className="text-[9px] font-bold uppercase text-muted-foreground mb-0.5">Load</div>
          <div className="text-sm font-bold">{load.id}</div>
          <div className="text-xs text-muted-foreground">
            {(load.weightKg / 1000).toFixed(1)}t{load.volumeM3 ? ` · ${load.volumeM3}m³` : ""} ·{" "}
            {load.cargoType.replaceAll("_", " ")}
          </div>
        </div>

        <div className="text-center px-2">
          <div className="text-2xl font-black font-mono text-signal leading-none">{score}</div>
          <div className="text-[8px] font-bold uppercase text-muted-foreground">/100</div>
        </div>

        <div className="text-right">
          <div className="text-[9px] font-bold uppercase text-muted-foreground mb-0.5">Truck</div>
          <div className="text-sm font-bold">{operator.companyName}</div>
          <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
            <BodyTypeIcon type={truck.bodyType} className="size-4" />
            {BODY_TYPE_LABEL[truck.bodyType]} · {maskRegistration(truck.registration)}
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-dashed border-border">
        <LaneRail
          origin={load.origin}
          destination={load.destination}
          distanceKm={load.distanceKm}
        />
      </div>

      <div className="px-4 py-3 space-y-2">
        <ScoreRail breakdown={breakdown} />
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-[9px] font-bold uppercase tracking-widest text-signal hover:underline"
        >
          {expanded ? "Hide breakdown" : "Show full breakdown"}
        </button>
        {expanded && (
          <div className="space-y-1.5 pt-1">
            {breakdown.map((c) => (
              <div key={c.ruleId} className="text-xs">
                <div className="flex justify-between">
                  <span className="font-medium">
                    {c.label} <span className="text-muted-foreground">/{c.weight}</span>
                  </span>
                  <span className="font-mono font-bold text-positive">+{c.earned.toFixed(1)}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">{c.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {load.targetRate && (
        <div className="px-4 pb-3 text-[10px] text-muted-foreground">
          Target rate{" "}
          <span className="font-mono text-foreground">{formatMoney(load.targetRate)}</span>
        </div>
      )}

      {variant === "suggested" && (onAccept || onReject) && (
        <div className="space-y-2 p-3 bg-signal-foreground/5 border-t border-border">
          <p className="text-[9px] leading-snug text-muted-foreground">
            Accepting this match is a digital acceptance under the Electronic Communications and
            Transactions Act 25 of 2002. It records your intent to engage this carrier and is not an
            advanced electronic signature.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onAccept}
              className="flex-1 bg-signal text-signal-foreground font-black text-xs py-2 uppercase tracking-widest hover:brightness-110"
            >
              Accept Match
            </button>
            <button
              onClick={onReject}
              className="px-4 bg-foreground/10 text-foreground font-bold text-xs py-2 uppercase border border-foreground/20 hover:bg-foreground/20"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
