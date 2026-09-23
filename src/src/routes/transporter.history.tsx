"use client";


import { History } from "lucide-react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { displayStatusForLoad, openDisputeForTrip, ratingByRater } from "@/lib/tamp-selectors";
import { useTamp } from "@/lib/tamp-store";
import { EngagementCard, type Engagement } from "./transporter.engagements";

const ACTIVE_STATUSES = ["SCHEDULED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DROPOFF"];

function HistoryPage() {
  const { loads, trucks, parties, matches, trips, disputes, ratings, me, rateLoad } = useTamp();

  const done: Engagement[] = trips
    .map((trip) => {
      const match = matches.find((m) => m.id === trip.matchId);
      const load = loads.find((l) => l.id === match?.loadId);
      const truck = trucks.find((t) => t.id === match?.truckPostingId);
      if (!load || !truck) return null;
      const operator = parties.find((p) => p.id === truck.transporterId);
      return { trip, load, truck, operator } satisfies Engagement;
    })
    .filter((e): e is Engagement => e !== null && !ACTIVE_STATUSES.includes(e.trip.status));

  return (
    <AppShell>
      <PageHeader title="History" />

      <div className="space-y-3 p-6">
        {done.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-12 text-center">
            <History className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No completed engagements yet. Delivered trips move here.
            </p>
          </div>
        ) : (
          done.map((e) => (
            <EngagementCard
              key={e.trip.id}
              engagement={e}
              status={displayStatusForLoad(e.load, matches, trips, disputes)}
              disputed={!!openDisputeForTrip(e.trip.id, disputes)}
              myRating={ratingByRater(e.trip.id, me.id, ratings)}
              receivedRating={ratings.find((r) => r.tripId === e.trip.id && r.rateeId === me.id)}
              onRate={(stars, comment, tags) => rateLoad(e.load.id, stars, comment, tags)}
            />
          ))
        )}
      </div>
    </AppShell>
  );
}

export default HistoryPage;
