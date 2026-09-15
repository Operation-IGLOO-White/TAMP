// CMP-03 Score breakdown — the numbers, not a bar. One cell per rule showing
// earned/weight, so the rule-based score is legible at a glance (the whole
// argument for a rule-based marketplace over a phone call). A smooth progress
// bar hid the maths; this shows it.

import type { MatchScoreComponent } from "@/lib/tamp-types";

export function ScoreRail({ breakdown }: { breakdown: MatchScoreComponent[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
      {breakdown.map((c) => {
        // "Full" when the rule earned (almost) all of its weight.
        const full = c.earned >= c.weight - 0.05;
        return (
          <div
            key={c.ruleId}
            title={`${c.label}: +${c.earned.toFixed(1)}/${c.weight} — ${c.detail}`}
            className="flex items-baseline justify-between gap-2"
          >
            <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {c.ruleId.replace(/^R-/, "")}
            </span>
            <span className="shrink-0 font-mono text-xs font-bold tabular-nums">
              <span className={full ? "text-positive" : "text-foreground"}>
                {c.earned.toFixed(1)}
              </span>
              <span className="text-muted-foreground">/{c.weight}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
