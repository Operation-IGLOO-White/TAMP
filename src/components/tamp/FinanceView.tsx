import { AlertTriangle, Banknote, CheckCircle2, Clock3, FileCheck2, ReceiptText, Truck, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { Panel } from "@/components/tamp/StatCard";
import { useTamp } from "@/context/TampContext";
import { Link } from "@/lib/nav";
import type { Invoice, InvoiceStatus } from "@/types/domain";

const money = (value: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);
const tone: Record<InvoiceStatus, string> = {
  ISSUED: "bg-warning/15 text-warning",
  PAID: "bg-sky-500/10 text-sky-700",
  SETTLED: "bg-positive/10 text-positive",
  VOID: "bg-steel text-muted-foreground",
};

export function FinanceView({ mode }: { mode: "owner" | "carrier" | "admin" }) {
  const { invoices, transactions, loads, parties, matches, trips, trucks, proofs, disputes, updateInvoice } = useTamp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const ordered = useMemo(
    () => [...invoices].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
    [invoices],
  );
  const selected = ordered.find((item) => item.id === selectedId) ?? ordered[0];
  const invoiceGroups = useMemo(() => {
    const partiesById = new Map(parties.map((party) => [party.id, party]));
    const groups = new Map<string, Invoice[]>();
    for (const invoice of ordered) {
      const organisationKey = (partyId: string) => {
        const organisations = partiesById.get(partyId)?.organisations;
        const organisationId = organisations?.length === 1 ? organisations[0]?.id : undefined;
        return organisationId ? `org:${organisationId}` : `party:${partyId}`;
      };
      const key = JSON.stringify([
        invoice.loadId,
        organisationKey(invoice.ownerId),
        organisationKey(invoice.carrierId),
      ]);
      const group = groups.get(key);
      if (group) group.push(invoice);
      else groups.set(key, [invoice]);
    }
    return Array.from(groups, ([key, items]) => ({ key, items }));
  }, [ordered, parties]);
  const receivable = ordered
    .filter((item) => item.status === "ISSUED")
    .reduce((sum, item) => sum + item.total, 0);
  const payable = ordered
    .filter((item) => item.status === "PAID")
    .reduce((sum, item) => sum + item.carrierPayout, 0);
  const settled = ordered
    .filter((item) => item.status === "SETTLED")
    .reduce((sum, item) => sum + (mode === "owner" ? item.total : item.carrierPayout), 0);
  const title = mode === "owner" ? "Billing" : mode === "carrier" ? "Earnings" : "Finance Control";
  const perform = async (action: "RECORD_PAYMENT" | "RELEASE_PAYOUT" | "VOID") => {
    if (!selected || reference.trim().length < 3) return;
    setBusy(true);
    if (await updateInvoice(selected.id, action, reference.trim())) setReference("");
    setBusy(false);
  };

  return (
    <AppShell>
      <PageHeader title={title} />
      <div className="space-y-6 bg-background p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            label={mode === "carrier" ? "Awaiting owner payment" : "Outstanding"}
            value={money(receivable)}
            icon={Clock3}
          />
          <Metric
            label={mode === "owner" ? "Paid, awaiting settlement" : "Pending payout"}
            value={money(payable)}
            icon={WalletCards}
          />
          <Metric
            label={mode === "owner" ? "Paid invoices" : "Settled earnings"}
            value={money(settled)}
            icon={CheckCircle2}
          />
        </div>
        {mode === "owner" && (
          <ShipmentSettlementWorkspace
            loads={loads}
            matches={matches}
            trips={trips}
            trucks={trucks}
            parties={parties}
            proofs={proofs}
            disputes={disputes}
            invoices={invoices}
          />
        )}
        <div className="grid overflow-hidden rounded-xl border border-border bg-graphite lg:grid-cols-[390px_1fr]">
          <div className="border-b border-border lg:border-b-0 lg:border-r">
            <div className="border-b border-border p-4">
              <h2 className="font-black">Invoices</h2>
              <p className="text-xs text-muted-foreground">
                Grouped by shipment contract and organisation.
              </p>
            </div>
            <div className="divide-y divide-border">
              {invoiceGroups.map(({ key, items }) => {
                const first = items[0];
                if (!first) return null;
                const load = loads.find((item) => item.id === first.loadId);
                const counterparty = parties.find((party) => party.id === (mode === "carrier" ? first.ownerId : first.carrierId));
                const total = items.reduce((sum, invoice) => invoice.status === "VOID"
                  ? sum
                  : sum + (mode === "carrier" ? invoice.carrierPayout : invoice.total), 0);
                return (
                  <details key={key} open={items.some((invoice) => invoice.id === selected?.id) || undefined}>
                    <summary className="cursor-pointer p-4 hover:bg-steel/20">
                      <strong className="text-sm">{counterparty?.companyName || counterparty?.contactName || (mode === "carrier" ? "Freight owner" : "Transporter")}</strong>
                      <span className="ml-2 text-xs text-muted-foreground">{items.length} {items.length === 1 ? "invoice" : "invoices"}</span>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {load ? `${load.origin.label} → ${load.destination.label}` : first.loadId}
                      </p>
                      <div className="mt-1 flex flex-wrap justify-between gap-1 text-xs">
                        <span className="break-all text-muted-foreground">{first.loadId}</span>
                        <strong>{money(total)}</strong>
                      </div>
                    </summary>
                    <div className="divide-y divide-border border-t border-border">
                    {items.map((invoice) => (
                  <button
                    key={invoice.id}
                    onClick={() => {
                      if (invoice.id !== selected?.id) setReference("");
                      setSelectedId(invoice.id);
                    }}
                    className={`w-full p-4 text-left hover:bg-steel/20 ${selected?.id === invoice.id ? "border-l-4 border-signal bg-signal/5" : ""}`}
                  >
                    <div className="flex justify-between gap-2">
                      <strong className="font-mono text-xs">{invoice.invoiceNumber}</strong>
                      <span
                        className={`rounded px-2 py-0.5 text-[9px] font-bold ${tone[invoice.status]}`}
                      >
                        {invoice.status}
                      </span>
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>Due {new Date(invoice.dueAt).toLocaleDateString("en-ZA")}</span>
                      <strong className="text-foreground">
                        {money(mode === "carrier" ? invoice.carrierPayout : invoice.total)}
                      </strong>
                    </div>
                  </button>
                    ))}
                    </div>
                  </details>
                );
              })}
              {!ordered.length && (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  Invoices appear automatically after a trip is completed.
                </p>
              )}
            </div>
          </div>
          <div className="min-w-0 p-5">
            {selected ? (
              <InvoiceDetail
                invoice={selected}
                mode={mode}
                parties={parties}
                transactionCount={
                  transactions.filter((item) => item.invoiceId === selected.id).length
                }
              />
            ) : (
              <div className="grid min-h-80 place-items-center text-sm text-muted-foreground">
                No invoice selected.
              </div>
            )}
            {mode === "admin" && selected && ["ISSUED", "PAID"].includes(selected.status) && (
              <Panel title="Manual settlement">
                <div className="space-y-3 p-4">
                  <p className="text-xs text-muted-foreground">
                    Enter the bank or gateway reference after verifying the transfer outside TAMP.
                  </p>
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="External payment reference"
                    className="w-full rounded-md border border-border px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    {selected.status === "ISSUED" && (
                      <>
                        <button
                          disabled={busy || reference.trim().length < 3}
                          onClick={() => void perform("RECORD_PAYMENT")}
                          className="rounded-md bg-positive px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                        >
                          Record payment
                        </button>
                        <button
                          disabled={busy || reference.trim().length < 3}
                          onClick={() => void perform("VOID")}
                          className="rounded-md border border-danger px-3 py-2 text-xs font-bold text-danger disabled:opacity-40"
                        >
                          Void invoice
                        </button>
                      </>
                    )}
                    {selected.status === "PAID" && (
                      <button
                        disabled={busy || reference.trim().length < 3}
                        onClick={() => void perform("RELEASE_PAYOUT")}
                        className="rounded-md bg-signal px-3 py-2 text-xs font-bold text-signal-foreground disabled:opacity-40"
                      >
                        Release carrier payout
                      </button>
                    )}
                  </div>
                </div>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

type FinanceStore = ReturnType<typeof useTamp>;
type SettlementStage = "DRAFT" | "AWAITING_POD" | "UNDER_REVIEW" | "INVOICED" | "PAID";
const settlementTone: Record<SettlementStage, string> = {
  DRAFT: "bg-steel text-muted-foreground",
  AWAITING_POD: "bg-warning/15 text-warning",
  UNDER_REVIEW: "bg-signal/15 text-signal",
  INVOICED: "bg-sky-500/10 text-sky-700",
  PAID: "bg-positive/10 text-positive",
};

function ShipmentSettlementWorkspace({
  loads,
  matches,
  trips,
  trucks,
  parties,
  proofs,
  disputes,
  invoices,
}: Pick<FinanceStore, "loads" | "matches" | "trips" | "trucks" | "parties" | "proofs" | "disputes" | "invoices">) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const rows = useMemo(() => loads.map((load) => {
    const allocations = matches
      .filter((match) => match.loadId === load.id && (["ACCEPTED", "CONFIRMED"].includes(match.status) || trips.some((trip) => trip.matchId === match.id)))
      .map((match) => {
        const trip = trips.find((candidate) => candidate.matchId === match.id);
        const truck = trucks.find((candidate) => candidate.id === match.truckPostingId);
        const carrier = parties.find((candidate) => candidate.id === truck?.transporterId);
        const pod = trip ? proofs.find((candidate) => candidate.tripId === trip.id && (candidate.kind ?? "DELIVERY") === "DELIVERY") : undefined;
        const invoice = trip ? invoices.find((candidate) => candidate.tripId === trip.id && candidate.status !== "VOID") : undefined;
        const dispute = trip ? disputes.find((candidate) => candidate.tripId === trip.id && candidate.status !== "RESOLVED") : undefined;
        const agreedRate = invoice?.total ?? match.agreedRate?.amount ?? load.targetRate?.amount ?? 0;
        return { match, trip, truck, carrier, pod, invoice, dispute, agreedRate };
      });
    const live = allocations.filter((allocation) => allocation.trip?.status !== "CANCELLED");
    const required = load.trucksRequired ?? 1;
    const delivered = live.filter((allocation) => allocation.trip && ["DELIVERED", "COMPLETED"].includes(allocation.trip.status));
    const withPod = delivered.filter((allocation) => allocation.pod);
    const activeInvoices = live.map((allocation) => allocation.invoice).filter((invoice): invoice is Invoice => Boolean(invoice));
    const paidInvoices = activeInvoices.filter((invoice) => ["PAID", "SETTLED"].includes(invoice.status));
    const stage: SettlementStage = delivered.length === 0
      ? "DRAFT"
      : withPod.length < delivered.length || delivered.length < required
        ? "AWAITING_POD"
        : activeInvoices.length < delivered.length
          ? "UNDER_REVIEW"
          : paidInvoices.length < activeInvoices.length
            ? "INVOICED"
            : "PAID";
    return {
      load, allocations, live, required, delivered: delivered.length, pods: withPod.length,
      invoices: activeInvoices.length, paid: paidInvoices.length, stage,
      total: activeInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
      payout: activeInvoices.reduce((sum, invoice) => sum + invoice.carrierPayout, 0),
      platformFee: activeInvoices.reduce((sum, invoice) => sum + invoice.platformFee, 0),
      disputes: live.filter((allocation) => allocation.dispute).length,
    };
  }).filter((row) => row.allocations.length).sort((a, b) => +new Date(b.load.pickupWindow.from) - +new Date(a.load.pickupWindow.from)), [disputes, invoices, loads, matches, parties, proofs, trips, trucks]);

  const missingPods = rows.reduce((sum, row) => sum + Math.max(0, row.delivered - row.pods), 0);
  const underReview = rows.filter((row) => row.stage === "UNDER_REVIEW").length;
  const payable = rows.reduce((sum, row) => sum + row.payout, 0);

  return <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
    <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="font-black">Shipment POD & settlement</h2><p className="mt-1 text-xs text-muted-foreground">Every truck is reviewed independently; one disputed allocation does not hide completed trucks.</p></div>
      <div className="grid grid-cols-3 gap-2"><SettlementMetric label="PODs missing" value={missingPods} alert={missingPods > 0} /><SettlementMetric label="Under review" value={underReview} /><SettlementMetric label="Carrier payable" value={money(payable)} /></div>
    </div>
    <div className="divide-y divide-border">
      {rows.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">Shipment settlements appear after trucks are allocated.</div>}
      {rows.map((row) => {
        const open = expanded === row.load.id;
        const completion = Math.min(100, Math.round((row.delivered / row.required) * 100));
        return <article key={row.load.id}>
          <button type="button" onClick={() => setExpanded(open ? null : row.load.id)} className="grid w-full gap-3 p-4 text-left hover:bg-steel/20 lg:grid-cols-[minmax(0,1.7fr)_repeat(4,minmax(100px,.45fr))] lg:items-center">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] text-muted-foreground">{row.load.reference || row.load.id}</span><span className={`rounded px-2 py-1 text-[8px] font-black uppercase ${settlementTone[row.stage]}`}>{row.stage.replaceAll("_", " ")}</span>{row.disputes > 0 && <span className="rounded bg-danger/10 px-2 py-1 text-[8px] font-black uppercase text-danger">{row.disputes} disputed</span>}</div><p className="mt-1 line-clamp-2 text-xs font-black uppercase">{row.load.origin.label} → {row.load.destination.label}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-steel"><div className="h-full bg-positive" style={{ width: `${completion}%` }} /></div></div>
            <FinanceCell label="Delivered" value={`${row.delivered}/${row.required}`} />
            <FinanceCell label="POD received" value={`${row.pods}/${row.delivered || row.required}`} warning={row.pods < row.delivered} />
            <FinanceCell label="Invoices" value={`${row.invoices}/${row.delivered}`} />
            <FinanceCell label="Consolidated total" value={row.total ? money(row.total) : "Pending"} />
          </button>
          {open && <div className="border-t border-border bg-background/50 p-4">
            <div className="mb-3 grid gap-2 sm:grid-cols-4"><FinanceSummary label="Invoice total" value={money(row.total)} /><FinanceSummary label="Carrier settlement" value={money(row.payout)} /><FinanceSummary label="Platform fee" value={money(row.platformFee)} /><FinanceSummary label="Cost / tonne" value={row.total && row.load.weightKg ? money(row.total / (row.load.weightKg / 1000)) : "Pending"} /></div>
            <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[880px] text-left"><thead className="border-b border-border bg-steel/25 text-[9px] uppercase text-muted-foreground"><tr><th className="px-3 py-2">Truck / transporter</th><th className="px-3 py-2">Trip status</th><th className="px-3 py-2">POD</th><th className="px-3 py-2">Agreed rate</th><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Settlement</th></tr></thead><tbody className="divide-y divide-border">{row.allocations.map((allocation) => <tr key={allocation.match.id} className={allocation.dispute ? "bg-danger/5" : ""}><td className="px-3 py-3"><p className="font-mono text-xs font-black">{allocation.truck?.registration ?? "Truck pending"}</p><p className="text-[9px] text-muted-foreground">{allocation.carrier?.companyName ?? allocation.carrier?.contactName ?? "Transporter"}</p></td><td className="px-3 py-3 text-[10px] font-bold uppercase">{allocation.trip?.status.replaceAll("_", " ") ?? allocation.match.status}</td><td className="px-3 py-3">{allocation.pod ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-positive"><FileCheck2 className="size-3.5" /> Received · {allocation.pod.recipientName}</span> : <span className="text-[10px] font-bold text-warning">Awaiting POD</span>}</td><td className="px-3 py-3 font-mono text-xs font-bold">{allocation.agreedRate ? money(allocation.agreedRate) : "Pending"}</td><td className="px-3 py-3 text-[10px] font-bold uppercase">{allocation.invoice?.status ?? "Not issued"}</td><td className="px-3 py-3">{allocation.dispute ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-danger"><AlertTriangle className="size-3.5" /> Held · dispute</span> : allocation.invoice?.payoutStatus === "PAID" ? <span className="text-[10px] font-bold text-positive">Paid</span> : <span className="text-[10px] text-muted-foreground">Pending</span>}</td></tr>)}</tbody></table></div>
            <div className="mt-3 flex justify-end"><Link to="/owner/loads/$loadId" params={{ loadId: row.load.id }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-[10px] font-black uppercase hover:border-signal"><Truck className="size-4" /> Open shipment records</Link></div>
          </div>}
        </article>;
      })}
    </div>
  </section>;
}

function SettlementMetric({ label, value, alert = false }: { label: string; value: string | number; alert?: boolean }) { return <div className={`min-w-24 rounded-lg border px-3 py-2 text-center ${alert ? "border-danger/30 bg-danger/5" : "border-border bg-background"}`}><p className={`font-mono text-sm font-black ${alert ? "text-danger" : ""}`}>{value}</p><p className="text-[8px] font-bold uppercase text-muted-foreground">{label}</p></div>; }
function FinanceCell({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) { return <div><p className="text-[8px] font-bold uppercase text-muted-foreground">{label}</p><p className={`mt-1 font-mono text-xs font-black ${warning ? "text-warning" : ""}`}>{value}</p></div>; }
function FinanceSummary({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border bg-card p-3"><p className="text-[8px] font-bold uppercase text-muted-foreground">{label}</p><p className="mt-1 font-mono text-sm font-black">{value}</p></div>; }

function InvoiceDetail({
  invoice,
  mode,
  parties,
  transactionCount,
}: {
  invoice: Invoice;
  mode: "owner" | "carrier" | "admin";
  parties: { id: string; companyName: string }[];
  transactionCount: number;
}) {
  const owner = parties.find((item) => item.id === invoice.ownerId);
  const carrier = parties.find((item) => item.id === invoice.carrierId);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <ReceiptText className="size-4" />
            Tax invoice
          </div>
          <h2 className="mt-1 text-2xl font-black">{invoice.invoiceNumber}</h2>
          <p className="text-xs text-muted-foreground">
            Issued {new Date(invoice.issuedAt).toLocaleString("en-ZA")}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-md border border-border px-3 py-2 text-xs font-bold"
        >
          Print invoice
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Box label="Freight owner" value={owner?.companyName ?? invoice.ownerId} />
        <Box label="Carrier" value={carrier?.companyName ?? invoice.carrierId} />
      </div>
      <Panel title="Charges">
        <div className="divide-y divide-border">
          {invoice.lineItems.map((item) => (
            <div key={item.description} className="flex justify-between gap-4 p-3 text-sm">
              <span>{item.description}</span>
              <strong>{money(item.amount)}</strong>
            </div>
          ))}
          <Row label="Subtotal" value={invoice.subtotal} />
          <Row label={`VAT (${invoice.vatRate * 100}%)`} value={invoice.vatAmount} />
          <Row label="Invoice total" value={invoice.total} strong />
          {mode !== "owner" && (
            <>
              <Row
                label={`TAMP commission (${invoice.platformFeeRate * 100}%)`}
                value={-invoice.platformFee}
              />
              <Row label="Carrier payout" value={invoice.carrierPayout} strong />
            </>
          )}
        </div>
      </Panel>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {transactionCount} settlement record{transactionCount === 1 ? "" : "s"}
        </span>
        <span>Due {new Date(invoice.dueAt).toLocaleDateString("en-ZA")}</span>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Banknote;
}) {
  return (
    <div className="rounded-xl border border-border bg-graphite p-4">
      <div className="flex justify-between text-xs font-semibold text-muted-foreground">
        <span>{label}</span>
        <Icon className="size-4 text-signal" />
      </div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  );
}
function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-steel/25 p-3">
      <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}
function Row({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between p-3 text-sm ${strong ? "font-black" : ""}`}>
      <span>{label}</span>
      <span>{money(value)}</span>
    </div>
  );
}
