"use client";

import { Link } from "@/lib/nav";
import { History, Star } from "lucide-react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { StatusChip } from "@/components/tamp/StatusChip";
import { formatMoney } from "@/lib/tamp-data";
import {
  confirmedMatchForLoad,
  displayStatusForLoad,
  ratingByRater,
  tripForMatch,
} from "@/lib/tamp-selectors";
import { useTamp } from "@/lib/tamp-store";

function HistoryPage() {
  const { loads, matches, trips, trucks, parties, ratings, disputes, me } = useTamp();

  const done = loads
    .filter((l) => l.status === "COMPLETED" || l.status === "CLOSED")
    .map((load) => {
      const match = confirmedMatchForLoad(load.id, matches);
      const trip = tripForMatch(match?.id, trips);
      const truck = trucks.find((t) => t.id === match?.truckPostingId);
      const operator = truck ? parties.find((p) => p.id === truck.transporterId) : undefined;
      const deliveredAt = trip?.events.find((e) => e.status === "DELIVERED")?.at;
      const myRating = trip ? ratingByRater(trip.id, me.id, ratings) : undefined;
      return { load, operator, deliveredAt, myRating };
    })
    .sort(
      (a, b) => new Date(b.deliveredAt ?? 0).getTime() - new Date(a.deliveredAt ?? 0).getTime(),
    );

  return (
    <AppShell>
      <PageHeader title="History" />

      <div className="p-6">
        {done.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-12 text-center">
            <History className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No completed shipments yet. Delivered loads move here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="divide-y divide-border">
              {done.map(({ load, operator, deliveredAt, myRating }) => (
                <Link
                  key={load.id}
                  to="/owner/loads/$loadId"
                  params={{ loadId: load.id }}
                  className="flex items-center justify-between gap-4 bg-graphite px-4 py-3.5 hover:bg-steel/30"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold uppercase leading-tight">
                      {load.origin.label} → {load.destination.label}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      #{load.id} · {operator?.companyName ?? "—"}
                      {deliveredAt
                        ? ` · delivered ${new Date(deliveredAt).toLocaleDateString("en-ZA", {
                            day: "2-digit",
                            month: "short",
                          })}`
                        : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {load.targetRate && (
                      <span className="hidden font-mono text-xs sm:inline">
                        {formatMoney(load.targetRate)}
                      </span>
                    )}
                    {myRating && (
                      <span className="inline-flex items-center gap-1 font-mono text-xs">
                        <Star className="size-3 fill-signal text-signal" />
                        {myRating.stars}
                      </span>
                    )}
                    <StatusChip status={displayStatusForLoad(load, matches, trips, disputes)} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default HistoryPage;
