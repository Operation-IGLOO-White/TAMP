import { trpc } from "@/lib/trpc";
import { charterVehicleComplete } from "@/lib/charter-assignment";
import { ReassignCharterDriver, type Booking } from "@/components/tamp/CharterBookings";
import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, Clock3, MapPin,
  RefreshCw, Route, Search, Send, Truck, UserPlus, Users, XCircle,
} from "lucide-react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { Avatar } from "@/components/tamp/Avatar";
import { useTamp } from "@/context/TampContext";
import { listDriverDocuments, type DriverDocument } from "@/fns/driver-documents";
import { listOrganisationMembers, type OrganisationMember } from "@/fns/organisations";
import type { DispatchAssignment, Load, Party, Trip, TruckPosting } from "@/types/domain";

type Job = { trip: Trip; load: Load; truck: TruckPosting; assignment: DispatchAssignment | undefined };
type Queue = "NEEDS_DRIVER" | "OFFERED" | "ACCEPTED" | "EXCEPTION";
type Range = "TODAY" | "7_DAYS" | "ALL";

const activeStatuses = new Set(["SCHEDULED", "EN_ROUTE_PICKUP", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DROPOFF"]);
const queues: Record<Queue, { title: string; hint: string; style: string }> = {
  NEEDS_DRIVER: { title: "Needs a driver", hint: "Assign before pickup", style: "border-danger/40 bg-danger/5" },
  OFFERED: { title: "Awaiting response", hint: "Driver offer sent", style: "border-signal/50 bg-signal/5" },
  ACCEPTED: { title: "Ready to operate", hint: "Driver accepted", style: "border-positive/40 bg-positive/5" },
  EXCEPTION: { title: "Needs attention", hint: "Declined or cancelled", style: "border-warning/50 bg-warning/5" },
};

export default function DispatchPage() {
  const tamp = useTamp();
  const { me, authParty, trips, matches, loads, trucks, parties, dispatches, updateDispatch } = tamp;
  const carrierMode = authParty?.permissions?.includes("dispatch.manage") ?? false;
  const organisationId = authParty?.activeOrganisationId ?? null;
  const passengerBookings = useQuery({
    queryKey: ["charter-bookings", me.id, organisationId],
    queryFn: () => trpc.query<Booking[]>("charter.list"),
    enabled: carrierMode,
    refetchInterval: 20_000,
  });
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<Range>("7_DAYS");
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  const { data: members = [], isFetching, refetch } = useQuery({
    queryKey: ["organisation-members", organisationId],
    queryFn: () => listOrganisationMembers(organisationId!),
    enabled: carrierMode && Boolean(organisationId),
  });
  const drivers = useMemo(() => members.filter((m) => m.roleIds.includes("ROLE-DRIVER") && m.verification === "VERIFIED" && !m.suspended), [members]);
  const documentQueries = useQueries({
    queries: drivers.map((driver) => ({
      queryKey: ["driver-documents", organisationId, driver.id],
      queryFn: () => listDriverDocuments(organisationId!, driver.id),
      enabled: carrierMode && Boolean(organisationId),
      staleTime: 60_000,
    })),
  });
  const documentsByDriver = useMemo(
    () => new Map(drivers.map((driver, index) => [driver.id, documentQueries[index]?.data ?? []])),
    [drivers, documentQueries],
  );

  const jobs = useMemo<Job[]>(() => trips
    .filter((trip) => activeStatuses.has(trip.status))
    .map((trip) => {
      const match = matches.find((m) => m.id === trip.matchId);
      const load = loads.find((l) => l.id === match?.loadId);
      const truck = trucks.find((t) => t.id === match?.truckPostingId);
      const assignment = [...dispatches].reverse().find((d) => d.tripId === trip.id);
      return load && truck ? { trip, load, truck, assignment } : null;
    })
    .filter((job): job is Job => Boolean(job))
    .filter((job) => carrierMode || job.assignment?.driverId === me.id)
    .sort((a, b) => +new Date(a.load.pickupWindow.from) - +new Date(b.load.pickupWindow.from)),
  [carrierMode, dispatches, loads, matches, me.id, trips, trucks]);

  const visible = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const week = new Date(today); week.setDate(today.getDate() + 7);
    const needle = query.trim().toLowerCase();
    return jobs.filter((job) => {
      const pickup = new Date(job.load.pickupWindow.from);
      const inRange = range === "ALL" || (range === "TODAY" ? pickup >= today && pickup < tomorrow : pickup >= today && pickup < week);
      if (!inRange) return false;
      if (!needle) return true;
      const driver = findDriver(job.assignment?.driverId, members, parties);
      return [job.load.reference, job.load.id, job.trip.id, job.truck.registration, job.load.origin.label, job.load.destination.label, driver?.contactName].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [jobs, members, parties, query, range]);

  const driverConflicts = useMemo(() => conflicts(jobs, "driver"), [jobs]);
  const truckConflicts = useMemo(() => conflicts(jobs, "truck"), [jobs]);
  const workingDrivers = new Set(jobs.filter((j) => j.assignment?.status === "ACCEPTED").map((j) => j.assignment!.driverId));
  const usedTrucks = new Set(jobs.map((j) => j.truck.id));

  const act = async (tripId: string, action: "ASSIGN" | "ACCEPT" | "DECLINE" | "CANCEL", driverEmail?: string) => {
    setBusy(tripId);
    try {
      const ok = await updateDispatch(tripId, action, {
        ...(driverEmail || emails[tripId] ? { driverEmail: driverEmail ?? emails[tripId] } : {}),
        ...(notes[tripId]?.trim() ? { note: notes[tripId].trim() } : {}),
      });
      if (ok) { setExpanded(null); setNotes((old) => ({ ...old, [tripId]: "" })); }
    } finally { setBusy(null); }
  };

  const autoPlanDrivers = (loadJobs: Job[]) => {
    const planned = new Set<string>();
    const next = { ...emails };
    for (const job of loadJobs.filter((candidate) => queueFor(candidate) !== "ACCEPTED")) {
      const driver = drivers.find((candidate) =>
        !planned.has(candidate.id) &&
        driverEligibleForJob(candidate, documentsByDriver.get(candidate.id) ?? [], job).eligible &&
        driverCanTake(candidate.id, job, jobs),
      );
      if (!driver) continue;
      planned.add(driver.id);
      next[job.trip.id] = driver.email;
    }
    setEmails(next);
  };

  const sendFleetOffers = async (loadId: string, loadJobs: Job[]) => {
    const assignable = loadJobs.filter(
      (job) => queueFor(job) !== "ACCEPTED" && (emails[job.trip.id] ?? "").includes("@"),
    );
    if (!assignable.length) return;
    setBulkBusy(loadId);
    try {
      for (const job of assignable) {
        const driverEmail = emails[job.trip.id]!;
        const note = notes[job.trip.id]?.trim();
        await updateDispatch(job.trip.id, "ASSIGN", {
          driverEmail,
          ...(note ? { note } : {}),
        });
      }
    } finally {
      setBulkBusy(null);
    }
  };

  if (!carrierMode) return <DriverOffers jobs={jobs} meId={me.id} notes={notes} setNotes={setNotes} busy={busy} act={act} />;

  const passengerRows = (passengerBookings.data ?? []).filter((booking) => booking.incoming && booking.status === "CONFIRMED")
    .flatMap((booking) => (booking.quote?.vehicles ?? []).filter((vehicle) => {
      const progress = booking.vehicleProgress?.find((item) => item.vehicleId === vehicle.id);
      return !progress || !charterVehicleComplete(progress);
    }).map((vehicle) => {
      const assignment = booking.driverAssignments?.find((item) => item.vehicleId === vehicle.id);
      const queue: Queue = !vehicle.driverId ? "NEEDS_DRIVER" : assignment?.status === "ACCEPTED" ? "ACCEPTED"
        : assignment?.status === "DECLINED" || assignment?.status === "CANCELLED" ? "EXCEPTION" : "OFFERED";
      return { booking, vehicle, assignment, queue };
    }));
  const passengerVisible = passengerRows.filter(({ booking, vehicle }) => {
    const pickup = new Date(booking.outbound.pickupAt);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const limit = new Date(today); limit.setDate(limit.getDate() + (range === "TODAY" ? 1 : 7));
    return (range === "ALL" || (pickup >= today && pickup < limit))
      && [booking.id, booking.outbound.origin.label, booking.outbound.destination.label, vehicle.registration]
        .join(" ").toLowerCase().includes(query.toLowerCase());
  });
  const counts = (queue: Queue) => jobs.filter((j) => queueFor(j) === queue).length + passengerRows.filter((item) => item.queue === queue).length;
  return <AppShell>
    <PageHeader title="Dispatch Control Centre" actions={
      <button onClick={() => { void refetch(); void passengerBookings.refetch(); }} disabled={isFetching} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-bold hover:border-signal disabled:opacity-50">
        <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
      </button>} />
    <main className="space-y-5 bg-background p-4 sm:p-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Operational jobs" hint="Confirmed jobs in this workspace" value={jobs.length + passengerRows.length} icon={Route} />
        <Metric label="Needs driver" hint="Assign a driver before pickup" value={counts("NEEDS_DRIVER")} icon={UserPlus} alert />
        <Metric label="Awaiting response" hint="Waiting for the driver to accept" value={counts("OFFERED")} icon={Clock3} />
        <Metric label="Ready" hint="Driver has accepted the assignment" value={counts("ACCEPTED")} icon={CheckCircle2} />
        <Metric label="Conflicts" hint="Overlapping driver or truck schedules" value={new Set([...driverConflicts, ...truckConflicts]).size} icon={AlertTriangle} alert />
      </section>

      <section className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm lg:flex-row">
            <label className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search load, route, truck or driver…" className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-signal" /></label>
            <div className="flex rounded-xl border border-border bg-background p-1">{(["TODAY", "7_DAYS", "ALL"] as Range[]).map((item) => <button key={item} onClick={() => setRange(item)} className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase ${range === item ? "bg-signal text-signal-foreground" : "text-muted-foreground"}`}>{item === "7_DAYS" ? "7 days" : item.toLowerCase()}</button>)}</div>
          </div>
          <FleetReadinessPlanner
            jobs={visible}
            allJobs={jobs}
            drivers={drivers}
            members={members}
            parties={parties}
            documentsByDriver={documentsByDriver}
            emails={emails}
            setEmails={setEmails}
            bulkBusy={bulkBusy}
            busy={busy}
            onAutoPlan={autoPlanDrivers}
            onSend={sendFleetOffers}
            onAssign={(tripId, email) => act(tripId, "ASSIGN", email)}
          />
          <Schedule jobs={jobs} />
          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
            {(Object.keys(queues) as Queue[]).map((queue) => <QueueColumn key={queue} extraCount={passengerVisible.filter((item) => item.queue === queue).length}
              passengerCards={passengerVisible.filter((item) => item.queue === queue).map(({ booking, vehicle, assignment }) =>
                <article key={booking.id + vehicle.id} className="grid gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
                  <p className="text-[9px] font-bold uppercase text-signal">Passenger charter</p>
                  <h3 className="break-words text-xs font-bold">{booking.outbound.origin.label} → {booking.outbound.destination.label}</h3>
                  <p className="text-xs font-semibold">{vehicle.registration} · {vehicle.make} {vehicle.model}</p>
                  <p className="text-[10px] text-muted-foreground">Pickup {formatDate(booking.outbound.pickupAt)} · {booking.outbound.passengers} passengers</p>
                  <p className="text-xs">{assignment?.driverName ?? "Driver not assigned"}</p>
                  {assignment?.reason && <p className="text-xs text-danger">{assignment.reason}</p>}
                  {assignment?.canReassign && <ReassignCharterDriver bookingId={booking.id} vehicleId={vehicle.id} registration={vehicle.registration}
                    onSaved={async () => { await passengerBookings.refetch(); }} />}
                </article>)}
              queue={queue} jobs={visible.filter((j) => queueFor(j) === queue)} allJobs={jobs} drivers={drivers} members={members} parties={parties} documentsByDriver={documentsByDriver} emails={emails} notes={notes} setEmails={setEmails} setNotes={setNotes} busy={busy} expanded={expanded} setExpanded={setExpanded} driverConflicts={driverConflicts} truckConflicts={truckConflicts} act={act} />)}
          </div>
        </div>
        <aside className="space-y-4">
          <Resources drivers={drivers} workingDrivers={workingDrivers} trucks={trucks} usedTrucks={usedTrucks} />
          <Attention jobs={jobs} driverConflicts={driverConflicts} truckConflicts={truckConflicts} />
        </aside>
      </section>
    </main>
  </AppShell>;
}

function FleetReadinessPlanner({
  jobs,
  allJobs,
  drivers,
  members,
  parties,
  documentsByDriver,
  emails,
  setEmails,
  bulkBusy,
  busy,
  onAutoPlan,
  onSend,
  onAssign,
}: {
  jobs: Job[];
  allJobs: Job[];
  drivers: OrganisationMember[];
  members: OrganisationMember[];
  parties: Party[];
  documentsByDriver: Map<string, DriverDocument[]>;
  emails: Record<string, string>;
  setEmails: Dispatch<SetStateAction<Record<string, string>>>;
  bulkBusy: string | null;
  busy: string | null;
  onAutoPlan: (jobs: Job[]) => void;
  onSend: (loadId: string, jobs: Job[]) => Promise<void>;
  onAssign: (tripId: string, email: string) => Promise<void>;
}) {
  const groups = useMemo(() => {
    const grouped = new Map<string, Job[]>();
    jobs.forEach((job) => grouped.set(job.load.id, [...(grouped.get(job.load.id) ?? []), job]));
    return [...grouped.values()].filter(
      (group) => (group[0]?.load.trucksRequired ?? 1) > 1 || group.length > 1,
    );
  }, [jobs]);
  if (!groups.length) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2"><Users className="size-4 text-signal" /><h2 className="text-sm font-black">Multi-truck dispatch readiness</h2></div>
        <p className="mt-1 text-[10px] text-muted-foreground">Plan verified drivers across every allocation, then send the offers as one dispatch action.</p>
      </div>
      <div className="divide-y divide-border">
        {groups.map((group) => {
          const load = group[0]!.load;
          const required = load.trucksRequired ?? group.length;
          const ready = group.filter((job) => queueFor(job) === "ACCEPTED").length;
          const awaiting = group.filter((job) => queueFor(job) === "OFFERED").length;
          const open = group.filter((job) => queueFor(job) === "NEEDS_DRIVER" || queueFor(job) === "EXCEPTION").length;
          const planned = group.filter((job) => queueFor(job) !== "ACCEPTED" && (emails[job.trip.id] ?? "").includes("@")).length;
          return (
            <article key={load.id} className="p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-muted-foreground">{load.reference || load.id}</p>
                  <h3 className="mt-1 line-clamp-2 text-xs font-black uppercase">{shortPlace(load.origin.label)} <span className="mx-1 inline-block align-middle text-2xl leading-none" aria-label="to">→</span> {shortPlace(load.destination.label)}</h3>
                  <p className="mt-1 text-[10px] text-muted-foreground">Pickup {formatDate(load.pickupWindow.from)} · {group.length}/{required} truck allocations confirmed</p>
                </div>
                <div className="grid min-w-72 grid-cols-3 gap-2">
                  <ReadinessMetric label="Driver ready" value={`${ready}/${group.length}`} positive={ready === group.length} />
                  <ReadinessMetric label="Awaiting" value={String(awaiting)} />
                  <ReadinessMetric label="Unassigned" value={String(open)} danger={open > 0} />
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[760px] text-left">
                  <thead className="border-b border-border bg-steel/25 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-3 py-2">Truck</th><th className="px-3 py-2">Dispatch state</th><th className="px-3 py-2">Assigned driver</th><th className="px-3 py-2">Compliance</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {group.map((job) => {
                      const queue = queueFor(job);
                      const assigned = findDriver(job.assignment?.driverId, members, parties);
                      const selectedEmail = emails[job.trip.id] ?? assigned?.email ?? "";
                      const selectedDriver = drivers.find((driver) => driver.email === selectedEmail);
                      const selectedEligibility = selectedDriver ? driverEligibleForJob(selectedDriver, documentsByDriver.get(selectedDriver.id) ?? [], job) : null;
                      return (
                        <tr key={job.trip.id}>
                          <td className="px-3 py-3"><p className="font-mono text-xs font-black">{job.truck.registration}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{job.truck.bodyType.replaceAll("_", " ")} · {job.trip.id}</p></td>
                          <td className="px-3 py-3"><Badge queue={queue} /></td>
                          <td className="px-3 py-3">
                            <select
                                value={selectedEmail}
                                onChange={(event) => setEmails((current) => ({ ...current, [job.trip.id]: event.target.value }))}
                                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-signal"
                              >
                                <option value="">Select compliant driver</option>
                                {drivers.map((driver) => {
                                  const eligibility = driverEligibleForJob(driver, documentsByDriver.get(driver.id) ?? [], job);
                                  const selectedElsewhere = Object.entries(emails).some(([tripId, email]) => tripId !== job.trip.id && email === driver.email);
                                  const isCurrent = driver.id === job.assignment?.driverId;
                                  const available = isCurrent || (eligibility.eligible && driverCanTake(driver.id, job, allJobs) && !selectedElsewhere);
                                  return <option key={driver.id} value={driver.email} disabled={!available}>{driver.contactName}{available ? "" : ` — ${selectedElsewhere ? "already planned" : eligibility.reason}`}</option>;
                                })}
                              </select>
                          </td>
                          <td className="px-3 py-3">
                            {queue === "ACCEPTED" ? <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-positive">Cleared</span>{selectedEmail !== assigned?.email && <button type="button" disabled={!selectedEmail || busy === job.trip.id} onClick={() => void onAssign(job.trip.id, selectedEmail)} className="rounded-md bg-signal px-2 py-1 text-[9px] font-black uppercase text-signal-foreground disabled:opacity-40">Change driver</button>}</div> : selectedEligibility ? <span className={`text-[10px] font-bold ${selectedEligibility.eligible ? "text-positive" : "text-danger"}`}>{selectedEligibility.reason}</span> : <span className="text-[10px] text-muted-foreground">Choose a driver</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => onAutoPlan(group)} className="min-h-10 rounded-lg border border-border px-4 text-[10px] font-black uppercase hover:border-signal">Auto-plan compliant drivers</button>
                <button type="button" disabled={!planned || bulkBusy === load.id} onClick={() => void onSend(load.id, group)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-signal px-4 text-[10px] font-black uppercase text-signal-foreground disabled:opacity-40"><Send className="size-3.5" />{bulkBusy === load.id ? "Sending offers…" : `Send ${planned} driver ${planned === 1 ? "offer" : "offers"}`}</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ReadinessMetric({ label, value, positive = false, danger = false }: { label: string; value: string; positive?: boolean; danger?: boolean }) {
  return <div className="rounded-lg border border-border bg-background p-2 text-center"><p className={`font-mono text-base font-black ${positive ? "text-positive" : danger ? "text-danger" : "text-foreground"}`}>{value}</p><p className="text-[8px] font-bold uppercase text-muted-foreground">{label}</p></div>;
}

type ColumnProps = {
  passengerCards?: import("react").ReactNode; extraCount?: number;
  queue: Queue; jobs: Job[]; allJobs: Job[]; drivers: OrganisationMember[]; members: OrganisationMember[]; parties: Party[];
  documentsByDriver: Map<string, DriverDocument[]>;
  emails: Record<string, string>; notes: Record<string, string>;
  setEmails: Dispatch<SetStateAction<Record<string, string>>>; setNotes: Dispatch<SetStateAction<Record<string, string>>>;
  busy: string | null; expanded: string | null; setExpanded: Dispatch<SetStateAction<string | null>>;
  driverConflicts: Set<string>; truckConflicts: Set<string>;
  act: (id: string, action: "ASSIGN" | "ACCEPT" | "DECLINE" | "CANCEL", email?: string) => Promise<void>;
};
function QueueColumn(p: ColumnProps) {
  const meta = queues[p.queue];
  return <section className={`min-w-0 rounded-2xl border ${meta.style}`}>
    <div className="flex items-center justify-between border-b border-border/70 p-4"><span><span className="block text-sm font-black">{meta.title}</span><span className="text-[10px] text-muted-foreground">{meta.hint}</span></span><span className="grid size-8 place-items-center rounded-full bg-background font-mono text-sm font-black shadow-sm">{p.jobs.length + (p.extraCount ?? 0)}</span></div>
    <div className="space-y-3 p-3">{p.jobs.map((job) => <JobCard key={job.trip.id} job={job} {...p} />)}{p.passengerCards}{p.jobs.length === 0 && !p.extraCount && <div className="rounded-xl border border-dashed border-border bg-background/50 px-3 py-8 text-center text-xs text-muted-foreground">No jobs in this queue.</div>}</div>
  </section>;
}

function JobCard(p: ColumnProps & { job: Job }) {
  const { job } = p; const { trip, load, truck, assignment } = job;
  const driver = findDriver(assignment?.driverId, p.members, p.parties);
  const selectedEmail = p.emails[trip.id] ?? driver?.email ?? "";
  const selectedDriver = p.drivers.find((candidate) => candidate.email === selectedEmail);
  const selectedEligibility = selectedDriver
    ? driverEligibleForJob(selectedDriver, p.documentsByDriver.get(selectedDriver.id) ?? [], job)
    : null;
  const selectedAvailable = selectedDriver
    ? selectedEligibility?.eligible === true && driverCanTake(selectedDriver.id, job, p.allJobs)
    : false;
  const open = p.expanded === trip.id; const late = +new Date(load.pickupWindow.from) < Date.now() && trip.status === "SCHEDULED";
  return <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <button onClick={() => p.setExpanded(open ? null : trip.id)} className="w-full p-3 text-left">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-mono text-[10px] text-muted-foreground">{load.reference || load.id}</div><div className="mt-1 text-sm font-black">{truck.registration}</div></div><Badge queue={p.queue} /></div>
      <div className="mt-3 space-y-2"><RouteRow label={shortPlace(load.origin.label)} /><RouteRow label={shortPlace(load.destination.label)} end /></div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-[10px]"><Small label="Pickup" value={formatDate(load.pickupWindow.from)} danger={late} /><Small label="Driver" value={driver?.contactName ?? "Unassigned"} /></div>
      {(late || p.driverConflicts.has(trip.id) || p.truckConflicts.has(trip.id)) && <div className="mt-3 flex flex-wrap gap-1">{late && <Warning text="Pickup overdue" />}{p.driverConflicts.has(trip.id) && <Warning text="Driver conflict" />}{p.truckConflicts.has(trip.id) && <Warning text="Truck conflict" />}</div>}
      <div className="mt-3 flex justify-between text-[9px] font-bold uppercase text-muted-foreground"><span>{trip.status.replaceAll("_", " ")}</span><span className="flex items-center gap-1 text-foreground">Manage <ChevronRight className={`size-3 ${open ? "rotate-90" : ""}`} /></span></div>
    </button>
    {open && <div className="space-y-3 border-t border-border bg-background/60 p-3">
      <div className="grid grid-cols-2 gap-2"><SmallBox label="Trip" value={trip.id} /><SmallBox label="Distance" value={`${load.distanceKm.toLocaleString("en-ZA")} km`} /></div>
      {assignment?.note && <p className="rounded-lg bg-steel/30 p-2 text-xs text-muted-foreground">{assignment.note}</p>}
      <>
        <select value={selectedEmail} onChange={(e) => p.setEmails((old) => ({ ...old, [trip.id]: e.target.value }))} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs"><option value="">Select compliant driver</option>{p.drivers.map((candidate) => { const eligibility = driverEligibleForJob(candidate, p.documentsByDriver.get(candidate.id) ?? [], job); const isCurrent = candidate.id === assignment?.driverId; const available = isCurrent || (eligibility.eligible && driverCanTake(candidate.id, job, p.allJobs)); return <option key={candidate.id} value={candidate.email} disabled={!available}>{candidate.contactName}{available ? "" : ` — ${eligibility.eligible ? "schedule conflict" : eligibility.reason}`}</option>; })}</select>
        {selectedEligibility && <p className={`text-[10px] font-semibold ${selectedAvailable ? "text-positive" : "text-danger"}`}>{selectedAvailable ? selectedEligibility.reason : selectedEligibility.eligible ? "Driver has another offer or accepted trip in this time window" : selectedEligibility.reason}</p>}
        <textarea value={p.notes[trip.id] ?? ""} onChange={(e) => p.setNotes((old) => ({ ...old, [trip.id]: e.target.value }))} placeholder="Pickup or route instructions (optional)" className="min-h-20 w-full rounded-lg border border-border bg-background p-3 text-xs outline-none focus:border-signal" />
        <button disabled={p.busy === trip.id || !selectedDriver || (p.queue === "ACCEPTED" && selectedEmail === driver?.email) || (!selectedAvailable && selectedDriver.id !== assignment?.driverId)} onClick={() => void p.act(trip.id, "ASSIGN", selectedEmail)} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-signal text-xs font-black uppercase text-signal-foreground disabled:opacity-40"><Send className="size-3.5" />{assignment ? "Change driver and send" : "Send driver offer"}</button>
        {p.drivers.length === 0 && <p className="text-[10px] text-danger">Add and verify a driver under Organisation first.</p>}
        {p.queue === "ACCEPTED" && <button disabled={p.busy === trip.id} onClick={() => void p.act(trip.id, "CANCEL")} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-danger/40 text-xs font-bold text-danger"><XCircle className="size-4" />Cancel current assignment</button>}
      </>
      {assignment?.timeline?.length ? <div className="border-t border-border pt-2 text-[10px] text-muted-foreground">Latest: {assignment.timeline.at(-1)?.status.replaceAll("_", " ")} · {new Date(assignment.timeline.at(-1)!.at).toLocaleString("en-ZA")}</div> : null}
    </div>}
  </article>;
}

function Schedule({ jobs }: { jobs: Job[] }) {
  const days = Array.from({ length: 7 }, (_, i) => { const start = new Date(); start.setHours(0,0,0,0); start.setDate(start.getDate()+i); const end = new Date(start); end.setDate(end.getDate()+1); return { start, jobs: jobs.filter((j) => +new Date(j.load.pickupWindow.from) >= +start && +new Date(j.load.pickupWindow.from) < +end) }; });
  return <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><div className="flex items-center gap-2 border-b border-border px-4 py-3"><CalendarDays className="size-4 text-signal" /><h2 className="text-sm font-black">Seven-day dispatch plan</h2></div><div className="grid grid-cols-7 divide-x divide-border overflow-x-auto">{days.map((day,i) => <div key={day.start.toISOString()} className="min-w-[88px] p-3 text-center"><div className="text-[9px] font-bold uppercase text-muted-foreground">{i===0 ? "Today" : day.start.toLocaleDateString("en-ZA",{weekday:"short"})}</div><div className="mt-1 font-mono text-lg font-black">{day.start.getDate()}</div><div className="mt-2 flex justify-center gap-1">{day.jobs.slice(0,4).map((j)=><span key={j.trip.id} className={`size-2 rounded-full ${queueFor(j)==="ACCEPTED"?"bg-positive":queueFor(j)==="OFFERED"?"bg-signal":"bg-danger"}`} />)}{!day.jobs.length && <span className="text-[10px] text-muted-foreground">—</span>}</div><div className="mt-1 text-[9px] text-muted-foreground">{day.jobs.length} jobs</div></div>)}</div></section>;
}

function Resources({ drivers, workingDrivers, trucks, usedTrucks }: { drivers: OrganisationMember[]; workingDrivers: Set<string>; trucks: TruckPosting[]; usedTrucks: Set<string> }) {
  return <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><div className="border-b border-border p-4"><div className="flex items-center gap-2"><Users className="size-4 text-signal" /><h2 className="text-sm font-black">Resources</h2></div><p className="mt-1 text-[10px] text-muted-foreground">Current organisation availability</p></div><div className="grid grid-cols-2 divide-x divide-border border-b border-border"><Resource label="Drivers free" value={drivers.filter((d)=>!workingDrivers.has(d.id)).length}/><Resource label="Trucks free" value={trucks.filter((t)=>t.status==="AVAILABLE"&&!usedTrucks.has(t.id)).length}/></div><div className="space-y-2 p-3"><div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Verified drivers</div>{drivers.slice(0,6).map((d)=><div key={d.id} className="flex items-center gap-2 rounded-lg bg-steel/20 p-2"><Avatar party={d} size="sm"/><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold">{d.contactName}</div><div className="text-[9px] text-muted-foreground">{workingDrivers.has(d.id)?"Assigned":"Available"}</div></div><span className={`size-2 rounded-full ${workingDrivers.has(d.id)?"bg-signal":"bg-positive"}`}/></div>)}{!drivers.length&&<p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">No verified drivers.</p>}<div className="grid grid-cols-3 gap-2 pt-2"><Tiny label="Available" value={trucks.filter(t=>t.status==="AVAILABLE").length}/><Tiny label="On trip" value={trucks.filter(t=>t.status==="ON_TRIP").length}/><Tiny label="Reserved" value={trucks.filter(t=>t.status==="RESERVED").length}/></div></div></section>;
}

function Attention({ jobs, driverConflicts, truckConflicts }: { jobs: Job[]; driverConflicts: Set<string>; truckConflicts: Set<string> }) {
  const rows = [{label:"Pickup overdue",value:jobs.filter(j=>j.trip.status==="SCHEDULED"&&+new Date(j.load.pickupWindow.from)<Date.now()).length},{label:"Declined/cancelled",value:jobs.filter(j=>queueFor(j)==="EXCEPTION").length},{label:"Driver conflicts",value:driverConflicts.size},{label:"Truck conflicts",value:truckConflicts.size}];
  return <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center gap-2"><AlertTriangle className="size-4 text-signal"/><h2 className="text-sm font-black">Attention required</h2></div><div className="mt-3 divide-y divide-border">{rows.map(r=><div key={r.label} className="flex justify-between py-2.5 text-xs"><span className="text-muted-foreground">{r.label}</span><span className={`font-mono font-black ${r.value?"text-danger":"text-positive"}`}>{r.value}</span></div>)}</div></section>;
}

function DriverOffers({ jobs, meId, notes, setNotes, busy, act }: { jobs: Job[]; meId: string; notes: Record<string,string>; setNotes: Dispatch<SetStateAction<Record<string,string>>>; busy:string|null; act:(id:string,a:"ASSIGN"|"ACCEPT"|"DECLINE"|"CANCEL")=>Promise<void> }) {
  const mine=jobs.filter(j=>j.assignment?.driverId===meId);
  return <AppShell><PageHeader title="Job Offers"/><main className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">{mine.map(j=><article key={j.trip.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="font-mono text-[10px] text-muted-foreground">{j.load.reference}</div><h2 className="mt-1 font-black">{j.load.origin.label} → {j.load.destination.label}</h2><div className="mt-2 text-xs text-muted-foreground">{j.truck.registration} · {formatDate(j.load.pickupWindow.from)}</div>{j.assignment?.status==="OFFERED"?<div className="mt-4 space-y-3"><p className="text-sm text-muted-foreground">{j.assignment.note||"Review and accept this assignment."}</p><textarea value={notes[j.trip.id]??""} onChange={e=>setNotes(o=>({...o,[j.trip.id]:e.target.value}))} placeholder="Reason required if declining" className="min-h-20 w-full rounded-lg border border-border p-3 text-sm"/><div className="grid grid-cols-2 gap-2"><button disabled={busy===j.trip.id||!(notes[j.trip.id]??"").trim()} onClick={()=>void act(j.trip.id,"DECLINE")} className="min-h-11 rounded-lg border border-danger font-bold text-danger disabled:opacity-40">Decline</button><button disabled={busy===j.trip.id} onClick={()=>void act(j.trip.id,"ACCEPT")} className="rounded-lg bg-positive font-bold text-white">Accept job</button></div></div>:<p className="mt-4 rounded-lg bg-positive/10 p-3 text-sm font-semibold text-positive">Accepted. This job is in My Jobs.</p>}</article>)}{!mine.length&&<div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground lg:col-span-2">No job offers are waiting.</div>}</main></AppShell>;
}

function queueFor(j:Job):Queue { if(j.assignment?.status==="ACCEPTED")return"ACCEPTED";if(j.assignment?.status==="OFFERED")return"OFFERED";if(["DECLINED","CANCELLED"].includes(j.assignment?.status??""))return"EXCEPTION";return"NEEDS_DRIVER"; }
const requiredDriverDocuments = ["DRIVING_LICENCE", "PRDP", "MEDICAL_CERTIFICATE"] as const;
const driverDocumentLabels: Record<(typeof requiredDriverDocuments)[number], string> = {
  DRIVING_LICENCE: "Driving licence",
  PRDP: "PrDP",
  MEDICAL_CERTIFICATE: "Medical certificate",
};
function driverEligibleForJob(driver: OrganisationMember, documents: DriverDocument[], job: Job) {
  if (driver.suspended || driver.verification !== "VERIFIED") return { eligible: false, reason: "Driver is not verified" };
  const deliveryAt = +new Date(job.load.deliveryBy);
  for (const type of requiredDriverDocuments) {
    const document = documents
      .filter((candidate) => candidate.documentType === type)
      .sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt))[0];
    const label = driverDocumentLabels[type];
    if (!document) return { eligible: false, reason: `${label} missing` };
    if (document.reviewStatus && document.reviewStatus !== "APPROVED") return { eligible: false, reason: `${label} awaiting approval` };
    if (document.status === "EXPIRED") return { eligible: false, reason: `${label} expired` };
    if (document.expiresAt && +new Date(document.expiresAt) < deliveryAt) return { eligible: false, reason: `${label} expires before delivery` };
  }
  return { eligible: true, reason: "Documents valid for this trip" };
}
function driverCanTake(driverId: string, target: Job, jobs: Job[]) {
  return !jobs.some((job) => job.trip.id !== target.trip.id
    && job.assignment?.driverId === driverId
    && (job.assignment.status === "OFFERED" || job.assignment.status === "ACCEPTED")
    && +new Date(job.load.pickupWindow.from) <= +new Date(target.load.deliveryBy)
    && +new Date(target.load.pickupWindow.from) <= +new Date(job.load.deliveryBy));
}
function conflicts(jobs:Job[],resource:"driver"|"truck"){const out=new Set<string>();jobs.forEach((a,i)=>{const id=resource==="driver"?a.assignment?.driverId:a.truck.id;if(!id||(resource==="driver"&&a.assignment?.status!=="ACCEPTED"))return;jobs.slice(i+1).forEach(b=>{const bid=resource==="driver"?b.assignment?.driverId:b.truck.id;if(resource==="driver"&&b.assignment?.status!=="ACCEPTED")return;if(id===bid&&+new Date(a.load.pickupWindow.from)<=+new Date(b.load.deliveryBy)&&+new Date(b.load.pickupWindow.from)<=+new Date(a.load.deliveryBy)){out.add(a.trip.id);out.add(b.trip.id);}})});return out;}
function findDriver(id:string|undefined,members:OrganisationMember[],parties:Party[]){return members.find(m=>m.id===id)??parties.find(p=>p.id===id)}
function formatDate(value:string){return new Date(value).toLocaleString("en-ZA",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}
function shortPlace(v:string){return v.split(",").slice(0,2).join(",")}
function Metric({ label, hint, value, icon: Icon, alert = false }: {
  label: string;
  hint: string;
  value: number;
  icon: typeof Route;
  alert?: boolean;
}) {
  return <article className={`rounded-2xl border bg-card p-4 shadow-sm ${alert && value ? "border-danger/40" : "border-border"}`}>
    <div className="flex items-start justify-between gap-2">
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      <Icon className={`size-4 shrink-0 ${alert && value ? "text-danger" : "text-signal"}`} />
    </div>
    <div className="mt-2 font-mono text-2xl font-black">{value}</div>
    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">({hint})</p>
  </article>;
}
function Badge({queue}:{queue:Queue}){const s=queue==="ACCEPTED"?"bg-positive/15 text-positive":queue==="OFFERED"?"bg-signal/20":queue==="EXCEPTION"?"bg-warning/20 text-warning":"bg-danger/10 text-danger";return <span className={`shrink-0 rounded-full px-2 py-1 text-[8px] font-black uppercase ${s}`}>{queue==="ACCEPTED"?"Ready":queue.replaceAll("_"," ")}</span>}
function RouteRow({label,end=false}:{label:string;end?:boolean}){return <div className="flex min-w-0 items-center gap-2"><MapPin className={`size-3 shrink-0 ${end?"text-foreground":"text-signal"}`}/><span className="truncate text-[11px] text-muted-foreground">{label}</span></div>}
function Small({label,value,danger=false}:{label:string;value:string;danger?:boolean}){return <div><div className="uppercase text-muted-foreground">{label}</div><div className={`mt-0.5 truncate font-bold ${danger?"text-danger":""}`}>{value}</div></div>}
function Warning({text}:{text:string}){return <span className="rounded-full bg-danger/10 px-2 py-1 text-[8px] font-bold uppercase text-danger">{text}</span>}
function SmallBox({label,value}:{label:string;value:string}){return <div className="rounded-lg bg-steel/25 p-2"><div className="text-[8px] font-bold uppercase text-muted-foreground">{label}</div><div className="mt-1 truncate font-mono text-[10px] font-bold">{value}</div></div>}
function Resource({label,value}:{label:string;value:number}){return <div className="p-3 text-center"><div className="font-mono text-xl font-black">{value}</div><div className="text-[9px] uppercase text-muted-foreground">{label}</div></div>}
function Tiny({label,value}:{label:string;value:number}){return <div className="rounded-lg bg-steel/25 p-2"><div className="font-mono text-sm font-black">{value}</div><div className="text-[8px] uppercase text-muted-foreground">{label}</div></div>}
