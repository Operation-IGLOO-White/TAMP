// CMP-02 Lane Rail — origin ● ————— ▲ ————— ● destination.
// Distance in mono above; truck glyph sits at progress point.

import type { Place } from "@/lib/tamp-types";

export function LaneRail({
  origin,
  destination,
  distanceKm,
  progressPct = 0,
  simulated = false,
}: {
  origin: Place;
  destination: Place;
  distanceKm: number;
  progressPct?: number;
  simulated?: boolean;
}) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground mb-1.5">
        <span className="uppercase tracking-wide truncate">{origin.label}</span>
        <span className="flex items-center gap-1.5 shrink-0 px-2">
          {distanceKm} km
          {simulated && (
            <span className="bg-steel text-foreground px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide">
              Simulated
            </span>
          )}
        </span>
        <span className="uppercase tracking-wide truncate text-right">{destination.label}</span>
      </div>
      <div className="relative h-3 flex items-center">
        <div className="absolute inset-x-1 h-px bg-border" />
        <div className="absolute left-0 size-2 rounded-full bg-foreground" />
        <div className="absolute right-0 size-2 rounded-full bg-foreground" />
        <div
          className="absolute -translate-x-1/2 text-signal text-[10px] leading-none"
          style={{ left: `${Math.min(100, Math.max(0, progressPct))}%` }}
          aria-hidden="true"
        >
          ▲
        </div>
      </div>
    </div>
  );
}
