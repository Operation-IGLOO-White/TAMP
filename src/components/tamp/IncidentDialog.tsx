import { AlertTriangle, Clock3, Route, Truck, X } from "lucide-react";
import { useState } from "react";
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

export function IncidentDialog({ loadId, open, onClose }: { loadId: string; open: boolean; onClose: () => void }) {
  const { reportIncident, cancelTrip } = useTamp();
  const [kind, setKind] = useState<OperationalIncidentKind>("DELAY");
  const [description, setDescription] = useState("");
  const [delayMinutes, setDelayMinutes] = useState(30);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  const submit = async () => {
    if (description.trim().length < 5) return;
    setBusy(true);
    const ok = cancelling
      ? await cancelTrip(loadId, description.trim())
      : await reportIncident(loadId, kind, description.trim(), kind === "DELAY" ? delayMinutes : undefined);
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
          {kind === "DELAY" && !cancelling && <label className="block text-xs font-bold">Expected delay (minutes)<input type="number" min={5} max={1440} value={delayMinutes} onChange={(e) => setDelayMinutes(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-graphite p-2.5" /></label>}
          <label className="block text-xs font-bold">Details<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder={cancelling ? "Explain why the trip must be cancelled…" : "Describe what happened and what help is needed…"} className="mt-1 w-full resize-none rounded-lg border border-border bg-graphite p-3 text-sm" /></label>
          {cancelling && <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">Before pickup, the vehicle is released. After cargo is loaded, it is taken offline for operational review.</p>}
        </div>
        <div className="flex items-center justify-between border-t border-border p-4">
          <button onClick={() => setCancelling((v) => !v)} className="text-xs font-bold text-danger">{cancelling ? "Report an issue instead" : "Cancel this trip"}</button>
          <button disabled={busy || description.trim().length < 5} onClick={() => void submit()} className="rounded-lg bg-signal px-5 py-2.5 text-xs font-black uppercase text-signal-foreground disabled:opacity-40">{busy ? "Submitting…" : cancelling ? "Confirm cancellation" : "Submit report"}</button>
        </div>
      </div>
    </div>
  );
}
