import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, MapPin, PackagePlus, Plus, Save, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { AddressInput } from "@/components/tamp/AddressInput";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import {
  deleteFreightWorkspaceRecord,
  getFreightWorkspace,
  saveFreightCustomer,
  saveFreightLocation,
  saveLoadTemplate,
} from "@/fns/freight-workspace";
import type { CargoType, Place } from "@/types/domain";

type Tab = "customers" | "locations" | "templates";
const CARGO: CargoType[] = ["GENERAL_PALLETISED", "BULK_DRY", "BULK_LIQUID", "REFRIGERATED", "ABNORMAL", "CONTAINERISED", "LIVESTOCK", "HAZARDOUS"];

export default function FreightDirectory() {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const requested = params.get("view") as Tab | null;
  const tab: Tab = requested && ["customers", "locations", "templates"].includes(requested) ? requested : "customers";
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["freight-workspace"], queryFn: getFreightWorkspace });
  const refresh = () => client.invalidateQueries({ queryKey: ["freight-workspace"] });
  const remove = useMutation({ mutationFn: ({ kind, id }: { kind: "CUSTOMER" | "LOCATION" | "TEMPLATE"; id: string }) => deleteFreightWorkspaceRecord(kind, id), onSuccess: () => { void refresh(); toast.success("Record removed"); }, onError: (error) => toast.error("Record was not removed", { description: error.message }) });
  const counts = { customers: data?.customers.length ?? 0, locations: data?.locations.length ?? 0, templates: data?.templates.length ?? 0 };

  return <AppShell>
    <PageHeader title="Customers & templates" actions={<button onClick={() => setAdding(true)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-signal px-4 text-xs font-black uppercase text-signal-foreground"><Plus className="size-4" /> Add {tab === "customers" ? "customer" : tab === "locations" ? "location" : "template"}</button>} />
    <div className="space-y-5 p-4 sm:p-6">
      <section className="app-surface overflow-hidden">
        <div className="flex gap-1 overflow-x-auto border-b border-border p-2">
          <TabButton active={tab === "customers"} onClick={() => { setParams({}); setAdding(false); }} icon={Users} label="Customers" count={counts.customers} />
          <TabButton active={tab === "locations"} onClick={() => { setParams({ view: "locations" }); setAdding(false); }} icon={MapPin} label="Saved locations" count={counts.locations} />
          <TabButton active={tab === "templates"} onClick={() => { setParams({ view: "templates" }); setAdding(false); }} icon={PackagePlus} label="Load templates" count={counts.templates} />
        </div>
        {adding && <div className="border-b border-border bg-steel/20 p-4">{tab === "customers" ? <CustomerForm done={() => { setAdding(false); void refresh(); }} /> : tab === "locations" ? <LocationForm customers={data?.customers ?? []} done={() => { setAdding(false); void refresh(); }} /> : <TemplateForm customers={data?.customers ?? []} locations={data?.locations ?? []} done={() => { setAdding(false); void refresh(); }} />}</div>}
        {isLoading ? <p className="p-12 text-center text-sm text-muted-foreground">Loading freight directory…</p> : <div className="divide-y divide-border">
          {tab === "customers" && data?.customers.map((item) => <RecordRow key={item.id} icon={Building2} title={item.name} detail={[item.accountCode, item.contactName, item.contactEmail].filter(Boolean).join(" · ") || "No contact details"} onDelete={() => remove.mutate({ kind: "CUSTOMER", id: item.id })} />)}
          {tab === "locations" && data?.locations.map((item) => <RecordRow key={item.id} icon={MapPin} title={item.name} detail={item.place.label} onDelete={() => remove.mutate({ kind: "LOCATION", id: item.id })} />)}
          {tab === "templates" && data?.templates.map((item) => <RecordRow key={item.id} icon={PackagePlus} title={item.name} detail={`${item.cargoType.replaceAll("_", " ")} · ${(item.weightKg / 1000).toFixed(1)} t${item.originLocationId && item.destinationLocationId ? " · Saved lane" : ""}`} onDelete={() => remove.mutate({ kind: "TEMPLATE", id: item.id })} />)}
          {counts[tab] === 0 && !adding && <div className="p-14 text-center"><p className="text-sm font-bold">No {tab.replace("templates", "load templates")} yet</p><p className="mt-1 text-xs text-muted-foreground">Add reusable information to make future load posting faster and more consistent.</p></div>}
        </div>}
      </section>
    </div>
  </AppShell>;
}

function CustomerForm({ done }: { done: () => void }) {
  const [form, setForm] = useState({ name: "", accountCode: "", contactName: "", contactEmail: "", contactPhone: "", billingEmail: "", notes: "", active: true });
  const mutation = useMutation({ mutationFn: () => saveFreightCustomer(form), onSuccess: () => { toast.success("Customer saved"); done(); }, onError: (error) => toast.error("Customer was not saved", { description: error.message }) });
  return <Editor title="New customer" save={() => mutation.mutate()} disabled={!form.name.trim() || mutation.isPending}>{(["name", "accountCode", "contactName", "contactEmail", "contactPhone", "billingEmail"] as const).map((key) => <input key={key} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={{ name: "Customer name *", accountCode: "Account code", contactName: "Contact name", contactEmail: "Contact email", contactPhone: "Contact phone", billingEmail: "Billing email" }[key]} className="field" />)}<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" className="field md:col-span-2" /></Editor>;
}

function LocationForm({ customers, done }: { customers: { id: string; name: string }[]; done: () => void }) {
  const [name, setName] = useState(""); const [customerId, setCustomerId] = useState(""); const [place, setPlace] = useState<Place | null>(null); const [instructions, setInstructions] = useState("");
  const mutation = useMutation({ mutationFn: () => saveFreightLocation({ name, ...(customerId ? { customerId } : {}), place: place!, instructions, active: true }), onSuccess: () => { toast.success("Location saved"); done(); }, onError: (error) => toast.error("Location was not saved", { description: error.message }) });
  return <Editor title="New saved location" save={() => mutation.mutate()} disabled={!name.trim() || !place || mutation.isPending}><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Location name *" className="field" /><select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="field"><option value="">Shared location</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="md:col-span-2"><AddressInput value={place} onSelect={setPlace} placeholder="Search exact street address" /></div><textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Site or access instructions" className="field md:col-span-2" /></Editor>;
}

function TemplateForm({ customers, locations, done }: { customers: { id: string; name: string }[]; locations: { id: string; name: string }[]; done: () => void }) {
  const [form, setForm] = useState({ name: "", customerId: "", originLocationId: "", destinationLocationId: "", cargoType: "GENERAL_PALLETISED" as CargoType, weightKg: 24000, volumeM3: 0, specialRequirements: "", active: true });
  const mutation = useMutation({ mutationFn: () => saveLoadTemplate({ name: form.name, cargoType: form.cargoType, weightKg: form.weightKg, specialRequirements: form.specialRequirements, active: true, ...(form.customerId ? { customerId: form.customerId } : {}), ...(form.originLocationId ? { originLocationId: form.originLocationId } : {}), ...(form.destinationLocationId ? { destinationLocationId: form.destinationLocationId } : {}), ...(form.volumeM3 ? { volumeM3: form.volumeM3 } : {}) }), onSuccess: () => { toast.success("Load template saved"); done(); }, onError: (error) => toast.error("Template was not saved", { description: error.message }) });
  return <Editor title="New load template" save={() => mutation.mutate()} disabled={!form.name.trim() || form.weightKg <= 0 || mutation.isPending}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Template name *" className="field" /><select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className="field"><option value="">Any customer</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={form.originLocationId} onChange={(e) => setForm({ ...form, originLocationId: e.target.value })} className="field"><option value="">Select origin</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={form.destinationLocationId} onChange={(e) => setForm({ ...form, destinationLocationId: e.target.value })} className="field"><option value="">Select destination</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={form.cargoType} onChange={(e) => setForm({ ...form, cargoType: e.target.value as CargoType })} className="field">{CARGO.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select><input type="number" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: Number(e.target.value) })} placeholder="Weight (kg)" className="field" /></Editor>;
}

function Editor({ title, save, disabled, children }: { title: string; save: () => void; disabled: boolean; children: ReactNode }) { return <div><div className="mb-3 flex items-center justify-between"><h2 className="font-black">{title}</h2><button disabled={disabled} onClick={save} className="inline-flex items-center gap-2 rounded-lg bg-signal px-4 py-2 text-xs font-black uppercase text-signal-foreground disabled:opacity-50"><Save className="size-4" /> Save</button></div><div className="grid gap-3 md:grid-cols-2">{children}</div></div>; }
function TabButton({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: typeof Users; label: string; count: number }) { return <button onClick={onClick} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-bold ${active ? "bg-signal text-signal-foreground" : "text-muted-foreground hover:bg-steel/40"}`}><Icon className="size-4" /> {label}<span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[9px] text-foreground">{count}</span></button>; }
function RecordRow({ icon: Icon, title, detail, onDelete }: { icon: typeof Users; title: string; detail: string; onDelete: () => void }) { return <div className="flex items-center gap-3 px-4 py-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-signal/10 text-signal"><Icon className="size-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{title}</p><p className="truncate text-xs text-muted-foreground">{detail}</p></div><button onClick={onDelete} aria-label={`Delete ${title}`} className="rounded-lg border border-border p-2 text-muted-foreground hover:border-danger/40 hover:text-danger"><Trash2 className="size-4" /></button></div>; }
