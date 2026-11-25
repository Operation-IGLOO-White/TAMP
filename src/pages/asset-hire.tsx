import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Forklift, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { AddressInput } from "@/components/tamp/AddressInput";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { useTamp } from "@/context/TampContext";
import { roadDistanceKm } from "@/fns/matching";
import { priceLoadMoney } from "@/fns/pricing";
import { uploadFile } from "@/fns/upload";
import { hasPermission } from "@/lib/access";
import { trpc } from "@/lib/trpc";
import type { Place } from "@/types/domain";

const types = {
  ADT: "Articulated dump truck (ADT)",
  MINE_DUMP_TRUCK: "Rigid mine dump truck",
  EXCAVATOR: "Excavator",
  FEL: "Front-end loader (FEL)",
  CRUSHER: "Crusher",
  SCREEN: "Screen",
  TLB: "Tractor-loader-backhoe (TLB)",
};
type AssetType = keyof typeof types;
type Period = { start: string; end: string };
type Dimensions = { lengthM: number; widthM: number; heightM: number };
type Terms = {
  rate: string; unit: "HOUR" | "SHIFT" | "DAY"; shiftHours: number; minimumUnits: number;
  vat: "incl" | "excl"; operatorIncluded: boolean; fuelIncluded: boolean;
  transportWeightKg: number; dimensions: Dimensions;
};
type Asset = Terms & {
  id: string; version: string; type: AssetType; make: string; model: string; supplierName: string;
  location: Place; mine: boolean; published: boolean; photos: string[]; specifications: string;
  ratedPayloadTonnes?: number; availability: Period; blockedPeriods: Period[]; reservations: Period[];
};
type Booking = Period & {
  id: string; assetId: string; assetName: string; supplierName: string; renterName: string;
  site: Place; assetLocation?: Place; status: string; total: string; units: number; terms: Terms; incoming: boolean;
  notes: string; history: { status: string; at: string; reason?: string }[];
  moves?: Partial<Record<"DELIVERY" | "COLLECTION", string>>;
};
type Move = { id: string; assetName: string; direction: string; destination: string; status: string };
type Workspace = { assets: Asset[]; bookings: Booking[]; moves: Move[] };
type Editor =
  | { mode: "asset"; asset?: Asset }
  | { mode: "hire"; asset: Asset }
  | { mode: "move"; asset?: Asset; booking?: Booking }
  | { mode: "reason"; action: "CANCEL" | "DECLINE"; booking: Booking };

const money = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });
const date = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" });
const dateInput = (value?: string) => value
  ? new Date(new Date(value).getTime() + 7_200_000).toISOString().slice(0, 16)
  : "";
const iso = (value: string) => new Date(value + "+02:00").toISOString();
const statusText = (value: string) => value.toLowerCase().replaceAll("_", " ");
const button = "min-h-10 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50";
const primary = button + " bg-signal text-signal-foreground";
const field = "w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm";
const overlap = (a: Period, b: Period) => Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);

function available(asset: Asset, start: string, end: string) {
  if (!start || !end || start >= end) return true;
  const period = { start: iso(start), end: iso(end) };
  return Date.parse(asset.availability.start) <= Date.parse(period.start)
    && Date.parse(asset.availability.end) >= Date.parse(period.end)
    && ![...asset.blockedPeriods, ...asset.reservations].some((entry) => overlap(entry, period));
}

