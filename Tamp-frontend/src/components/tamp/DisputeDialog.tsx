import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTamp } from "@/lib/tamp-store";
import type { DisputeCategory } from "@/lib/tamp-types";

export const DISPUTE_CATEGORIES: { value: DisputeCategory; label: string }[] = [
  { value: "NON_ARRIVAL", label: "Truck didn't arrive" },
  { value: "DELAY", label: "Delay" },
  { value: "DAMAGE", label: "Cargo damaged" },
  { value: "RATE_DISAGREEMENT", label: "Rate disagreement" },
  { value: "CONDUCT", label: "Conduct / behaviour" },
  { value: "OTHER", label: "Other" },
];

/**
 * Modal for raising a dispute with a category + description. Callers own the
 * `open` state and render their own trigger button.
 */
export function DisputeDialog({
  loadId,
  open,
  onClose,
}: {
  loadId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { flagDispute } = useTamp();
  const [category, setCategory] = useState<DisputeCategory>("DELAY");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = () => {
    flagDispute(loadId, category, description.trim());
    setDescription("");
    setCategory("DELAY");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-graphite shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Report an issue"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-bold tracking-tight">Report an issue</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-steel/50 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              What went wrong?
            </span>
            <div className="grid grid-cols-2 gap-2">
              {DISPUTE_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className={`rounded-md border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                    category === c.value
                      ? "border-signal bg-signal/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-steel/40"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Describe the issue
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Add any detail that will help resolve this…"
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-signal"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="rounded-md bg-danger px-4 py-2 text-xs font-bold uppercase tracking-wide text-white hover:brightness-110"
          >
            Raise dispute
          </button>
        </div>
      </div>
    </div>
  );
}
