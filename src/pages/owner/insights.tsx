import { useMemo, useState } from "react";
import { BarChart3, CircleDollarSign, Download, FileCheck2, TrendingUp } from "lucide-react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { StatCard } from "@/components/tamp/StatCard";
import { useTamp } from "@/context/TampContext";
import { activeMatchForLoad, tripForMatch } from "@/lib/tamp-selectors";

type Tab = "reconciliation" | "reporting";
const money = (value: number) => `R ${value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FreightInsights() {
  const { loads, matches, trips, invoices, parties, trucks } = useTamp();
  const [tab, setTab] = useState<Tab>("reconciliation");
  const rows = useMemo(() => loads.map((load) => {
    const match = activeMatchForLoad(load.id, matches);
    const trip = tripForMatch(match?.id, trips);
    const invoice = invoices.find((item) => item.loadId === load.id);
    const truck = trucks.find((item) => item.id === match?.truckPostingId);
    const carrier = parties.find((item) => item.id === truck?.transporterId);
    const quote = load.targetRate?.amount ?? 0;
    const agreed = match?.agreedRate?.amount ?? quote;
    const invoiced = invoice?.total ?? 0;
    return { load, match, trip, invoice, carrier, quote, agreed, invoiced, variance: invoiced ? invoiced - agreed : 0 };
  }), [loads, matches, trips, invoices, trucks, parties]);
  const invoicedTotal = rows.reduce((total, row) => total + row.invoiced, 0);
  const outstanding = rows.filter((row) => row.invoice?.status === "ISSUED").reduce((total, row) => total + row.invoiced, 0);
  const delivered = rows.filter((row) => row.trip?.status === "DELIVERED").length;
  const onTime = rows.filter((row) => row.trip?.status === "DELIVERED" && !["DELAYED", "ACTION_REQUIRED"].includes(row.trip.operationalStatus ?? "")).length;
  const exportCsv = () => {
    const header = ["Load", "Route", "Carrier", "Status", "Quoted", "Agreed", "Invoiced", "Variance"];
    const lines = rows.map((row) => [row.load.reference, `${row.load.origin.label} to ${row.load.destination.label}`, row.carrier?.companyName ?? "Unassigned", row.invoice?.status ?? row.trip?.status ?? row.load.status, row.quote, row.agreed, row.invoiced, row.variance]);
    const csv = [header, ...lines].map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `tamp-shipments-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <AppShell>
    <PageHeader title="Rates & reporting" actions={<button onClick={exportCsv} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-xs font-bold uppercase hover:bg-steel/30"><Download className="size-4" /> Export CSV</button>} />
    <div className="space-y-5 p-4 sm:p-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Total invoiced" value={money(invoicedTotal)} icon={CircleDollarSign} /><StatCard label="Outstanding" value={money(outstanding)} icon={FileCheck2} accent={outstanding > 0} /><StatCard label="Delivered" value={String(delivered)} icon={TrendingUp} /><StatCard label="On-time rate" value={`${delivered ? Math.round(onTime / delivered * 100) : 0}%`} icon={BarChart3} /></div>
      <section className="app-surface overflow-hidden">
        <div className="flex gap-1 border-b border-border p-2"><button onClick={() => setTab("reconciliation")} className={`rounded-lg px-4 py-2 text-xs font-bold ${tab === "reconciliation" ? "bg-signal text-signal-foreground" : "text-muted-foreground"}`}>Rate reconciliation</button><button onClick={() => setTab("reporting")} className={`rounded-lg px-4 py-2 text-xs font-bold ${tab === "reporting" ? "bg-signal text-signal-foreground" : "text-muted-foreground"}`}>Shipment reporting</button></div>
        {tab === "reconciliation" ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead><tr className="border-b border-border bg-steel/25 text-[10px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3">Shipment</th><th className="px-4 py-3">Carrier</th><th className="px-4 py-3">Platform quote</th><th className="px-4 py-3">Agreed rate</th><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Variance</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-border">{rows.map((row) => <tr key={row.load.id} className="hover:bg-steel/20"><td className="px-4 py-4"><p className="font-mono font-bold">{row.load.reference}</p><p className="max-w-xs truncate text-[10px] text-muted-foreground">{row.load.origin.label} → {row.load.destination.label}</p></td><td className="px-4 py-4 font-semibold">{row.carrier?.companyName ?? "Not assigned"}</td><td className="px-4 py-4 font-mono">{money(row.quote)}</td><td className="px-4 py-4 font-mono font-bold">{money(row.agreed)}</td><td className="px-4 py-4 font-mono">{row.invoice ? money(row.invoiced) : "Not issued"}</td><td className={`px-4 py-4 font-mono font-bold ${row.variance > 0 ? "text-danger" : row.variance < 0 ? "text-positive" : ""}`}>{row.invoice ? money(row.variance) : "—"}</td><td className="px-4 py-4"><span className="rounded bg-steel px-2 py-1 text-[9px] font-bold uppercase">{row.invoice?.status ?? row.trip?.status ?? row.load.status}</span></td></tr>)}</tbody></table></div> : <Reporting rows={rows} />}
      </section>
    </div>
  </AppShell>;
}

function Reporting({ rows }: { rows: Array<{ load: { id: string; cargoType: string; distanceKm: number }; trip: { status: string; operationalStatus?: string } | undefined }> }) {
  const byCargo = Object.entries(rows.reduce<Record<string, number>>((result, row) => ({ ...result, [row.load.cargoType]: (result[row.load.cargoType] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const maximum = Math.max(1, ...byCargo.map(([, count]) => count));
  const active = rows.filter((row) => row.trip && !["DELIVERED", "CANCELLED"].includes(row.trip.status)).length;
  const cancelled = rows.filter((row) => row.trip?.status === "CANCELLED").length;
  const distance = rows.reduce((total, row) => total + row.load.distanceKm, 0);
  return <div className="grid gap-5 p-4 lg:grid-cols-[1fr_320px]"><div><h2 className="font-black">Shipment volume by cargo type</h2><div className="mt-5 space-y-4">{byCargo.map(([label, count]) => <div key={label}><div className="mb-1 flex justify-between text-xs"><span className="font-semibold">{label.replaceAll("_", " ")}</span><span className="font-mono">{count}</span></div><div className="h-2 rounded-full bg-steel"><div className="h-2 rounded-full bg-signal transition-all" style={{ width: `${count / maximum * 100}%` }} /></div></div>)}{byCargo.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Shipment activity will appear here.</p>}</div></div><aside className="space-y-3 rounded-xl border border-border bg-steel/20 p-4"><h3 className="text-xs font-black uppercase tracking-wide">Operational summary</h3><Metric label="Total shipments" value={rows.length} /><Metric label="Currently active" value={active} /><Metric label="Cancelled trips" value={cancelled} /><Metric label="Planned kilometres" value={Math.round(distance).toLocaleString("en-ZA")} /></aside></div>;
}
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-3"><span className="text-xs text-muted-foreground">{label}</span><strong className="font-mono">{value}</strong></div>; }