function Label({ name, children }: { name: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-semibold">{name}{children}</label>;
}

function DateTime({ name, fieldName, value, onChange }: {
  name: string; fieldName: string; value?: string; onChange?: (value: string) => void;
}) {
  return <Label name={name}><input className={field} type="datetime-local" name={fieldName}
    defaultValue={value} required onChange={onChange ? (e) => onChange(e.target.value) : undefined} /></Label>;
}

export default function AssetHire() {
  const { authParty, role, refreshDomain } = useTamp();
  const [params, setParams] = useSearchParams();
  const tab = params.get("view") ?? "browse";
  const [editor, setEditor] = useState<Editor>();
  const [type, setType] = useState("");
  const [location, setLocation] = useState("");
  const [specification, setSpecification] = useState("");
  const [operator, setOperator] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const client = useQueryClient();
  const canList = role === "TRANSPORTER" && hasPermission(authParty, "trucks.manage");
  const canBook = hasPermission(authParty, role === "TRANSPORTER" ? "matches.manage" : "loads.manage");
  const canMove = hasPermission(authParty, role === "TRANSPORTER" ? "trucks.manage" : "loads.manage");
  const key = ["asset-hire", authParty?.id, authParty?.activeOrganisationId];
  const query = useQuery({ queryKey: key, queryFn: () => trpc.query<Workspace>("assetHire.list") });
  const { assets = [], bookings = [], moves = [] } = query.data ?? {};
  const tabs: [string, string][] = [
    ["browse", "Browse assets"], ["requests", "My requests"], ["hires", "My hires"],
    ["moves", "Asset moves"], ...(role === "TRANSPORTER" ? ([["assets", "My assets"], ["incoming", "Incoming requests"]] as [string, string][]) : []),
  ];
  const visibleAssets = assets.filter((asset) => tab === "assets" ? asset.mine : asset.published && !asset.mine
    && (!type || asset.type === type) && (!operator || asset.operatorIncluded)
    && asset.location.label.toLowerCase().includes(location.trim().toLowerCase())
    && [asset.make, asset.model, asset.specifications, asset.ratedPayloadTonnes ? asset.ratedPayloadTonnes + " t" : ""]
      .join(" ").toLowerCase().includes(specification.trim().toLowerCase())
    && available(asset, start, end));
  const visibleBookings = bookings.filter((booking) => {
    if (tab === "incoming") return booking.incoming;
    if (booking.incoming) return false;
    return tab === "requests" ? ["REQUESTED", "DECLINED", "CANCELLED"].includes(booking.status)
      : ["CONFIRMED", "IN_HIRE", "COMPLETED"].includes(booking.status);
  });

  const changeTab = (view: string) => {
    setEditor(undefined);
    setParams({ view });
  };
  const done = async (message: string, view = tab) => {
    await client.invalidateQueries({ queryKey: key });
    changeTab(view);
    toast.success(message);
  };
  return <AppShell>
    <PageHeader title="Asset Hire" actions={canList && <button className={primary} onClick={() => setEditor({ mode: "asset" })}>
      <Plus className="mr-1 inline size-4" /> Add asset
    </button>} />
    <main className="p-4 sm:p-6">
      <nav aria-label="Asset Hire" className="mb-5 flex flex-wrap gap-2">
        {tabs.map(([value, label]) => <button key={value} className={tab === value ? primary : button}
          onClick={() => changeTab(value)} aria-current={tab === value ? "page" : undefined}>{label}</button>)}
      </nav>
      {editor ? <div className="app-surface max-w-4xl p-4 sm:p-6">
        <button className={button + " mb-4"} onClick={() => setEditor(undefined)}>Cancel</button>
        {editor.mode === "asset" && <AssetForm asset={editor.asset} done={() => done("Asset saved", "assets")} />}
        {editor.mode === "hire" && <HireForm asset={editor.asset} start={start} end={end} done={() => done("Hire request sent", "requests")} />}
        {editor.mode === "move" && <MoveForm asset={editor.asset} booking={editor.booking} done={async () => { await refreshDomain(); await done("Asset transport posted", "moves"); }} />}
        {editor.mode === "reason" && <ActionForm booking={editor.booking} action={editor.action} done={() => done("Booking updated")} />}
      </div> : query.isPending ? <p>Loading assets…</p> : query.isError ? <p role="alert">{query.error.message}</p> : <>
        {tab === "browse" && <div className="app-surface mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Label name="Asset type"><select className={field} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All asset types</option>
            {Object.entries(types).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select></Label>
          <Label name="Location"><input className={field} value={location} onChange={(e) => setLocation(e.target.value)} /></Label>
          <Label name="Hire starts (SAST)"><input className={field} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Label>
          <Label name="Hire ends (SAST)"><input className={field} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Label>
          <Label name="Make, model or specification"><input className={field} value={specification} onChange={(e) => setSpecification(e.target.value)} /></Label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={operator} onChange={(e) => setOperator(e.target.checked)} /> Operator included</label>
        </div>}
        {(tab === "browse" || tab === "assets") && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleAssets.map((asset) => <article className="app-surface overflow-hidden" key={asset.id}>
            <div className="flex h-40 items-center justify-center bg-muted">
              {asset.photos[0] ? <img className="h-full w-full object-cover" src={asset.photos[0]} alt={asset.make + " " + asset.model} />
                : <Forklift className="size-12 text-muted-foreground" aria-hidden />}
            </div>
            <div className="space-y-2 p-4">
              <p className="text-xs text-muted-foreground">{types[asset.type]}</p>
              <h2 className="text-lg font-bold">{asset.make} {asset.model}</h2>
              <p className="text-sm">{money.format(Number(asset.rate))} / {asset.unit.toLowerCase()} · {asset.vat} VAT</p>
              <p className="text-sm text-muted-foreground">{asset.supplierName} · {asset.location.label}</p>
              {asset.ratedPayloadTonnes && <p className="text-sm">{asset.ratedPayloadTonnes} t rated payload</p>}
              {asset.specifications && <p className="whitespace-pre-wrap text-sm">{asset.specifications}</p>}
              <p className="text-xs text-muted-foreground">{asset.operatorIncluded ? "Operator included" : "Operator excluded"} · {asset.fuelIncluded ? "Fuel included" : "Fuel excluded"}</p>
              <p className="text-xs text-muted-foreground">Hire window {date.format(new Date(asset.availability.start))} to {date.format(new Date(asset.availability.end))}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                {asset.mine ? <>
                  <span className="self-center text-sm">{asset.published ? "Published" : "Paused"}</span>
                  {canList && <button className={button} onClick={() => setEditor({ mode: "asset", asset })}>Edit asset</button>}
                  {canMove && <button className={button} onClick={() => setEditor({ mode: "move", asset })}>Move asset</button>}
                </> : canBook && <button className={primary} onClick={() => setEditor({ mode: "hire", asset })}>Review hire</button>}
              </div>
            </div>
          </article>)}
          {!visibleAssets.length && <p className="text-sm text-muted-foreground">No assets found.</p>}
        </div>}
        {["requests", "hires", "incoming"].includes(tab) && <div className="grid gap-4 xl:grid-cols-2">
          {visibleBookings.map((booking) => <BookingCard key={booking.id} booking={booking}
            canManage={booking.incoming ? canList : canBook} canMove={canMove}
            onEdit={setEditor} done={() => done("Booking updated")} />)}
          {!visibleBookings.length && <p className="text-sm text-muted-foreground">No hire bookings to show.</p>}
        </div>}
        {tab === "moves" && <div className="grid gap-3">
          {moves.map((move) => <Link key={move.id} to={"/owner/loads/" + move.id} className="app-surface block p-4 hover:border-signal">
            <strong>{move.assetName}</strong> · {statusText(move.direction)} · {statusText(move.status)}
            <p className="text-sm text-muted-foreground">{move.destination} · {move.id}</p>
          </Link>)}
          {!moves.length && <p className="text-sm text-muted-foreground">No asset moves posted.</p>}
        </div>}
      </>}
    </main>
  </AppShell>;
}

function useSubmission() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>, run: (data: FormData) => Promise<unknown>) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await run(data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The request could not be saved.");
    } finally {
      setPending(false);
    }
  };
  return { pending, error, submit };
}

