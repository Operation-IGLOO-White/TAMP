import { CheckCircle2, Clock3, Route, Truck, UserCheck, UserPlus, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { useTamp } from "@/context/TampContext";

export default function DispatchPage() {
  const { me, trips, matches, loads, trucks, parties, dispatches, updateDispatch } = useTamp();
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const carrierMode = me.role === "TRANSPORTER";
  const jobs = useMemo(
    () =>
      trips
        .filter((trip) => trip.status === "SCHEDULED")
        .map((trip) => {
          const match = matches.find((item) => item.id === trip.matchId);
          const load = loads.find((item) => item.id === match?.loadId);
          const truck = trucks.find((item) => item.id === match?.truckPostingId);
          const assignment = [...dispatches].reverse().find((item) => item.tripId === trip.id);
          return { trip, load, truck, assignment };
        })
        .filter(
          (job) => job.load && job.truck && (carrierMode || job.assignment?.driverId === me.id),
        ),
    [carrierMode, dispatches, loads, matches, me.id, trips, trucks],
  );
  const act = async (
    tripId: string,
    action: "ASSIGN" | "ACCEPT" | "DECLINE" | "CANCEL",
    driverEmail?: string,
  ) => {
    setBusy(tripId);
    await updateDispatch(tripId, action, {
      ...(driverEmail || emails[tripId] ? { driverEmail: driverEmail ?? emails[tripId] } : {}),
      ...(notes[tripId] ? { note: notes[tripId] } : {}),
    });
    setBusy(null);
  };

  return (
    <AppShell>
      <PageHeader title={carrierMode ? "Dispatch Board" : "Job Offers"} />
      <div className="space-y-5 bg-background p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Scheduled jobs" value={jobs.length} icon={Route} />
          <Metric
            label="Awaiting driver"
            value={jobs.filter((j) => !j.assignment || j.assignment.status === "OFFERED").length}
            icon={Clock3}
          />
          <Metric
            label="Accepted"
            value={jobs.filter((j) => j.assignment?.status === "ACCEPTED").length}
            icon={UserCheck}
          />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {jobs.map(({ trip, load, truck, assignment }) => (
            <article
              key={trip.id}
              className="overflow-hidden rounded-xl border border-border bg-graphite"
            >
              <div className="flex items-start justify-between gap-3 border-b border-border p-4">
                <div>
                  <div className="font-mono text-xs font-bold">
                    {load!.id} · {trip.id}
                  </div>
                  <h2 className="mt-1 font-black">
                    {load!.origin.label} → {load!.destination.label}
                  </h2>
                </div>
                <Badge status={assignment?.status ?? "NEEDS_DRIVER"} />
              </div>
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <Info label="Vehicle" value={truck!.registration} icon={Truck} />
                  <Info
                    label="Driver"
                    value={
                      parties.find((p) => p.id === assignment?.driverId)?.contactName ??
                      "Unassigned"
                    }
                    icon={UserCheck}
                  />
                </div>
                {carrierMode ? (
                  <>
                    {assignment?.status === "ACCEPTED" ? (
                      <button
                        disabled={busy === trip.id}
                        onClick={() => void act(trip.id, "CANCEL")}
                        className="w-full rounded-md border border-danger px-3 py-2 text-xs font-bold text-danger"
                      >
                        Cancel assignment
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <button
                          disabled={busy === trip.id || me.verification !== "VERIFIED"}
                          onClick={() => void act(trip.id, "ASSIGN", me.email)}
                          className="flex w-full items-center justify-center gap-2 rounded-md border border-signal bg-signal/10 px-3 py-2 text-xs font-bold text-foreground hover:bg-signal/20 disabled:opacity-40"
                        >
                          <UserCheck className="size-4" /> Drive this job myself
                        </button>
                        <div className="text-center text-[10px] font-bold uppercase text-muted-foreground">
                          or assign another driver
                        </div>
                        <input
                          type="email"
                          value={emails[trip.id] ?? ""}
                          onChange={(e) => setEmails({ ...emails, [trip.id]: e.target.value })}
                          placeholder="Verified driver email"
                          className="w-full rounded-md border border-border px-3 py-2 text-sm"
                        />
                        <textarea
                          value={notes[trip.id] ?? ""}
                          onChange={(e) => setNotes({ ...notes, [trip.id]: e.target.value })}
                          placeholder="Instructions for the driver (optional)"
                          className="w-full rounded-md border border-border px-3 py-2 text-sm"
                        />
                        <button
                          disabled={busy === trip.id || !(emails[trip.id] ?? "").includes("@")}
                          onClick={() => void act(trip.id, "ASSIGN")}
                          className="flex w-full items-center justify-center gap-2 rounded-md bg-signal px-3 py-2 text-xs font-bold text-signal-foreground disabled:opacity-40"
                        >
                          <UserPlus className="size-4" />
                          {assignment ? "Reassign driver" : "Offer job to driver"}
                        </button>
                      </div>
                    )}
                  </>
                ) : assignment?.status === "OFFERED" ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {assignment.note || "Review the route and accept this delivery assignment."}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        disabled={busy === trip.id}
                        onClick={() => void act(trip.id, "DECLINE")}
                        className="flex items-center justify-center gap-2 rounded-md border border-danger px-3 py-2 text-xs font-bold text-danger"
                      >
                        <XCircle className="size-4" />
                        Decline
                      </button>
                      <button
                        disabled={busy === trip.id}
                        onClick={() => void act(trip.id, "ACCEPT")}
                        className="flex items-center justify-center gap-2 rounded-md bg-positive px-3 py-2 text-xs font-bold text-white"
                      >
                        <CheckCircle2 className="size-4" />
                        Accept job
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-md bg-positive/10 p-3 text-sm font-semibold text-positive">
                    Assignment accepted. This job is now available in My Jobs.
                  </p>
                )}
              </div>
              {assignment?.timeline?.length ? (
                <div className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
                  Latest: {assignment.timeline.at(-1)?.status.replaceAll("_", " ")} ·{" "}
                  {new Date(assignment.timeline.at(-1)!.at).toLocaleString("en-ZA")}
                </div>
              ) : null}
            </article>
          ))}
          {!jobs.length && (
            <div className="rounded-xl border border-dashed border-border bg-graphite p-12 text-center text-sm text-muted-foreground xl:col-span-2">
              {carrierMode
                ? "No scheduled jobs need dispatching."
                : "No driver offers are waiting for you."}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Route;
}) {
  return (
    <div className="rounded-xl border border-border bg-graphite p-4">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className="size-4 text-signal" />
      </div>
      <div className="mt-2 text-3xl font-black">{value}</div>
    </div>
  );
}
function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Truck }) {
  return (
    <div className="rounded-lg bg-steel/25 p-3">
      <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}
function Badge({ status }: { status: string }) {
  const good = status === "ACCEPTED";
  return (
    <span
      className={`rounded px-2 py-1 text-[9px] font-bold ${good ? "bg-positive/10 text-positive" : status === "OFFERED" ? "bg-warning/15 text-warning" : "bg-steel text-muted-foreground"}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
