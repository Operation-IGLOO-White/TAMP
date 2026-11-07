// Segmented delivery-progress bar shared across the cargo-owner, transporter
// and driver views. A step-number badge, then one labelled segment per
// milestone: completed = filled, current = half-filled, upcoming = empty. It
// derives everything from the trip status so it advances on its own as the
// driver moves the trip through its lifecycle.

const TRIP_STAGES = ["To pickup", "Pickup", "Loaded", "In transit", "Drop-off", "Delivered"] as const;

function stageIndexFor(status: string): number {
  switch (status) {
    case "EN_ROUTE_PICKUP":
      return 0;
    case "AT_PICKUP":
      return 1;
    case "LOADED":
      return 2;
    case "IN_TRANSIT":
      return 3;
    case "AT_DROPOFF":
      return 4;
    case "DELIVERED":
    case "COMPLETED":
      return 5;
    default:
      return 0;
  }
}

export function TripProgress({ status, className }: { status: string; className?: string }) {
  const current = stageIndexFor(status);
  const finished = status === "DELIVERED" || status === "COMPLETED";
  return (
    <div className={`flex items-center gap-2.5 sm:gap-3 ${className ?? ""}`}>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-background text-sm font-bold text-foreground ring-1 ring-border sm:size-10 sm:text-base">
        {Math.min(current + 1, TRIP_STAGES.length)}
      </span>
      <div className="min-w-0 flex-1 rounded-xl bg-background px-3 py-2.5 ring-1 ring-border sm:hidden">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[10px] font-bold uppercase tracking-wide text-foreground">
            {TRIP_STAGES[current]}
          </span>
          <span className="shrink-0 text-[9px] font-semibold text-muted-foreground">
            Step {current + 1} of {TRIP_STAGES.length}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-steel">
          <div
            className={`h-full rounded-full bg-signal transition-all duration-300 ${!finished ? "animate-pulse" : ""}`}
            style={{
              width: `${finished ? 100 : Math.round(((current + 0.55) / TRIP_STAGES.length) * 100)}%`,
            }}
          />
        </div>
      </div>
      <div
        className="hidden flex-1 gap-2 rounded-2xl bg-background px-3 py-3 ring-1 ring-border sm:grid sm:gap-2.5 sm:px-4"
        style={{ gridTemplateColumns: `repeat(${TRIP_STAGES.length}, minmax(0, 1fr))` }}
      >
        {TRIP_STAGES.map((label, i) => {
          const done = i < current || (finished && i === current);
          const active = i === current && !finished;
          const on = done || active;
          return (
            <div key={label} className="flex flex-col items-center gap-1.5">
              <span
                className={`truncate text-[9px] font-semibold sm:text-[10px] ${
                  on ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
              <span
                className={`size-1.5 rounded-full ${active ? "bg-signal" : on ? "bg-foreground" : "bg-steel"}`}
              />
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-steel">
                <div
                  className={`h-full rounded-full bg-signal transition-all duration-300 ${active ? "animate-pulse" : ""}`}
                  style={{ width: done ? "100%" : active ? "55%" : "0%" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
