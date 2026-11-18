
import { AlertTriangle, ArrowRight, CalendarRange, CheckCircle2, ClipboardCheck, Coins, Fuel, Plus, ShieldCheck, TrendingUp, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { BodyTypeIcon } from "@/components/tamp/BodyTypeIcon";
import { formatMoney } from "@/lib/tamp-data";
import { assessFleetCompliance } from "@/lib/fleet-compliance";
import { useTamp } from "@/context/TampContext";
import { Link } from "@/lib/nav";
import type { MaintenanceKind } from "@/types/domain";

const KINDS: { value: MaintenanceKind; label: string }[] = [
  { value: "SERVICE", label: "Service" },
  { value: "INSPECTION", label: "Inspection" },
  { value: "TYRES", label: "Tyres" },
  { value: "REPAIR", label: "Repair" },
  { value: "LICENCE", label: "Licence renewal" },
  { value: "OTHER", label: "Other" },
];

const input =
  "w-full rounded-md border border-border bg-graphite px-3 py-2 text-sm outline-none focus:border-signal";

const dayISO = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10);

function FleetOpsPage() {
  const store = useTamp();
  const { trucks, vehicles, fuelLogs, maintenance, addFuelLog, addMaintenance, completeMaintenance } = store;
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab = (["availability", "compliance", "inspections", "maintenance", "fuel", "costs"].includes(requestedTab ?? "")
    ? requestedTab
    : "availability") as "availability" | "compliance" | "inspections" | "maintenance" | "fuel" | "costs";
  const [tab, setTab] = useState(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  const TABS = [
    { key: "availability" as const, label: "Availability", icon: CalendarRange },
    { key: "compliance" as const, label: "Compliance", icon: ShieldCheck },
    { key: "inspections" as const, label: "Inspections", icon: ClipboardCheck },
    { key: "maintenance" as const, label: "Maintenance", icon: Wrench },
    { key: "fuel" as const, label: "Fuel", icon: Fuel },
    { key: "costs" as const, label: "Profitability", icon: TrendingUp },
  ];

  return (
    <AppShell>
      <PageHeader title="Fleet Management" />

      <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:px-8">
        {trucks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-graphite/40 p-10 text-center text-sm text-muted-foreground">
            Add a truck first to track its licensing, maintenance and fuel.
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-graphite p-1 text-sm font-semibold">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 ${
                    tab === key ? "bg-signal text-signal-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>

            {tab === "compliance" && (
              <ComplianceTab trucks={trucks} vehicles={vehicles} maintenance={maintenance} />
            )}
            {tab === "availability" && (
              <AvailabilityTab
                trucks={trucks}
                trips={store.trips}
                matches={store.matches}
                onUpdate={store.updateTruck}
              />
            )}
            {tab === "inspections" && (
              <InspectionsTab trucks={trucks} tasks={maintenance} onAdd={addMaintenance} />
            )}
            {tab === "maintenance" && (
              <MaintenanceTab
                trucks={trucks}
                tasks={maintenance}
                onAdd={addMaintenance}
                onComplete={completeMaintenance}
              />
            )}
            {tab === "fuel" && <FuelTab trucks={trucks} logs={fuelLogs} onAdd={addFuelLog} />}
            {tab === "costs" && (
              <CostsTab
                trucks={trucks}
                tasks={maintenance}
                logs={fuelLogs}
                trips={store.trips}
                matches={store.matches}
                loads={store.loads}
                invoices={store.invoices}
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

// ---- Availability planning ------------------------------------------------

function AvailabilityTab({
  trucks,
  trips,
  matches,
  onUpdate,
}: {
  trucks: ReturnType<typeof useTamp>["trucks"];
  trips: ReturnType<typeof useTamp>["trips"];
  matches: ReturnType<typeof useTamp>["matches"];
  onUpdate: ReturnType<typeof useTamp>["updateTruck"];
}) {
  const days = useMemo(
    () => Array.from({ length: 14 }, (_, index) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() + index);
      return date;
    }),
    [],
  );
  const activeTruckIds = useMemo(() => {
    const activeMatchIds = new Set(
      trips.filter((trip) => !["COMPLETED", "CANCELLED"].includes(trip.status)).map((trip) => trip.matchId),
    );
    return new Set(
      matches.filter((match) => activeMatchIds.has(match.id)).map((match) => match.truckPostingId),
    );
  }, [matches, trips]);

  const stateFor = (truck: (typeof trucks)[number], date: Date) => {
    if (activeTruckIds.has(truck.id) || ["RESERVED", "ON_TRIP"].includes(truck.status)) return "BOOKED";
    if (["OFFLINE", "EXPIRED"].includes(truck.status)) return "OFFLINE";
    if (truck.alwaysAvailable) return "AVAILABLE";
    const time = date.getTime();
    return time >= new Date(truck.availableFrom).getTime() && time <= new Date(truck.availableTo).getTime()
      ? "AVAILABLE"
      : "UNAVAILABLE";
  };

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-4">
      <Stat label="Available now" value={String(trucks.filter((truck) => truck.status === "AVAILABLE").length)} />
      <Stat label="Always available" value={String(trucks.filter((truck) => truck.alwaysAvailable).length)} />
      <Stat label="Committed" value={String(trucks.filter((truck) => activeTruckIds.has(truck.id)).length)} />
      <Stat label="Offline" value={String(trucks.filter((truck) => ["OFFLINE", "EXPIRED"].includes(truck.status)).length)} />
    </div>
    <div className="rounded-xl border border-border bg-graphite/40 p-4">
      <h2 className="font-bold">14-day fleet availability</h2>
      <p className="mt-1 text-xs text-muted-foreground">Matching uses these availability windows. Committed vehicles remain protected from new work.</p>
    </div>
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="min-w-[1050px] w-full text-xs">
        <thead><tr className="border-b border-border bg-graphite/60"><th className="sticky left-0 z-10 bg-graphite px-4 py-3 text-left">Vehicle</th>{days.map((day) => <th key={day.toISOString()} className="min-w-14 px-2 py-3 text-center"><span className="block text-[9px] uppercase text-muted-foreground">{day.toLocaleDateString("en-ZA", { weekday: "short" })}</span>{day.getDate()}</th>)}<th className="px-3 py-3 text-right">Action</th></tr></thead>
        <tbody className="divide-y divide-border">{trucks.map((truck) => <tr key={truck.id}><td className="sticky left-0 z-10 bg-background px-4 py-3"><span className="font-mono font-bold">{truck.registration}</span><span className="block text-[10px] text-muted-foreground">{truck.alwaysAvailable ? "Always available" : `${new Date(truck.availableFrom).toLocaleDateString("en-ZA")} – ${new Date(truck.availableTo).toLocaleDateString("en-ZA")}`}</span></td>{days.map((day) => { const state = stateFor(truck, day); return <td key={day.toISOString()} className="px-1 py-3"><span title={state.toLowerCase()} className={`mx-auto block h-7 w-7 rounded-md border ${state === "AVAILABLE" ? "border-positive/40 bg-positive/20" : state === "BOOKED" ? "border-signal/50 bg-signal/30" : state === "OFFLINE" ? "border-danger/40 bg-danger/15" : "border-border bg-steel/30"}`} /></td>; })}<td className="px-3 py-3 text-right"><button disabled={activeTruckIds.has(truck.id)} onClick={() => void onUpdate(truck.id, truck.status === "OFFLINE" ? { status: "AVAILABLE" } : { availableTo: new Date(new Date(truck.availableTo).getTime() + 7 * 864e5).toISOString() })} className="rounded-md border border-border px-2.5 py-1.5 text-[10px] font-bold uppercase hover:border-signal disabled:opacity-40">{truck.status === "OFFLINE" ? "Set available" : "+7 days"}</button></td></tr>)}</tbody>
      </table>
    </div>
    <div className="flex flex-wrap gap-4 text-[10px] uppercase tracking-wide text-muted-foreground"><Legend tone="bg-positive/20 border-positive/40" label="Available" /><Legend tone="bg-signal/30 border-signal/50" label="Committed" /><Legend tone="bg-danger/15 border-danger/40" label="Offline" /><Legend tone="bg-steel/30 border-border" label="Outside window" /></div>
  </div>;
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`size-3 rounded border ${tone}`} />{label}</span>;
}

// ---- Inspections and defects ---------------------------------------------

function InspectionsTab({ trucks, tasks, onAdd }: {
  trucks: ReturnType<typeof useTamp>["trucks"];
  tasks: ReturnType<typeof useTamp>["maintenance"];
  onAdd: ReturnType<typeof useTamp>["addMaintenance"];
}) {
  const checks = ["Tyres and wheels", "Brakes", "Lights and indicators", "Fluid leaks", "Load restraints", "Mirrors and windscreen"] as const;
  const [form, setForm] = useState({ truckId: trucks[0]?.id ?? "", odometer: "", note: "", failed: [] as string[] });
  const inspections = tasks.filter((task) => task.kind === "INSPECTION").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const defects = tasks.filter((task) => task.kind === "REPAIR" && task.status === "SCHEDULED");
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.truckId) return;
    const failed = form.failed;
    const detail = [`Odometer: ${form.odometer || "not captured"}`, failed.length ? `Failed: ${failed.join(", ")}` : "All checks passed", form.note].filter(Boolean).join(" · ");
    onAdd({ truckId: form.truckId, kind: "INSPECTION", title: failed.length ? "Pre-trip inspection — defects found" : "Pre-trip inspection — passed", dueDate: new Date().toISOString(), note: detail, completed: true });
    if (failed.length) onAdd({ truckId: form.truckId, kind: "REPAIR", title: `Resolve inspection defects (${failed.length})`, dueDate: new Date(Date.now() + 864e5).toISOString(), note: `${failed.join(", ")}${form.note ? ` · ${form.note}` : ""}` });
    setForm({ ...form, odometer: "", note: "", failed: [] });
  };
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.7fr)]">
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-graphite/40 p-4"><div><h2 className="font-bold">Record a vehicle inspection</h2><p className="mt-1 text-xs text-muted-foreground">Mark any failed check. Failed inspections automatically open a repair item.</p></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Vehicle"><select value={form.truckId} onChange={(event) => setForm({ ...form, truckId: event.target.value })} className={input}>{trucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.registration}</option>)}</select></Field><Field label="Odometer"><input type="number" min={0} value={form.odometer} onChange={(event) => setForm({ ...form, odometer: event.target.value })} className={input} /></Field></div><div className="grid gap-2 sm:grid-cols-2">{checks.map((check) => { const failed = form.failed.includes(check); return <button type="button" key={check} onClick={() => setForm({ ...form, failed: failed ? form.failed.filter((item) => item !== check) : [...form.failed, check] })} className={`flex items-center justify-between rounded-lg border px-3 py-3 text-left text-xs font-semibold ${failed ? "border-danger/50 bg-danger/10 text-danger" : "border-positive/40 bg-positive/5"}`}><span>{check}</span><span className="text-[9px] uppercase">{failed ? "Defect" : "Pass"}</span></button>; })}</div><Field label="Inspector notes"><textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} rows={3} className={input} placeholder="Damage, tyre position, warning light or follow-up instructions" /></Field><button type="submit" className="w-full rounded-lg bg-signal py-3 text-xs font-black uppercase text-signal-foreground">Save inspection</button></form>
    <div className="space-y-4"><div className="grid grid-cols-2 gap-3"><Stat label="Inspections" value={String(inspections.length)} /><Stat label="Open defects" value={String(defects.length)} /></div><section className="rounded-xl border border-border"><h3 className="border-b border-border px-4 py-3 text-xs font-bold uppercase tracking-wide">Recent inspections</h3><div className="divide-y divide-border">{inspections.slice(0, 8).map((task) => <div key={task.id} className="p-3"><div className="flex items-center justify-between gap-2"><span className="font-mono text-xs font-bold">{trucks.find((truck) => truck.id === task.truckId)?.registration}</span><span className={`text-[9px] font-bold uppercase ${task.title.includes("passed") ? "text-positive" : "text-danger"}`}>{task.title.includes("passed") ? "Passed" : "Defects"}</span></div><p className="mt-1 text-[11px] text-muted-foreground">{task.note}</p><p className="mt-1 text-[10px] text-muted-foreground">{new Date(task.completedAt ?? task.createdAt).toLocaleString("en-ZA")}</p></div>)}{inspections.length === 0 && <p className="p-6 text-center text-xs text-muted-foreground">No inspections recorded yet.</p>}</div></section></div>
  </div>;
}