const read = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const quantity = (form: FormData, key: string) => Number(read(form, key));
const number = (key: string, label: string, value?: number | string, step = "1", required = true) =>
  <Label name={label}><input className={field} name={key} type="number" min={step} step={step} required={required} defaultValue={value} /></Label>;

function AssetForm({ asset, done }: { asset?: Asset | undefined; done: () => Promise<void> }) {
  const submission = useSubmission();
  const [type, setType] = useState<AssetType>(asset?.type ?? "ADT");
  const [location, setLocation] = useState<Place | null>(asset?.location ?? null);
  const [photos, setPhotos] = useState(asset?.photos ?? []);
  const [blocked, setBlocked] = useState(asset?.blockedPeriods.map((period) => ({
    start: dateInput(period.start), end: dateInput(period.end),
  })) ?? []);

  return <form className="grid gap-4" onSubmit={(event) => void submission.submit(event, async (form) => {
    if (!location) throw new Error("Select the asset location.");
    const start = read(form, "start");
    const end = read(form, "end");
    if (start >= end || blocked.some((period) => !period.start || !period.end || period.start >= period.end)) {
      throw new Error("Each availability period must end after it starts.");
    }
    const files = form.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
    if (photos.length + files.length > 6) throw new Error("Choose up to six photos.");
    const uploaded = [];
    for (const file of files) uploaded.push((await uploadFile(file, "ASSET_PHOTO")).url);
    await trpc.mutation("assetHire.save", {
      id: asset?.id, type, make: read(form, "make"), model: read(form, "model"), location,
      photos: [...photos, ...uploaded], availability: { start: iso(start), end: iso(end) },
      blockedPeriods: blocked.map((period) => ({ start: iso(period.start), end: iso(period.end) })),
      published: form.has("published"), specifications: read(form, "specifications"),
      ratedPayloadTonnes: quantity(form, "payload") || undefined,
      transportWeightKg: quantity(form, "weight"),
      dimensions: { lengthM: quantity(form, "length"), widthM: quantity(form, "width"), heightM: quantity(form, "height") },
      rate: read(form, "rate"), unit: read(form, "unit"), shiftHours: quantity(form, "shift"),
      minimumUnits: quantity(form, "minimum"), vat: read(form, "vat"),
      operatorIncluded: form.has("operator"), fuelIncluded: form.has("fuel"),
    });
    await done();
  })}>
    <h2 className="text-xl font-bold">{asset ? "Edit asset" : "Add asset"}</h2>
    <div className="grid gap-3 sm:grid-cols-3">
      <Label name="Asset type"><select className={field} value={type} onChange={(e) => setType(e.target.value as AssetType)}>
        {Object.entries(types).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></Label>
      <Label name="Make"><input className={field} name="make" required maxLength={80} defaultValue={asset?.make} /></Label>
      <Label name="Model"><input className={field} name="model" required maxLength={80} defaultValue={asset?.model} /></Label>
    </div>
    <AddressInput placeholder="Asset location" value={location} onSelect={setLocation} />
    <Label name="Specifications"><textarea className={field} name="specifications" maxLength={1000} defaultValue={asset?.specifications} /></Label>
    <div className="grid gap-3 sm:grid-cols-2">
      {["ADT", "MINE_DUMP_TRUCK"].includes(type) && number("payload", "Manufacturer-rated payload (t)", asset?.ratedPayloadTonnes, "0.1")}
      {number("weight", "Transport weight (kg)", asset?.transportWeightKg)}
      {number("length", "Transport length (m)", asset?.dimensions.lengthM, "0.01")}
      {number("width", "Transport width (m)", asset?.dimensions.widthM, "0.01")}
      {number("height", "Transport height (m)", asset?.dimensions.heightM, "0.01")}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {number("rate", "Fixed rate (ZAR)", asset?.rate, "0.01")}
      <Label name="Billing unit"><select className={field} name="unit" defaultValue={asset?.unit ?? "DAY"}>
        <option value="HOUR">Per hour</option><option value="SHIFT">Per shift</option><option value="DAY">Per 24 hours</option>
      </select></Label>
      {number("shift", "Hours per shift", asset?.shiftHours ?? 8)}
      {number("minimum", "Minimum billable units", asset?.minimumUnits ?? 1)}
      <Label name="VAT"><select className={field} name="vat" defaultValue={asset?.vat ?? "excl"}>
        <option value="excl">Rate excludes VAT</option><option value="incl">Rate includes VAT</option>
      </select></Label>
      <div className="grid gap-2 text-sm">
        <label><input type="checkbox" name="operator" defaultChecked={asset?.operatorIncluded} /> Operator included</label>
        <label><input type="checkbox" name="fuel" defaultChecked={asset?.fuelIncluded} /> Fuel included</label>
      </div>
      <DateTime name="Available from (SAST)" fieldName="start" value={dateInput(asset?.availability.start)} />
      <DateTime name="Available until (SAST)" fieldName="end" value={dateInput(asset?.availability.end)} />
    </div>
    <fieldset className="grid gap-3">
      <legend className="font-semibold">Unavailable periods</legend>
      {blocked.map((period, index) => <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
        {(["start", "end"] as const).map((edge) => <Label key={edge} name={edge === "start" ? "Block from (SAST)" : "Block until (SAST)"}>
          <input type="datetime-local" required className={field} value={period[edge]} onChange={(e) =>
            setBlocked(blocked.map((entry, i) => i === index ? { ...entry, [edge]: e.target.value } : entry))} />
        </Label>)}
        <button type="button" className={button} onClick={() => setBlocked(blocked.filter((_, i) => i !== index))}>Remove period</button>
      </div>)}
      <button type="button" className={button + " justify-self-start"} onClick={() => setBlocked([...blocked, { start: "", end: "" }])}>Block dates</button>
    </fieldset>
    {photos.map((photo) => <div className="flex items-center gap-3" key={photo}>
      <img className="h-16 w-24 rounded object-cover" src={photo} alt="Asset" />
      <button className={button} type="button" onClick={() => setPhotos(photos.filter((url) => url !== photo))}>Remove photo</button>
    </div>)}
    <Label name="Asset photos"><input type="file" name="photos" multiple accept="image/*" /></Label>
    <label className="text-sm"><input type="checkbox" name="published" defaultChecked={asset?.published} /> Publish in Asset Hire</label>
    <Submit pending={submission.pending} error={submission.error}>Save asset</Submit>
  </form>;
}

function HireForm({ asset, start, end, done }: { asset: Asset; start: string; end: string; done: () => Promise<void> }) {
  const submission = useSubmission();
  const [site, setSite] = useState<Place | null>(null);
  const [from, setFrom] = useState(start);
  const [until, setUntil] = useState(end);
  const unitHours = { HOUR: 1, SHIFT: asset.shiftHours, DAY: 24 }[asset.unit];
  const units = from && until && from < until
    ? Math.max(asset.minimumUnits, Math.ceil((Date.parse(iso(until)) - Date.parse(iso(from))) / (3_600_000 * unitHours)))
    : 0;

  return <form className="grid gap-4" onSubmit={(event) => void submission.submit(event, async (form) => {
    if (!site || !units || !available(asset, from, until)) throw new Error("Select a worksite and an available hire period.");
    await trpc.mutation("assetHire.request", {
      assetId: asset.id, listingVersion: asset.version, site, start: iso(from), end: iso(until), notes: read(form, "notes"),
    });
    await done();
  })}>
    <h2 className="text-xl font-bold">Hire {asset.make} {asset.model}</h2>
    <p className="text-sm">{asset.supplierName} · {types[asset.type]}</p>
    {asset.photos.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {asset.photos.map((photo) => <img key={photo} src={photo} className="aspect-video rounded-lg object-cover" alt={asset.make + " " + asset.model} />)}
    </div>}
    <AddressInput placeholder="Worksite address" value={site} onSelect={setSite} />
    <div className="grid gap-3 sm:grid-cols-2">
      <DateTime name="Start (SAST)" fieldName="start" value={from} onChange={setFrom} />
      <DateTime name="End (SAST)" fieldName="end" value={until} onChange={setUntil} />
    </div>
    <Label name="Site access and hire instructions"><textarea name="notes" className={field} maxLength={2000} /></Label>
    <div className="rounded-lg border border-border p-4 text-sm">
      <p>{money.format(Number(asset.rate))} per {asset.unit.toLowerCase()} · {unitHours} h per unit · minimum {asset.minimumUnits}</p>
      <p>{asset.operatorIncluded ? "Operator included" : "Operator excluded"} · {asset.fuelIncluded ? "Fuel included" : "Fuel excluded"}</p>
      {units > 0 && <p className="mt-2 font-bold">{units} × {money.format(Number(asset.rate))} = {money.format(Number(asset.rate) * units)} {asset.vat} VAT</p>}
      <p className="mt-2 text-muted-foreground">Transport is priced separately. The asset owner confirms the booking.</p>
    </div>
    <Submit pending={submission.pending} error={submission.error} disabled={!site || !units || !available(asset, from, until)}>Request booking</Submit>
  </form>;
}

function BookingCard({ booking, canManage, canMove, onEdit, done }: {
  booking: Booking; canManage: boolean; canMove: boolean; onEdit: (editor: Editor) => void; done: () => Promise<void>;
}) {
  const submission = useSubmission();
  const action = { REQUESTED: "CONFIRM", CONFIRMED: "START", IN_HIRE: "COMPLETE" }[booking.status];
  return <article className="app-surface space-y-3 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-bold">{booking.assetName}</h2>
      <span className="rounded-full bg-signal/15 px-2 py-1 text-xs font-semibold capitalize">{statusText(booking.status)}</span>
    </div>
    <p className="text-sm">{booking.incoming ? booking.renterName : booking.supplierName}</p>
    <p className="text-sm"><MapPin className="mr-1 inline size-4" />{booking.site.label}</p>
    <p className="text-sm"><CalendarDays className="mr-1 inline size-4" />{date.format(new Date(booking.start))} to {date.format(new Date(booking.end))}</p>
    <p className="text-sm font-semibold">{booking.units} × {money.format(Number(booking.terms.rate))} / {booking.terms.unit.toLowerCase()} · {money.format(Number(booking.total))} {booking.terms.vat} VAT</p>
    <p className="text-sm">{booking.terms.operatorIncluded ? "Operator included" : "Operator excluded"} · {booking.terms.fuelIncluded ? "Fuel included" : "Fuel excluded"}</p>
    {booking.notes && <p className="whitespace-pre-wrap text-sm">{booking.notes}</p>}
    <details className="text-sm"><summary className="cursor-pointer">Booking history</summary>
      <ul className="mt-2 space-y-1">{booking.history.map((item) => <li key={item.at}>
        {date.format(new Date(item.at))} · {statusText(item.status)}{item.reason && " · " + item.reason}
      </li>)}</ul>
    </details>
    <div className="flex flex-wrap items-center gap-2">
      {canManage && booking.incoming && action && <form onSubmit={(event) => void submission.submit(event, async () => {
        await trpc.mutation("assetHire.transition", { id: booking.id, action });
        await done();
      })}><Submit pending={submission.pending} error={submission.error}>{action === "CONFIRM" ? "Confirm hire" : action === "START" ? "Mark in hire" : "Complete hire"}</Submit></form>}
      {canManage && booking.incoming && booking.status === "REQUESTED" &&
        <button className={button} onClick={() => onEdit({ mode: "reason", action: "DECLINE", booking })}>Decline</button>}
      {canManage && ["REQUESTED", "CONFIRMED"].includes(booking.status) &&
        <button className={button} onClick={() => onEdit({ mode: "reason", action: "CANCEL", booking })}>Cancel hire</button>}
      {canMove && ["CONFIRMED", "IN_HIRE", "COMPLETED"].includes(booking.status) &&
        <button className={button} onClick={() => onEdit({ mode: "move", booking })}>Arrange transport</button>}
    </div>
  </article>;
}

function ActionForm({ booking, action, done }: {
  booking: Booking; action: "CANCEL" | "DECLINE"; done: () => Promise<void>;
}) {
  const submission = useSubmission();
  return <form className="grid gap-3" onSubmit={(event) => void submission.submit(event, async (form) => {
    await trpc.mutation("assetHire.transition", { id: booking.id, action, reason: read(form, "reason") });
    await done();
  })}>
    <Label name={action === "DECLINE" ? "Reason for declining" : "Reason for cancellation"}>
      <textarea className={field} name="reason" required maxLength={1000} />
    </Label>
    <Submit pending={submission.pending} error={submission.error}>{action === "DECLINE" ? "Decline hire" : "Cancel hire"}</Submit>
  </form>;
}

function MoveForm({ asset, booking, done }: { asset?: Asset | undefined; booking?: Booking | undefined; done: () => Promise<void> }) {
  const submission = useSubmission();
  const [direction, setDirection] = useState<"DELIVERY" | "COLLECTION">("DELIVERY");
  const [origin, setOrigin] = useState(asset?.location ?? booking?.assetLocation ?? null);
  const [destination, setDestination] = useState(booking?.site ?? null);
  const terms = booking?.terms ?? asset!;
  const existingMove = booking?.moves?.[direction];
  const estimate = useQuery({
    queryKey: ["asset-move-estimate", origin, destination, terms.transportWeightKg],
    enabled: !!origin && !!destination && !existingMove && terms.transportWeightKg <= 200000,
    queryFn: async () => priceLoadMoney(await roadDistanceKm(origin!, destination!), terms.transportWeightKg, "ABNORMAL"),
  });

  return <form className="grid gap-4" onSubmit={(event) => void submission.submit(event, async (form) => {
    if (!origin || !destination) throw new Error("Select a pickup and destination address.");
    await trpc.mutation("assetHire.move", {
      assetId: asset?.id ?? booking?.assetId, bookingId: booking?.id, origin, destination, direction,
      pickupWindow: { from: iso(read(form, "pickup")), to: iso(read(form, "pickupEnd")) },
      deliveryBy: iso(read(form, "delivery")), notes: read(form, "notes"),
    });
    await done();
  })}>
    <h2 className="text-xl font-bold">Move {booking?.assetName ?? [asset?.make, asset?.model].join(" ")}</h2>
    <p className="text-sm">Transport weight {terms.transportWeightKg.toLocaleString("en-ZA")} kg · {terms.dimensions.lengthM} × {terms.dimensions.widthM} × {terms.dimensions.heightM} m</p>
    {booking && <Label name="Transport leg"><select className={field} value={direction} onChange={(e) => {
      const collection = e.target.value === "COLLECTION";
      setDirection(collection ? "COLLECTION" : "DELIVERY");
      setOrigin(collection ? booking.site : booking.assetLocation ?? null);
      setDestination(collection ? booking.assetLocation ?? null : booking.site);
    }}><option value="DELIVERY">Deliver to worksite</option><option value="COLLECTION">Collect from worksite</option></select></Label>}
    {terms.transportWeightKg > 200000 && <p className="text-sm text-danger">This asset exceeds the freight board’s 200 t limit.</p>}
    {existingMove ? <p className="text-sm">This leg has already been posted · {existingMove}</p> : <>
      <AddressInput value={origin} onSelect={setOrigin} placeholder="Pickup address" />
      <AddressInput value={destination} onSelect={setDestination} placeholder="Destination address" />
      <div className="grid gap-3 sm:grid-cols-3">
        <DateTime name="Pickup starts (SAST)" fieldName="pickup" />
        <DateTime name="Pickup ends (SAST)" fieldName="pickupEnd" />
        <DateTime name="Deliver by (SAST)" fieldName="delivery" />
      </div>
      <Label name="Loading and unloading requirements"><textarea className={field} name="notes" maxLength={2000} /></Label>
      {estimate.data && <p className="font-semibold">Transport estimate {money.format(estimate.data.amount)} {estimate.data.vat} VAT</p>}
      <p className="text-sm text-muted-foreground">Transport is priced separately. Matching checks carrier payload and declared dimensions.</p>
      <Submit pending={submission.pending} error={submission.error} disabled={!origin || !destination || terms.transportWeightKg > 200000}>Post asset move</Submit>
    </>}
  </form>;
}

function Submit({ children, pending, error, disabled }: {
  children: ReactNode; pending: boolean; error: string; disabled?: boolean;
}) {
  return <div>
    {error && <p className="mb-2 text-sm text-danger" role="alert">{error}</p>}
    <button type="submit" className={primary} disabled={pending || disabled}>{pending ? "Saving…" : children}</button>
  </div>;
}
