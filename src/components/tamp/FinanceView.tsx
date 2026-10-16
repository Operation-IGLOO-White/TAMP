import { Banknote, CheckCircle2, Clock3, ReceiptText, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { Panel } from "@/components/tamp/StatCard";
import { useTamp } from "@/context/TampContext";
import type { Invoice, InvoiceStatus } from "@/types/domain";

const money = (value: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);
const tone: Record<InvoiceStatus, string> = { ISSUED: "bg-warning/15 text-warning", PAID: "bg-sky-500/10 text-sky-700", SETTLED: "bg-positive/10 text-positive", VOID: "bg-steel text-muted-foreground" };

export function FinanceView({ mode }: { mode: "owner" | "carrier" | "admin" }) {
  const { invoices, transactions, loads, parties, updateInvoice } = useTamp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const ordered = useMemo(() => [...invoices].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)), [invoices]);
  const selected = ordered.find((item) => item.id === selectedId) ?? ordered[0];
  const receivable = ordered.filter((item) => item.status === "ISSUED").reduce((sum, item) => sum + item.total, 0);
  const payable = ordered.filter((item) => item.status === "PAID").reduce((sum, item) => sum + item.carrierPayout, 0);
  const settled = ordered.filter((item) => item.status === "SETTLED").reduce((sum, item) => sum + (mode === "owner" ? item.total : item.carrierPayout), 0);
  const title = mode === "owner" ? "Billing" : mode === "carrier" ? "Earnings" : "Finance Control";
  const perform = async (action: "RECORD_PAYMENT" | "RELEASE_PAYOUT" | "VOID") => {
    if (!selected || reference.trim().length < 3) return;
    setBusy(true);
    if (await updateInvoice(selected.id, action, reference.trim())) setReference("");
    setBusy(false);
  };

  return <AppShell><PageHeader title={title} /><div className="space-y-6 bg-[#f7f9fb] p-4 sm:p-6">
    <div className="grid gap-3 sm:grid-cols-3">
      <Metric label={mode === "carrier" ? "Awaiting owner payment" : "Outstanding"} value={money(receivable)} icon={Clock3} />
      <Metric label={mode === "owner" ? "Paid, awaiting settlement" : "Pending payout"} value={money(payable)} icon={WalletCards} />
      <Metric label={mode === "owner" ? "Paid invoices" : "Settled earnings"} value={money(settled)} icon={CheckCircle2} />
    </div>
    <div className="grid overflow-hidden rounded-xl border border-border bg-white lg:grid-cols-[390px_1fr]">
      <div className="border-b border-border lg:border-b-0 lg:border-r"><div className="border-b border-border p-4"><h2 className="font-black">Invoices</h2><p className="text-xs text-muted-foreground">Created from completed trips and agreed rates.</p></div><div className="divide-y divide-border">{ordered.map((invoice) => { const load = loads.find((item) => item.id === invoice.loadId); return <button key={invoice.id} onClick={() => setSelectedId(invoice.id)} className={`w-full p-4 text-left hover:bg-steel/20 ${selected?.id === invoice.id ? "border-l-4 border-signal bg-signal/5" : ""}`}><div className="flex justify-between gap-2"><strong className="font-mono text-xs">{invoice.invoiceNumber}</strong><span className={`rounded px-2 py-0.5 text-[9px] font-bold ${tone[invoice.status]}`}>{invoice.status}</span></div><p className="mt-2 truncate text-sm font-semibold">{load ? `${load.origin.label} → ${load.destination.label}` : invoice.loadId}</p><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>Due {new Date(invoice.dueAt).toLocaleDateString("en-ZA")}</span><strong className="text-foreground">{money(mode === "carrier" ? invoice.carrierPayout : invoice.total)}</strong></div></button>})}{!ordered.length && <p className="p-8 text-center text-sm text-muted-foreground">Invoices appear automatically after a trip is completed.</p>}</div></div>
      <div className="min-w-0 p-5">{selected ? <InvoiceDetail invoice={selected} mode={mode} parties={parties} transactionCount={transactions.filter((item) => item.invoiceId === selected.id).length} /> : <div className="grid min-h-80 place-items-center text-sm text-muted-foreground">No invoice selected.</div>}
      {mode === "admin" && selected && ["ISSUED", "PAID"].includes(selected.status) && <Panel title="Manual settlement"><div className="space-y-3 p-4"><p className="text-xs text-muted-foreground">Enter the bank or gateway reference after verifying the transfer outside TAMP.</p><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="External payment reference" className="w-full rounded-md border border-border px-3 py-2 text-sm" /><div className="flex flex-wrap gap-2">{selected.status === "ISSUED" && <><button disabled={busy || reference.trim().length < 3} onClick={() => void perform("RECORD_PAYMENT")} className="rounded-md bg-positive px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Record payment</button><button disabled={busy || reference.trim().length < 3} onClick={() => void perform("VOID")} className="rounded-md border border-danger px-3 py-2 text-xs font-bold text-danger disabled:opacity-40">Void invoice</button></>}{selected.status === "PAID" && <button disabled={busy || reference.trim().length < 3} onClick={() => void perform("RELEASE_PAYOUT")} className="rounded-md bg-signal px-3 py-2 text-xs font-bold text-signal-foreground disabled:opacity-40">Release carrier payout</button>}</div></div></Panel>}</div>
    </div>
  </div></AppShell>;
}

function InvoiceDetail({ invoice, mode, parties, transactionCount }: { invoice: Invoice; mode: "owner" | "carrier" | "admin"; parties: { id: string; companyName: string }[]; transactionCount: number }) { const owner = parties.find((item) => item.id === invoice.ownerId); const carrier = parties.find((item) => item.id === invoice.carrierId); return <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground"><ReceiptText className="size-4" />Tax invoice</div><h2 className="mt-1 text-2xl font-black">{invoice.invoiceNumber}</h2><p className="text-xs text-muted-foreground">Issued {new Date(invoice.issuedAt).toLocaleString("en-ZA")}</p></div><button onClick={() => window.print()} className="rounded-md border border-border px-3 py-2 text-xs font-bold">Print invoice</button></div><div className="grid gap-3 sm:grid-cols-2"><Box label="Freight owner" value={owner?.companyName ?? invoice.ownerId} /><Box label="Carrier" value={carrier?.companyName ?? invoice.carrierId} /></div><Panel title="Charges"><div className="divide-y divide-border">{invoice.lineItems.map((item) => <div key={item.description} className="flex justify-between gap-4 p-3 text-sm"><span>{item.description}</span><strong>{money(item.amount)}</strong></div>)}<Row label="Subtotal" value={invoice.subtotal} /><Row label={`VAT (${invoice.vatRate * 100}%)`} value={invoice.vatAmount} /><Row label="Invoice total" value={invoice.total} strong />{mode !== "owner" && <><Row label={`TAMP commission (${invoice.platformFeeRate * 100}%)`} value={-invoice.platformFee} /><Row label="Carrier payout" value={invoice.carrierPayout} strong /></>}</div></Panel><div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{transactionCount} settlement record{transactionCount === 1 ? "" : "s"}</span><span>Due {new Date(invoice.dueAt).toLocaleDateString("en-ZA")}</span></div></div>; }
function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Banknote }) { return <div className="rounded-xl border border-border bg-white p-4"><div className="flex justify-between text-xs font-semibold text-muted-foreground"><span>{label}</span><Icon className="size-4 text-signal" /></div><div className="mt-2 text-2xl font-black">{value}</div></div>; }
function Box({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-steel/25 p-3"><div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div><div className="mt-1 text-sm font-semibold">{value}</div></div>; }
function Row({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) { return <div className={`flex justify-between p-3 text-sm ${strong ? "font-black" : ""}`}><span>{label}</span><span>{money(value)}</span></div>; }
