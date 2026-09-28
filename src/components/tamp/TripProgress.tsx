// Segmented delivery-progress bar shared across the cargo-owner, transporter
// and driver views. A step-number badge, then one labelled segment per
// milestone: completed = filled, current = half-filled, upcoming = empty. It
// derives everything from the trip status so it advances on its own as the
// driver moves the trip through its lifecycle.

const TRIP_STAGES = ["Pickup", "Loaded", "In transit", "Drop-off", "Delivered"] as const;

function stageIndexFor(status: string): number {
  switch (status) {
    case "AT_PICKUP":
      return 0;
    case "LOADED":
      return 1;
    case "IN_TRANSIT":
      return 2;
    case "AT_DROPOFF":
      return 3;
    case "DELIVERED":
    case "COMPLETED":
      return 4;
    default:
      return 0;
  }
}

export function TripProgress({ status, className }: { status: string; className?: string }) {
  const current = stageIndexFor(status);
  const finished = status === "DELIVERED" || status === "COMPLETED";
  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-background text-base font-bold text-foreground ring-1 ring-border">
        {Math.min(current + 1, TRIP_STAGES.length)}
      </span>
      <div
        className="grid flex-1 gap-2 rounded-2xl bg-background px-3 py-3 ring-1 ring-border sm:gap-2.5 sm:px-4"
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
