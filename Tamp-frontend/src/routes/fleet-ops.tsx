"use client";

import { CheckCircle2, Coins, Fuel, Plus, ScrollText, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { BodyTypeIcon } from "@/components/tamp/BodyTypeIcon";
import { formatMoney } from "@/lib/tamp-data";
import { useTamp } from "@/lib/tamp-store";
import type { MaintenanceKind } from "@/lib/tamp-types";

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
  const { trucks, fuelLogs, maintenance, addFuelLog, addMaintenance, completeMaintenance } =
    useTamp();
  const updateTruck = useTamp().updateTruck;
  const [tab, setTab] = useState<"maintenance" | "fuel" | "licensing" | "costs">("maintenance");

  const TABS = [
    { key: "maintenance" as const, label: "Maintenance", icon: Wrench },
    { key: "fuel" as const, label: "Fuel", icon: Fuel },
    { key: "licensing" as const, label: "Licensing", icon: ScrollText },
    { key: "costs" as const, label: "Costs / vehicle", icon: Coins },
  ];

  return (
    <AppShell>
      <PageHeader title="Fleet Costs" />

      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
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

            {tab === "maintenance" && (
              <MaintenanceTab
                trucks={trucks}
                tasks={maintenance}
                onAdd={addMaintenance}
                onComplete={completeMaintenance}
              />
            )}
            {tab === "fuel" && <FuelTab trucks={trucks} logs={fuelLogs} onAdd={addFuelLog} />}
            {tab === "licensing" && <LicensingTab trucks={trucks} onSet={updateTruck} />}
            {tab === "costs" && (
              <CostsTab trucks={trucks} tasks={maintenance} logs={fuelLogs} />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
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

// ---- Licensing ------------------------------------------------------------

function LicensingTab({
  trucks,
  onSet,
}: {
  trucks: ReturnType<typeof useTamp>["trucks"];
  onSet: ReturnType<typeof useTamp>["updateTruck"];
}) {
  const now = Date.now();
  const soon = now + 30 * 864e5;
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Vehicle licensing
      </h2>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border bg-graphite/60 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <th className="px-4 py-2.5">Vehicle</th>
              <th className="px-3 py-2.5">Licence expiry</th>
              <th className="px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {trucks.map((t) => {
              const exp = t.licenceExpiry ? new Date(t.licenceExpiry).getTime() : null;
              const expired = exp !== null && exp < now;
              const expiring = exp !== null && !expired && exp <= soon;
              return (
                <tr key={t.id}>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <BodyTypeIcon type={t.bodyType} className="size-5 text-muted-foreground" />
                      <span className="font-mono font-semibold">{t.registration}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="date"
                      value={t.licenceExpiry ? t.licenceExpiry.slice(0, 10) : ""}
                      onChange={(e) =>
                        onSet(t.id, {
                          licenceExpiry: e.target.value
                            ? new Date(e.target.value).toISOString()
                            : undefined,
                        })
                      }
                      className="rounded-md border border-border bg-graphite px-2 py-1 text-xs outline-none focus:border-signal"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    {exp === null ? (
                      <span className="text-[11px] text-muted-foreground">Not set</span>
                    ) : expired ? (
                      <span className="rounded bg-danger/15 px-2 py-0.5 text-[10px] font-bold uppercase text-danger">
                        Expired
                      </span>
                    ) : expiring ? (
                      <span className="rounded bg-signal/20 px-2 py-0.5 text-[10px] font-bold uppercase text-signal-foreground">
                        Expiring soon
                      </span>
                    ) : (
                      <span className="rounded bg-positive/15 px-2 py-0.5 text-[10px] font-bold uppercase text-positive">
                        Valid
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Set each vehicle&apos;s licence-disc expiry — you&apos;ll get renewal reminders in
        Notifications when a disc is expiring within 30 days or has expired.
      </p>
    </div>
  );
}

// ---- Cost per vehicle -----------------------------------------------------

function CostsTab({
  trucks,
  tasks,
  logs,
}: {
  trucks: ReturnType<typeof useTamp>["trucks"];
  tasks: ReturnType<typeof useTamp>["maintenance"];
  logs: ReturnType<typeof useTamp>["fuelLogs"];
}) {
  const rows = trucks.map((t) => {
    const maint = tasks
      .filter((m) => m.truckId === t.id)
      .reduce((s, m) => s + (m.cost?.amount ?? 0), 0);
    const fuel = logs.filter((f) => f.truckId === t.id).reduce((s, f) => s + f.cost.amount, 0);
    return { truck: t, maint, fuel, total: maint + fuel };
  });
  const money = (n: number) => formatMoney({ amount: n, currency: "ZAR", vat: "incl" });
  const grand = rows.reduce(
    (a, r) => ({ maint: a.maint + r.maint, fuel: a.fuel + r.fuel, total: a.total + r.total }),
    { maint: 0, fuel: 0, total: 0 },
  );

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Running cost per vehicle
      </h2>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border bg-graphite/60 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <th className="px-4 py-2.5">Vehicle</th>
              <th className="px-3 py-2.5 text-right">Maintenance</th>
              <th className="px-3 py-2.5 text-right">Fuel</th>
              <th className="px-3 py-2.5 text-right">Total</th>
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
                <td className="px-3 py-2.5 text-right font-mono">{money(r.maint)}</td>
                <td className="px-3 py-2.5 text-right font-mono">{money(r.fuel)}</td>
                <td className="px-3 py-2.5 text-right font-mono font-bold">{money(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-graphite/40 font-bold">
              <td className="px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                Fleet total
              </td>
              <td className="px-3 py-2.5 text-right font-mono">{money(grand.maint)}</td>
              <td className="px-3 py-2.5 text-right font-mono">{money(grand.fuel)}</td>
              <td className="px-3 py-2.5 text-right font-mono">{money(grand.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Maintenance totals include the cost you enter on each task; fuel totals come from logged
        fill-ups.
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
