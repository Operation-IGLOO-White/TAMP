import { trpc } from "@/lib/trpc";
import { Check, Copy, ExternalLink, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Renders the public consignee tracking URL for a load, with copy + open
 * actions. The link needs no account — it's what the cargo owner sends the
 * receiver so they can watch the delivery.
 */
export function ShareTrackingLink({ loadId }: { loadId: string }) {
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    trpc.query<{ token: string }>("tracking.link", { loadId }).then(result => {
      if (active) setToken(result.token);
    }).catch(() => { if (active) setError("Tracking link unavailable. Save the load and try again."); });
    return () => { active = false; };
  }, [loadId]);
  const path = token ? `/track/${token}` : "";
  const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the field is still selectable */
    }
  };

  return (
    <div className="border border-border">
      <h3 className="flex items-center gap-2 border-b border-border bg-graphite/50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <Share2 className="size-3.5" /> Share tracking with the consignee
      </h3>
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={token ? url : error || "Preparing tracking link…"}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] text-foreground outline-none focus:border-signal"
          />
          <button
            onClick={copy}
            disabled={!token}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-signal px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-signal-foreground hover:brightness-105"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <a
          href={token ? path : undefined}
          aria-disabled={!token}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-signal hover:underline"
        >
          <ExternalLink className="size-3.5" /> Open tracking page
        </a>
      </div>
    </div>
  );
}
