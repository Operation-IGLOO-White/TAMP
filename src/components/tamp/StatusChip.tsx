import type { DisplayStatus } from "@/lib/tamp-selectors";
import type { TruckStatus } from "@/types/domain";

const truckStatusLabels: Record<TruckStatus, string> = {
  AVAILABLE: "AVAILABLE",
  RESERVED: "RESERVED",
  ON_TRIP: "IN TRANSIT",
  OFFLINE: "OFFLINE",
  EXPIRED: "EXPIRED",
};

export function TruckStatusChip({ status }: { status: TruckStatus }) {
  const tone = status === "AVAILABLE" ? "bg-positive/15 text-positive" : "bg-steel text-foreground";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${tone}`}>
      {truckStatusLabels[status]}
    </span>
  );
}

const styles: Record<DisplayStatus, string> = {
  DRAFT: "bg-steel text-foreground",
  POSTED: "bg-foreground text-background",
  MATCHED: "bg-signal text-signal-foreground",
  CONFIRMED: "bg-signal text-signal-foreground",
  IN_TRANSIT: "bg-steel text-foreground",
  DELIVERED: "bg-positive text-background",
  COMPLETED: "bg-positive text-background",
  CLOSED: "bg-steel text-foreground",
  CANCELLED: "bg-danger text-foreground",
  EXPIRED: "bg-danger/20 text-danger",
  DISPUTED: "bg-danger text-foreground",
};

const labels: Record<DisplayStatus, string> = {
  DRAFT: "DRAFT",
  POSTED: "POSTED",
  MATCHED: "MATCHED",
  CONFIRMED: "CONFIRMED",
  IN_TRANSIT: "IN TRANSIT",
  DELIVERED: "DELIVERED",
  COMPLETED: "COMPLETED",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  DISPUTED: "DISPUTED",
};

export function StatusChip({ status }: { status: DisplayStatus }) {
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 animate-flip ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
