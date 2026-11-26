import { LoadingIndicator } from "@/components/tamp/LoadingIndicator";
import { useContext, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BusFront, CalendarDays, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useTamp } from "@/context/TampContext";
import { CharterLegMap } from "@/components/tamp/CharterLegMap";
import { charterAssignmentLabel, charterStageLabel, type CharterLegAction, type CharterLegKey } from "@/lib/charter-assignment";
import { trpc } from "@/lib/trpc";
import { charterJobsKey, CharterLocationContext,
  type CharterDriverJob as DriverJob, type CharterDriverLeg as CharterLeg } from "@/lib/charter-location";

const pickupTime = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg",
});
const button = "min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-bold disabled:opacity-50";
const primary = button + " bg-signal text-signal-foreground";
const jobKey = (job: DriverJob) => `${job.bookingId}:${job.vehicle.id}`;

export function CharterDriverJobs() {
  const { authParty } = useTamp();
  const client = useQueryClient();
  const queryKey = charterJobsKey(authParty);
  const sharing = useContext(CharterLocationContext);
  const jobs = useQuery({
    queryKey,
    queryFn: () => trpc.query<DriverJob[]>("charter.driverJobs"),
  });
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState<string | null>(null);
  const [openMap, setOpenMap] = useState<{ job: string; leg: CharterLegKey } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  async function respond(job: DriverJob, action: "ACCEPT" | "DECLINE", reason = "") {
    setBusy(true);
    setFailure(null);
    try {
      await trpc.mutation("charter.respondJob", {
        bookingId: job.bookingId, vehicleId: job.vehicle.id, action, reason,
      });
      setDeclining(null);
      await jobs.refetch();
      toast.success(action === "ACCEPT" ? "Charter job accepted" : "Charter job declined");
    } catch (error) {
      setFailure({ key: jobKey(job), message: error instanceof Error ? error.message : "Please try again." });
      await jobs.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function advance(job: DriverJob, leg: CharterLegKey, revision: number, action: CharterLegAction) {
    setBusy(true);
    setFailure(null);
    try {
      const updated = await trpc.mutation<DriverJob>("charter.advanceJob", {
        bookingId: job.bookingId, vehicleId: job.vehicle.id, leg, revision, action,
      });
      await client.cancelQueries({ queryKey });
      client.setQueryData<DriverJob[]>(queryKey, (items) => items?.map((item) => jobKey(item) === jobKey(updated) ? updated : item));
      if (action === "START" || action === "BOARD") setOpenMap({ job: jobKey(job), leg });
      if (action === "COMPLETE") setOpenMap(null);
      await jobs.refetch();
    } catch (error) {
      setFailure({ key: jobKey(job), message: error instanceof Error ? error.message : "Please try again." });
      await jobs.refetch();
    } finally {
      setBusy(false);
    }
  }

  if (jobs.isPending) return <LoadingIndicator />;
  if (jobs.isError) return <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
    Charter jobs could not be loaded.
    <button className={button} type="button" onClick={() => void jobs.refetch()}>Retry</button>
  </div>;
  if (!jobs.data.length) return <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
    No passenger charter jobs are assigned to you.
  </p>;

  return <div className="grid gap-4 lg:grid-cols-2">
    {sharing.active && <div className="rounded-xl border border-border bg-card p-3 text-sm lg:col-span-2" aria-live="polite">
      <p className="font-semibold">{sharing.state === "sharing" ? "Charter GPS sharing is active"
        : sharing.state === "requesting" ? "Getting your GPS position…" : "Charter GPS needs attention"}</p>
      <p className="text-muted-foreground">{sharing.message || "Keep TAMP open during the active leg."}</p>
      {sharing.state === "error" && <button type="button" className={button + " mt-2"} onClick={sharing.retry}>Retry GPS</button>}
    </div>}
    {jobs.data.map((job) => {
      const key = jobKey(job);
      const isDeclining = declining === key;
      const awaiting = job.status === "OFFERED" && Date.parse(job.responseDeadline ?? job.itinerary.outbound.pickupAt) > Date.now();
      return <article key={key} className="grid min-w-0 gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-bold"><BusFront className="size-4 shrink-0 text-signal" /> {job.vehicle.registration}</p>
            <p className="text-sm text-muted-foreground">{job.vehicle.make} {job.vehicle.model} · {job.supplier}</p>
            <p className="break-all font-mono text-xs text-muted-foreground">{job.bookingId}</p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
            {job.status === "OFFERED" && !awaiting ? "Response window closed" : charterAssignmentLabel[job.status]}
          </span>
        </header>
        {(["outbound", "returnLeg"] as const).map((keyName) => {
          const leg = job.itinerary[keyName];
          if (!leg) return null;
          const blocked = keyName === "returnLeg" && job.itinerary.outbound.progress.stage !== "COMPLETED";
          const startsAt = Date.parse(job.reservationStartsAt);
          const tooEarly = Number.isFinite(startsAt) && startsAt > Date.now();
          return <CharterJobLeg key={keyName} leg={leg} title={keyName === "outbound" ? "Outbound" : "Return"}
            canAdvance={job.status === "ACCEPTED"} blocked={blocked} startsAt={tooEarly ? job.reservationStartsAt : null}
            busy={busy} mapOpen={openMap?.job === key && openMap.leg === keyName}
            onMap={(open) => setOpenMap(open ? { job: key, leg: keyName } : null)}
            onAdvance={(action) => void advance(job, keyName, leg.progress.revision, action)} />;
        })}
        <p className="text-sm">Organiser · {job.customer}</p>
        {job.notes && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{job.notes}</p>}
        {job.reason && <p className="break-words text-sm text-muted-foreground">Decline reason · {job.reason}</p>}
        {awaiting && !isDeclining && <div className="grid grid-cols-2 gap-2">
          <button type="button" className={button} disabled={busy} onClick={() => setDeclining(key)}>Decline</button>
          <button type="button" className={primary} disabled={busy} onClick={() => void respond(job, "ACCEPT")}>Accept job</button>
        </div>}
        {awaiting && isDeclining && <form className="grid gap-2" onSubmit={(event) => {
          event.preventDefault();
          const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
          if (!reason) {
            setFailure({ key, message: "Enter a reason for declining this job." });
            return;
          }
          void respond(job, "DECLINE", reason);
        }}>
          <label className="grid gap-1 text-sm font-medium">
            Reason for declining
            <textarea name="reason" className="rounded-lg border border-border bg-background p-2" required maxLength={500} rows={2} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={button} disabled={busy} onClick={() => { setDeclining(null); setFailure(null); }}>Back</button>
            <button className={primary} disabled={busy}>Confirm decline</button>
          </div>
        </form>}
        {failure?.key === key && <p role="alert" className="text-sm text-danger">{failure.message}</p>}
      </article>;
    })}
  </div>;
}

function CharterJobLeg({ leg, title, canAdvance, blocked, startsAt, busy, mapOpen, onMap, onAdvance }: {
  leg: CharterLeg; title: string; canAdvance: boolean; blocked: boolean; startsAt: string | null;
  busy: boolean; mapOpen: boolean; onMap: (open: boolean) => void; onAdvance: (action: CharterLegAction) => void;
}) {
  const { stage, nextStop } = leg.progress;
  const atStop = stage === "ON_ROUTE" ? leg.stops[nextStop] : undefined;
  const target = stage === "TO_PICKUP" ? leg.origin : stage === "ON_ROUTE" ? atStop ?? leg.destination : null;
  const next: { action: CharterLegAction; label: string } | undefined = {
    SCHEDULED: { action: "START", label: `Start ${title.toLowerCase()}` },
    TO_PICKUP: { action: "ARRIVE_PICKUP", label: "Confirm pickup arrival" },
    AT_PICKUP: { action: "BOARD", label: "Confirm passengers boarded" },
    ON_ROUTE: atStop ? { action: "COMPLETE_STOP", label: `Complete stop ${nextStop + 1}` }
      : { action: "COMPLETE", label: "Complete at drop-off" },
    COMPLETED: undefined,
  }[stage] as { action: CharterLegAction; label: string } | undefined;
  return <section className="grid min-w-0 gap-2 rounded-xl border border-border p-3 text-sm">
    <div className="flex flex-wrap justify-between gap-2">
      <h3 className="font-semibold">{title}</h3>
      {canAdvance && <span className="text-sm text-muted-foreground">{charterStageLabel[stage]}</span>}
    </div>
    <p className="flex items-start gap-2">
      <CalendarDays className="mt-0.5 size-4 shrink-0" /> {pickupTime.format(new Date(leg.pickupAt))} SAST
    </p>
    <div className="flex gap-2">
      <MapPin className="mt-0.5 size-4 shrink-0" />
      <ol className="min-w-0 space-y-1 break-words">
        <li><strong>Pickup</strong> · {leg.origin.label}</li>
        {leg.stops.map((stop, index) => <li key={index}><strong>Stop {index + 1}</strong> · {stop.label}</li>)}
        <li><strong>Drop-off</strong> · {leg.destination.label}</li>
      </ol>
    </div>
    <p>{leg.assigned ? "Assigned to this vehicle" : "Group total"} · {leg.assigned?.passengers ?? leg.groupPassengers} passengers
      {" · "}{leg.assigned?.wheelchairPositions ?? leg.groupWheelchairPositions} wheelchair positions
    </p>
    {canAdvance && blocked && <p className="text-muted-foreground">Available after the outbound leg is complete.</p>}
    {canAdvance && !blocked && startsAt && stage === "SCHEDULED" && <p className="text-muted-foreground">
      Available from {pickupTime.format(new Date(startsAt))} SAST.
    </p>}
    {canAdvance && !blocked && next && !(startsAt && stage === "SCHEDULED") && <div className="grid gap-2">
      {target && !mapOpen && <button type="button" className={button} onClick={() => onMap(true)}>Show route to next checkpoint</button>}
      {target && mapOpen && <CharterLegMap key={`${target.lat}:${target.lng}`} target={target} onClose={() => onMap(false)} />}
      <button type="button" className={primary} disabled={busy} onClick={() => onAdvance(next.action)}>{next.label}</button>
    </div>}
  </section>;
}