// ---- Maintenance ----------------------------------------------------------

function MaintenanceTab({
  trucks,
  tasks,
  onAdd,
  onComplete,
}: {
  trucks: ReturnType<typeof useTamp>["trucks"];
  tasks: ReturnType<typeof useTamp>["maintenance"];
  onAdd: ReturnType<typeof useTamp>["addMaintenance"];
  onComplete: ReturnType<typeof useTamp>["completeMaintenance"];
}) {
  const [adding, setAdding] = useState(false);
  const [filterTruck, setFilterTruck] = useState<string>("all");
  const [form, setForm] = useState({
    truckId: trucks[0]?.id ?? "",
    kind: "SERVICE" as MaintenanceKind,
    title: "",
    dueDate: dayISO(30),
    amount: "",
    note: "",
  });

  const now = Date.now();
  const reg = new Map(trucks.map((t) => [t.id, t]));
  const inScope = useMemo(
    () => (filterTruck === "all" ? tasks : tasks.filter((t) => t.truckId === filterTruck)),
    [tasks, filterTruck],
  );
  const scheduled = inScope
    .filter((t) => t.status === "SCHEDULED")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  // Service history — completed tasks, most recently completed first.
  const history = inScope
    .filter((t) => t.status === "DONE")
    .sort(
      (a, b) =>
        new Date(b.completedAt ?? b.dueDate).getTime() -
        new Date(a.completedAt ?? a.dueDate).getTime(),
    );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.truckId) return;
    onAdd({
      truckId: form.truckId,
      kind: form.kind,
      title: form.title.trim(),
      dueDate: new Date(form.dueDate).toISOString(),
      amount: form.amount ? Number(form.amount) : undefined,
      note: form.note.trim() || undefined,
    });
    setForm({ ...form, title: "", amount: "", note: "" });
    setAdding(false);
  };

  const row = (m: (typeof tasks)[number]) => {
    const truck = reg.get(m.truckId);
    const due = new Date(m.dueDate).getTime();
    const overdue = m.status === "SCHEDULED" && due < now;
    const dueSoon = m.status === "SCHEDULED" && !overdue && due <= now + 7 * 864e5;
    return (
      <li
        key={m.id}
        className={`flex items-center gap-3 rounded-xl border p-3 ${
          overdue ? "border-danger/50 bg-danger/5" : "border-border bg-graphite"
        }`}
      >
        {truck && <BodyTypeIcon type={truck.bodyType} className="size-5 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold">{m.title}</span>
            {overdue && (
              <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-danger">
                Overdue
              </span>
            )}
            {dueSoon && (
              <span className="rounded bg-signal/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-signal-foreground">
                Due soon
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {truck?.registration ?? m.truckId} ·{" "}
            {KINDS.find((k) => k.value === m.kind)?.label ?? m.kind} ·{" "}
            {m.status === "DONE"
              ? `done ${new Date(m.completedAt ?? m.dueDate).toLocaleDateString("en-ZA")}`
              : `due ${new Date(m.dueDate).toLocaleDateString("en-ZA")}`}
            {m.cost ? ` · ${formatMoney(m.cost)}` : ""}
          </div>
        </div>
        {m.status === "SCHEDULED" && (
          <button
            onClick={() => onComplete(m.id)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-positive hover:bg-positive/10"
          >
            <CheckCircle2 className="size-3.5" /> Done
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Maintenance schedule
        </h2>
        <button
          onClick={() => setAdding((a) => !a)}
          className="inline-flex items-center gap-1.5 rounded-md bg-signal px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-signal-foreground hover:brightness-105"
        >
          <Plus className="size-3.5" /> {adding ? "Cancel" : "Add task"}
        </button>
      </div>

      {adding && (
        <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border bg-graphite/60 p-4 sm:grid-cols-2">
          <Field label="Truck">
            <select
              value={form.truckId}
              onChange={(e) => setForm({ ...form, truckId: e.target.value })}
              className={input}
            >
              {trucks.map((t) => (
                <option key={t.id} value={t.id} className="bg-graphite">
                  {t.registration}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as MaintenanceKind })}
              className={input}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value} className="bg-graphite">
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Task">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. 15 000 km service"
              className={input}
            />
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className={input}
            />
          </Field>
          <Field label="Cost (R, optional)">
            <input
              type="number"
              min={0}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className={input}
            />
          </Field>
          <div className="sm:col-span-2">
            <button type="submit" className="w-full rounded-md bg-signal py-2 text-sm font-bold uppercase tracking-wide text-signal-foreground hover:brightness-105">
              Schedule task
            </button>
          </div>
        </form>
      )}

      {/* Per-vehicle filter */}
      {trucks.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Vehicle
          </span>
          <select
            value={filterTruck}
            onChange={(e) => setFilterTruck(e.target.value)}
            className="rounded-md border border-border bg-graphite px-3 py-1.5 text-xs outline-none focus:border-signal"
          >
            <option value="all" className="bg-graphite">
              All vehicles
            </option>
            {trucks.map((t) => (
              <option key={t.id} value={t.id} className="bg-graphite">
                {t.registration}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Scheduled ({scheduled.length})
        </h3>
        {scheduled.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nothing scheduled.
          </p>
        ) : (
          <ul className="space-y-2">{scheduled.map(row)}</ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Service history ({history.length})
        </h3>
        {history.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No completed services yet.
          </p>
        ) : (
          <ul className="space-y-2">{history.map(row)}</ul>
        )}
      </div>
    </div>
  );
}

// ---- Fuel -----------------------------------------------------------------

function FuelTab({
  trucks,
  logs,
  onAdd,
}: {
  trucks: ReturnType<typeof useTamp>["trucks"];
  logs: ReturnType<typeof useTamp>["fuelLogs"];
  onAdd: ReturnType<typeof useTamp>["addFuelLog"];
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    truckId: trucks[0]?.id ?? "",
    litres: 0,
    amount: 0,
    odometerKm: "",
    station: "",
    filledAt: dayISO(),
    note: "",
  });

  const totals = useMemo(() => {
    const litres = logs.reduce((s, f) => s + f.litres, 0);
    const spend = logs.reduce((s, f) => s + f.cost.amount, 0);
    return { litres, spend, perL: litres ? spend / litres : 0 };
  }, [logs]);

  const reg = new Map(trucks.map((t) => [t.id, t]));
  const sorted = [...logs].sort(
    (a, b) => new Date(b.filledAt).getTime() - new Date(a.filledAt).getTime(),
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.truckId || form.litres <= 0 || form.amount <= 0) return;
    onAdd({
      truckId: form.truckId,
      litres: form.litres,
      amount: form.amount,
      odometerKm: form.odometerKm ? Number(form.odometerKm) : undefined,
      station: form.station.trim() || undefined,
      note: form.note.trim() || undefined,
      filledAt: new Date(form.filledAt).toISOString(),
    });
    setForm({ ...form, litres: 0, amount: 0, odometerKm: "", station: "", note: "" });
    setAdding(false);
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total spend" value={formatMoney({ amount: totals.spend, currency: "ZAR", vat: "incl" })} />
        <Stat label="Total litres" value={`${totals.litres.toLocaleString("en-ZA")} L`} />
        <Stat label="Avg R / litre" value={totals.perL ? `R ${totals.perL.toFixed(2)}` : "—"} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Fuel log</h2>
        <button
          onClick={() => setAdding((a) => !a)}
          className="inline-flex items-center gap-1.5 rounded-md bg-signal px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-signal-foreground hover:brightness-105"
        >
          <Plus className="size-3.5" /> {adding ? "Cancel" : "Log fill-up"}
        </button>
      </div>

      {adding && (
        <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border bg-graphite/60 p-4 sm:grid-cols-2">
          <Field label="Truck">
            <select
              value={form.truckId}
              onChange={(e) => setForm({ ...form, truckId: e.target.value })}
              className={input}
            >
              {trucks.map((t) => (
                <option key={t.id} value={t.id} className="bg-graphite">
                  {t.registration}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input
              type="date"
              value={form.filledAt}
              onChange={(e) => setForm({ ...form, filledAt: e.target.value })}
              className={input}
            />
          </Field>
          <Field label="Litres">
            <input
              type="number"
              min={0}
              value={form.litres || ""}
              onChange={(e) => setForm({ ...form, litres: Number(e.target.value) })}
              className={input}
            />
          </Field>
          <Field label="Total cost (R)">
            <input
              type="number"
              min={0}
              value={form.amount || ""}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              className={input}
            />
          </Field>
          <Field label="Odometer (km, optional)">
            <input
              type="number"
              min={0}
              value={form.odometerKm}
              onChange={(e) => setForm({ ...form, odometerKm: e.target.value })}
              className={input}
            />
          </Field>
          <Field label="Station (optional)">
            <input
              value={form.station}
              onChange={(e) => setForm({ ...form, station: e.target.value })}
              className={input}
            />
          </Field>
          <div className="sm:col-span-2">
            <button type="submit" className="w-full rounded-md bg-signal py-2 text-sm font-bold uppercase tracking-wide text-signal-foreground hover:brightness-105">
              Save fill-up
            </button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No fuel logged yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[540px] text-sm">
            <thead>
              <tr className="border-b border-border bg-graphite/60 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-2.5">Date</th>
                <th className="px-3 py-2.5">Truck</th>
                <th className="px-3 py-2.5 text-right">Litres</th>
                <th className="px-3 py-2.5 text-right">Cost</th>
                <th className="px-3 py-2.5 text-right">R/L</th>
                <th className="px-3 py-2.5 text-right">Odo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-2.5">{new Date(f.filledAt).toLocaleDateString("en-ZA")}</td>
                  <td className="px-3 py-2.5 font-mono">{reg.get(f.truckId)?.registration ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{f.litres}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatMoney(f.cost)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    R {(f.cost.amount / f.litres).toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                    {f.odometerKm ? f.odometerKm.toLocaleString("en-ZA") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- Compliance -----------------------------------------------------------

function ComplianceTab({
  trucks,
  vehicles,
  maintenance,
}: {
  trucks: ReturnType<typeof useTamp>["trucks"];
  vehicles: ReturnType<typeof useTamp>["vehicles"];
  maintenance: ReturnType<typeof useTamp>["maintenance"];
}) {
  const now = Date.now();
  const reports = trucks.map((truck) => ({
    truck,
    report: assessFleetCompliance(
      truck,
      vehicles.find((vehicle) => vehicle.id === truck.vehicleId),
      maintenance,
      now,
    ),
  }));
  const compliant = reports.filter(({ report }) => report.level === "COMPLIANT").length;
  const dueSoon = reports.filter(({ report }) => report.level === "DUE_SOON").length;
  const blocked = reports.filter(({ report }) => report.level === "ACTION_REQUIRED").length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Road ready" value={String(compliant)} />
        <Stat label="Due soon" value={String(dueSoon)} />
        <Stat label="Action required" value={String(blocked)} />
      </div>
      <div className="rounded-xl border border-border bg-graphite/40 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold">Fleet compliance centre</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Vehicles need a valid licence, all three documents, completed verification and no
              overdue maintenance before they can be recommended for work.
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Renewal monitoring automatically raises organisation-only alerts for vehicle
              licences and driver licence, PrDP and medical-document expiry.
            </p>
          </div>
          <Link
            to="/transporter/drivers"
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-wide hover:border-signal hover:text-signal"
          >
            Driver compliance <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border bg-graphite/60 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <th className="px-4 py-2.5">Vehicle</th>
              <th className="px-3 py-2.5">Licence expiry</th>
              <th className="px-3 py-2.5">Documents</th>
              <th className="px-3 py-2.5">Score</th>
              <th className="px-3 py-2.5">Compliance status</th>
              <th className="px-3 py-2.5 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {reports.map(({ truck: t, report }) => {
              const vehicle = vehicles.find((item) => item.id === t.vehicleId);
              const docs = vehicle?.documents ?? t.documents ?? [];
              return (
                <tr key={t.id} className="transition-colors hover:bg-steel/20">
                  <td className="px-4 py-2.5">
                    <Link to="/trucks/$truckId" params={{ truckId: t.id }} className="flex items-center gap-2 hover:text-signal">
                      <BodyTypeIcon type={t.bodyType} className="size-5 text-muted-foreground" />
                      <span><span className="block font-mono font-semibold">{t.registration}</span><span className="block text-[10px] text-muted-foreground">{[vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || t.bodyType.replaceAll("_", " ")}</span></span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs">
                      {t.licenceExpiry
                        ? new Date(t.licenceExpiry).toLocaleDateString("en-ZA")
                        : "Not provided"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono">{docs.length}/3</td>
                  <td className="px-3 py-2.5 font-mono font-bold">{report.score}%</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      {report.level === "COMPLIANT" ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-positive" />
                      ) : (
                        <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${report.level === "ACTION_REQUIRED" ? "text-danger" : "text-signal"}`} />
                      )}
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wide">
                          {report.level.replaceAll("_", " ")}
                        </div>
                        {[...report.blockers, ...report.warnings].map((message) => (
                          <div key={message} className="text-[11px] text-muted-foreground">{message}</div>
                        ))}
                        {report.level === "COMPLIANT" && (
                          <div className="text-[11px] text-muted-foreground">Eligible for matching and dispatch</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link to="/trucks/$truckId" params={{ truckId: t.id }} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide hover:border-signal hover:text-signal">
                      Open truck <ArrowRight className="size-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Open a truck to review its complete specification, photographs, documents, assignments and service history.
      </p>
    </div>
  );
}

// ---- Cost per vehicle -----------------------------------------------------

function CostsTab({
  trucks,
  tasks,
  logs,
  trips,
  matches,
  loads,
  invoices,
}: {
  trucks: ReturnType<typeof useTamp>["trucks"];
  tasks: ReturnType<typeof useTamp>["maintenance"];
  logs: ReturnType<typeof useTamp>["fuelLogs"];
  trips: ReturnType<typeof useTamp>["trips"];
  matches: ReturnType<typeof useTamp>["matches"];
  loads: ReturnType<typeof useTamp>["loads"];
  invoices: ReturnType<typeof useTamp>["invoices"];
}) {
  const rows = trucks.map((t) => {
    const maint = tasks
      .filter((m) => m.truckId === t.id)
      .reduce((s, m) => s + (m.cost?.amount ?? 0), 0);
    const fuel = logs.filter((f) => f.truckId === t.id).reduce((s, f) => s + f.cost.amount, 0);
    const truckMatches = matches.filter((match) => match.truckPostingId === t.id);
    const matchIds = new Set(truckMatches.map((match) => match.id));
    const truckTrips = trips.filter((trip) => matchIds.has(trip.matchId));
    const tripIds = new Set(truckTrips.map((trip) => trip.id));
    const truckInvoices = invoices.filter((invoice) => tripIds.has(invoice.tripId) && invoice.status !== "VOID");
    const revenue = truckInvoices.reduce((sum, invoice) => sum + invoice.carrierPayout, 0);
    const paid = truckInvoices
      .filter((invoice) => invoice.payoutStatus === "PAID")
      .reduce((sum, invoice) => sum + invoice.carrierPayout, 0);
    const loadIds = new Set(truckMatches.map((match) => match.loadId));
    const distanceKm = loads
      .filter((load) => loadIds.has(load.id))
      .reduce((sum, load) => sum + (load.distanceKm ?? 0), 0);
    const total = maint + fuel;
    const profit = revenue - total;
    return {
      truck: t,
      maint,
      fuel,
      total,
      revenue,
      paid,
      profit,
      margin: revenue > 0 ? (profit / revenue) * 100 : 0,
      tripCount: truckTrips.length,
      distanceKm,
    };
  });
  const money = (n: number) => formatMoney({ amount: n, currency: "ZAR", vat: "incl" });
  const grand = rows.reduce(
    (a, r) => ({
      maint: a.maint + r.maint,
      fuel: a.fuel + r.fuel,
      total: a.total + r.total,
      revenue: a.revenue + r.revenue,
      paid: a.paid + r.paid,
      profit: a.profit + r.profit,
    }),
    { maint: 0, fuel: 0, total: 0, revenue: 0, paid: 0, profit: 0 },
  );
  const fleetMargin = grand.revenue > 0 ? (grand.profit / grand.revenue) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Carrier revenue" value={money(grand.revenue)} />
        <Stat label="Operating costs" value={money(grand.total)} />
        <Stat label="Net contribution" value={money(grand.profit)} />
        <Stat label="Fleet margin" value={`${fleetMargin.toFixed(1)}%`} />
      </div>
      <div className="rounded-xl border border-border bg-graphite/40 p-4">
        <h2 className="font-bold">Vehicle profitability</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Compares carrier payouts with recorded fuel and maintenance costs. Pending payouts remain
          part of earned revenue and are shown separately from paid amounts.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border bg-graphite/60 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <th className="px-4 py-2.5">Vehicle</th>
              <th className="px-3 py-2.5 text-right">Trips</th>
              <th className="px-3 py-2.5 text-right">Revenue</th>
              <th className="px-3 py-2.5 text-right">Maintenance</th>
              <th className="px-3 py-2.5 text-right">Fuel</th>
              <th className="px-3 py-2.5 text-right">Net</th>
              <th className="px-3 py-2.5 text-right">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.truck.id}>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <BodyTypeIcon type={r.truck.bodyType} className="size-5 text-muted-foreground" />
                    <span className="font-mono font-semibold">{r.truck.registration}</span>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono">
                  {r.tripCount}<span className="block text-[9px] text-muted-foreground">{r.distanceKm.toFixed(0)} km</span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono">
                  {money(r.revenue)}<span className="block text-[9px] text-muted-foreground">Paid {money(r.paid)}</span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono">{money(r.maint)}</td>
                <td className="px-3 py-2.5 text-right font-mono">{money(r.fuel)}</td>
                <td className={`px-3 py-2.5 text-right font-mono font-bold ${r.profit < 0 ? "text-danger" : "text-positive"}`}>{money(r.profit)}</td>
                <td className="px-3 py-2.5 text-right font-mono font-bold">{r.revenue ? `${r.margin.toFixed(1)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-graphite/40 font-bold">
              <td className="px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                Fleet total
              </td>
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5 text-right font-mono">{money(grand.revenue)}</td>
              <td className="px-3 py-2.5 text-right font-mono">{money(grand.maint)}</td>
              <td className="px-3 py-2.5 text-right font-mono">{money(grand.fuel)}</td>
              <td className="px-3 py-2.5 text-right font-mono">{money(grand.profit)}</td>
              <td className="px-3 py-2.5 text-right font-mono">{grand.revenue ? `${fleetMargin.toFixed(1)}%` : "—"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Profitability is only as complete as the fuel and maintenance records entered by your team.
        Invoice payouts are linked to the matched truck and trip.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-graphite p-3">
      <div className="font-mono text-lg font-bold">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

export default FleetOpsPage;
