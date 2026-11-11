import { AlertTriangle, Clock3, Route, Truck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTamp } from "@/context/TampContext";
import type { OperationalIncidentKind } from "@/fns/commands";

const OPTIONS: { kind: OperationalIncidentKind; label: string; Icon: typeof AlertTriangle }[] = [
  { kind: "DELAY", label: "Delay", Icon: Clock3 },
  { kind: "BREAKDOWN", label: "Breakdown", Icon: Truck },
  { kind: "ACCIDENT", label: "Accident", Icon: AlertTriangle },
  { kind: "NO_SHOW", label: "Pickup no-show", Icon: Clock3 },
  { kind: "CARGO_ISSUE", label: "Cargo issue", Icon: AlertTriangle },
  { kind: "ROUTE_OBSTRUCTION", label: "Route obstruction", Icon: Route },
];

const CANCELLATION_REASONS = [
  { value: "VEHICLE_BREAKDOWN", label: "Vehicle breakdown" },
  { value: "DRIVER_UNAVAILABLE", label: "Driver unavailable" },
  { value: "ACCIDENT", label: "Accident" },
  { value: "SAFETY_CONCERN", label: "Safety concern" },
  { value: "PICKUP_PROBLEM", label: "Pickup problem" },
  { value: "ROUTE_BLOCKED", label: "Route blocked" },
  { value: "OTHER", label: "Other reason" },
] as const;

export function IncidentDialog({ loadId, open, onClose, initialMode = "incident" }: { loadId: string; open: boolean; onClose: () => void; initialMode?: "incident" | "cancel" }) {
  const { reportIncident, cancelTrip } = useTamp();
  const [kind, setKind] = useState<OperationalIncidentKind>("DELAY");
  const [description, setDescription] = useState("");
  const [delayMinutes, setDelayMinutes] = useState(30);
  const [cancelling, setCancelling] = useState(initialMode === "cancel");
  const [cancelReason, setCancelReason] = useState<(typeof CANCELLATION_REASONS)[number]["value"]>("VEHICLE_BREAKDOWN");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setCancelling(initialMode === "cancel");
      setDescription("");
      setCancelReason("VEHICLE_BREAKDOWN");
    }
  }, [open, initialMode]);
  if (!open) return null;

  const submit = async () => {
    const detail = description.trim();
    if (!cancelling && detail.length < 5) return;
    if (cancelling && cancelReason === "OTHER" && detail.length < 5) return;
    setBusy(true);
    const reasonLabel = CANCELLATION_REASONS.find((item) => item.value === cancelReason)!.label;
    const cancellationDescription = detail ? `${reasonLabel}: ${detail}` : reasonLabel;
    const ok = cancelling
      ? await cancelTrip(loadId, cancellationDescription)
      : await reportIncident(loadId, kind, detail, kind === "DELAY" ? delayMinutes : undefined);
    setBusy(false);
    if (ok) { setDescription(""); setCancelling(false); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-5">
          <div><h2 className="font-black">{cancelling ? "Cancel trip" : "Report operational issue"}</h2><p className="text-xs text-muted-foreground">Load {loadId}</p></div>
          <button onClick={onClose} aria-label="Close"><X className="size-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          {!cancelling && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{OPTIONS.map(({ kind: value, label, Icon }) => (
            <button key={value} onClick={() => setKind(value)} className={`rounded-xl border p-3 text-left text-xs font-bold ${kind === value ? "border-signal bg-signal/10" : "border-border hover:border-signal/40"}`}><Icon className="mb-2 size-4" />{label}</button>
          ))}</div>}
          {cancelling && (
            <div>
              <div className="mb-2 text-xs font-bold">Why is this trip being cancelled?</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CANCELLATION_REASONS.map((reason) => (
                  <button
                    type="button"
                    key={reason.value}
                    onClick={() => setCancelReason(reason.value)}
                    className={`rounded-xl border p-3 text-left text-xs font-bold ${cancelReason === reason.value ? "border-danger bg-danger/10 text-danger" : "border-border hover:border-danger/40"}`}
                  >
                    {reason.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {kind === "DELAY" && !cancelling && <label className="block text-xs font-bold">Expected delay (minutes)<input type="number" min={5} max={1440} value={delayMinutes} onChange={(e) => setDelayMinutes(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-graphite p-2.5" /></label>}
          <label className="block text-xs font-bold">{cancelling ? `Additional details${cancelReason === "OTHER" ? " (required)" : " (optional)"}` : "Details"}<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder={cancelling ? "Add any useful cancellation details…" : "Describe what happened and what help is needed…"} className="mt-1 w-full resize-none rounded-lg border border-border bg-graphite p-3 text-sm" /></label>
          {cancelling && <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">Before pickup, the vehicle is released. After cargo is loaded, it is taken offline for operational review.</p>}
        </div>
        <div className="flex items-center justify-between border-t border-border p-4">
          <button onClick={() => setCancelling((v) => !v)} className="text-xs font-bold text-danger">{cancelling ? "Report an issue instead" : "Cancel this trip"}</button>
          <button disabled={busy || (!cancelling && description.trim().length < 5) || (cancelling && cancelReason === "OTHER" && description.trim().length < 5)} onClick={() => void submit()} className={`rounded-lg px-5 py-2.5 text-xs font-black uppercase disabled:opacity-40 ${cancelling ? "bg-danger text-white" : "bg-signal text-signal-foreground"}`}>{busy ? "Submitting…" : cancelling ? "Confirm cancellation" : "Submit report"}</button>
        </div>
      </div>
    </div>
  );
}
