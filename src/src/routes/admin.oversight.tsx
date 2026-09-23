"use client";


import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { StatusChip } from "@/components/tamp/StatusChip";
import { Panel } from "@/components/tamp/StatCard";
import { displayStatusForLoad, tripForMatch } from "@/lib/tamp-selectors";
import { useTamp } from "@/lib/tamp-store";

function OversightPage() {
  const { loads, matches, trips, ratings, disputes, audit, resolveDispute, reset } = useTamp();
  const openDisputes = disputes.filter((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW");
  const closedLoads = loads.filter((l) => l.status === "COMPLETED" || l.status === "CLOSED");

  const disputeLoad = (tripId: string) => {
    const trip = trips.find((t) => t.id === tripId);
    const match = matches.find((m) => m.id === trip?.matchId);
    return loads.find((l) => l.id === match?.loadId);
  };

  return (
    <AppShell>
      <PageHeader
        title="Platform Oversight"
        actions={
          <button
            onClick={reset}
            className="rounded-md border border-border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Reset demo data
          </button>
        }
      />

      <div className="space-y-6 p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel title={`Flagged Disputes (${openDisputes.length})`}>
            <div className="divide-y divide-border">
              {openDisputes.length === 0 && (
                <p className="p-4 text-xs text-muted-foreground">No open disputes.</p>
              )}
              {openDisputes.map((d) => {
                const load = disputeLoad(d.tripId);
                if (!load) return null;
                return (
                  <div key={d.id} className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">#{load.id}</span>
                        <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-danger">
                          {d.category.replaceAll("_", " ")}
                        </span>
                      </div>
                      <div className="text-sm font-bold uppercase">
                        {load.origin.label} → {load.destination.label}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{d.description}</div>
                    </div>
                    <button
                      onClick={() => resolveDispute(load.id)}
                      className="shrink-0 rounded-md bg-signal px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-signal-foreground hover:brightness-105"
                    >
                      Resolve
                    </button>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title={`Completed Trips (${closedLoads.length})`}>
            <div className="divide-y divide-border">
              {closedLoads.map((l) => {
                const match = matches.find(
                  (m) => m.loadId === l.id && (m.status === "CONFIRMED" || m.status === "ACCEPTED"),
                );
                const trip = tripForMatch(match?.id, trips);
                const rating = trip ? ratings.find((r) => r.tripId === trip.id) : undefined;
                const status = displayStatusForLoad(l, matches, trips, disputes);
                return (
                  <div key={l.id} className="flex items-center justify-between p-4">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">#{l.id}</div>
                      <div className="text-sm font-bold uppercase">
                        {l.origin.label} → {l.destination.label}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs">
                        {rating ? `${rating.stars}/5` : "unrated"}
                      </span>
                      <StatusChip status={status} />
                    </div>
                  </div>
                );
              })}
              {closedLoads.length === 0 && (
                <p className="p-4 text-xs text-muted-foreground">No completed trips yet.</p>
              )}
            </div>
          </Panel>
        </div>

        <Panel title="Audit Trail">
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <tbody className="divide-y divide-border">
                {audit.map((e) => (
                  <tr key={e.id}>
                    <td className="w-40 p-2 text-muted-foreground">
                      {new Date(e.at).toLocaleString("en-ZA")}
                    </td>
                    <td className="w-20 p-2">{e.eventId}</td>
                    <td className="w-28 p-2">{e.actorRole}</td>
                    <td className="p-2 font-semibold text-signal-foreground">{e.eventType}</td>
                    <td className="p-2 text-right text-muted-foreground">{e.subjectId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

export default OversightPage;
