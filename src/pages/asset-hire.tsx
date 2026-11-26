import { LoadingIndicator } from "@/components/tamp/LoadingIndicator";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown, ChevronLeft, ChevronRight, Forklift, LayoutGrid, List, MoreHorizontal, Pencil, Plus, Trash2, Truck, Upload, X } from "lucide-react";
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
type HandoverStage = "DELIVERY" | "RETURN";
type HandoverSide = "OWNER" | "RENTER";
type HandoverReport = {
  condition: "GOOD" | "DAMAGE_FOUND"; meterHours?: number | null; notes: string;
  photos: string[]; recordedAt: string;
};
type RentalInvoice = {
  number: string; issuedAt: string; subtotal: string; vatRate: string; vat: string;
  total: string; paid: string; balance: string; status: "OUTSTANDING" | "PARTIALLY_PAID" | "PAID";
  payments: { id: string; reference: string; amount: string; recordedAt: string }[];
};
type Booking = Period & {
  id: string; assetId: string; assetName: string; supplierName: string; renterName: string;
  site: Place; assetLocation?: Place; status: string; total: string; units: number; terms: Terms; incoming: boolean;
  invoice?: RentalInvoice;
  transitionBlocker?: string | null;
  notes: string; history: { status: string; at: string; reason?: string }[];
  handovers?: Partial<Record<HandoverStage, Partial<Record<HandoverSide, HandoverReport>>>>;
  moves?: Partial<Record<"DELIVERY" | "COLLECTION", string>>;
};
type Move = { id: string; assetName: string; direction: string; destination: string; status: string };
type Workspace = { assets: Asset[]; bookings: Booking[]; moves: Move[] };
type Editor =
  | { mode: "asset"; asset?: Asset }
  | { mode: "unpublish"; asset: Asset }
  | { mode: "hire"; asset: Asset }
  | { mode: "handover"; booking: Booking; stage: HandoverStage }
  | { mode: "move"; asset?: Asset; booking?: Booking }
  | { mode: "reason"; action: "CANCEL" | "DECLINE"; booking: Booking };

const money = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });
const date = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" });
const dateInput = (value?: string) => value
  ? new Date(new Date(value).getTime() + 7_200_000).toISOString().slice(0, 16)
  : "";
const iso = (value: string) => new Date(value + "+02:00").toISOString();
const statusText = (value: string) => value === "IN_HIRE" ? "In rental" : value.toLowerCase().replaceAll("_", " ");
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
  const [params] = useSearchParams();
  const bookingId = params.get("booking");
  return <AssetHireWorkspace key={bookingId ?? "catalogue"} bookingId={bookingId} />;
}

const requestStatuses = ["REQUESTED", "DECLINED", "CANCELLED"];

function AssetHireWorkspace({ bookingId }: { bookingId: string | null }) {
  const { authParty, role, refreshDomain } = useTamp();
  const [params, setParams] = useSearchParams();
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
  const query = useQuery({
    queryKey: key,
    queryFn: () => trpc.query<Workspace>("assetHire.list"),
    refetchInterval: 15_000,
  });
  const { assets = [], bookings = [], moves = [] } = query.data ?? {};
  const linkedBooking = bookingId ? bookings.find((booking) => booking.id === bookingId) : undefined;
  const tab = linkedBooking
    ? linkedBooking.incoming ? "incoming" : requestStatuses.includes(linkedBooking.status) ? "requests" : "hires"
    : params.get("view") ?? "browse";
  const tableView = params.get("layout") === "table";
  const assetTab = tab === "browse" || tab === "assets";
  const rentalTab = ["requests", "hires", "incoming"].includes(tab);
  const acceptedRentals = bookings.filter((booking) => !booking.incoming && ["CONFIRMED", "IN_HIRE"].includes(booking.status));
  const pendingIncoming = bookings.filter((booking) => booking.incoming && booking.status === "REQUESTED").length;
  const tabs: [string, string][] = [
    ["browse", "Browse assets"], ["requests", "My requests"], ["hires", "My rentals"],
    ["moves", "Asset moves"], ...(role === "TRANSPORTER" ? ([["assets", "My assets"], ["incoming", "Incoming requests"], ["calendar", "Rental calendar"]] as [string, string][]) : []),
  ];
  const visibleAssets = assets.filter((asset) => tab === "assets" ? asset.mine : asset.published && !asset.mine
    && (!type || asset.type === type) && (!operator || asset.operatorIncluded)
    && asset.location.label.toLowerCase().includes(location.trim().toLowerCase())
    && [asset.make, asset.model, asset.specifications, asset.ratedPayloadTonnes ? asset.ratedPayloadTonnes + " t" : ""]
      .join(" ").toLowerCase().includes(specification.trim().toLowerCase())
    && available(asset, start, end));
  const visibleBookings = bookings.filter((booking) => {
    if (bookingId) return booking.id === bookingId;
    if (tab === "incoming") return booking.incoming;
    if (booking.incoming) return false;
    return tab === "requests" ? requestStatuses.includes(booking.status)
      : ["CONFIRMED", "IN_HIRE", "COMPLETED"].includes(booking.status);
  });

  const changeTab = (view: string) => {
    setEditor(undefined);
    setParams({ view, ...(tableView ? { layout: "table" } : {}) });
  };
  const done = async (message: string, view = tab) => {
    await client.invalidateQueries({ queryKey: key });
    changeTab(view);
    toast.success(message);
  };
  const assetActions = (asset: Asset) => asset.mine
    ? (canList || canMove) && <ActionsMenu label={`Actions for ${asset.make} ${asset.model}`}>
        {canList && <Dropdown.Item className={menuItem} onSelect={() => setEditor({ mode: "asset", asset })}>
          <Pencil className="size-4" aria-hidden /> Edit asset
        </Dropdown.Item>}
        {canMove && <Dropdown.Item className={menuItem} onSelect={() => setEditor({ mode: "move", asset })}>
          <Truck className="size-4" aria-hidden /> Move asset
        </Dropdown.Item>}
        {canList && asset.published && <Dropdown.Item className={menuItem + " text-danger"} onSelect={() => setEditor({ mode: "unpublish", asset })}>
          <Trash2 className="size-4" aria-hidden /> Remove from catalogue
        </Dropdown.Item>}
      </ActionsMenu>
    : canBook && <button className={primary} onClick={() => setEditor({ mode: "hire", asset })}>Review rental</button>;

  return <AppShell>
    <PageHeader title="Asset Rental" actions={canList && <button className={primary} onClick={() => setEditor({ mode: "asset" })}>
      <Plus className="mr-1 inline size-4" /> Add asset
    </button>} />
    <main className="p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <nav aria-label="Asset Rental" className="flex flex-wrap gap-2">
        {tabs.map(([value, label]) => <button key={value} className={tab === value ? primary : button}
          onClick={() => changeTab(value)} aria-current={tab === value ? "page" : undefined}>
          {label}
          {value === "hires" && acceptedRentals.length > 0 && <span className="ml-2 rounded-full bg-positive/15 px-2 py-0.5 text-xs font-bold text-positive">
            <span className="sr-only">Accepted active rentals </span>{acceptedRentals.length}
          </span>}
          {value === "incoming" && pendingIncoming > 0 && <span className="ml-2 rounded-full bg-signal/20 px-2 py-0.5 text-xs">
            <span className="sr-only">Pending requests </span>{pendingIncoming}
          </span>}
        </button>)}
      </nav>
      {!linkedBooking && !editor && tab !== "calendar" && <div role="group" aria-label="Results layout" className="inline-flex gap-1 rounded-lg border border-border bg-card p-1">
        {([["cards", "Cards", LayoutGrid], ["table", "Table", List]] as const).map(([layout, label, Icon]) =>
          <button key={layout} type="button" aria-pressed={tableView === (layout === "table")}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold aria-pressed:bg-signal aria-pressed:text-signal-foreground"
            onClick={() => setParams((current) => {
              const next = new URLSearchParams(current);
              if (layout === "table") next.set("layout", "table");
              else next.delete("layout");
              return next;
            })}><Icon className="size-4" aria-hidden />{label}</button>)}
      </div>}
      </div>
      {editor ? <div className="app-surface max-w-4xl p-4 sm:p-6">
        <button className={button + " mb-4"} onClick={() => setEditor(undefined)}>Cancel</button>
        {editor.mode === "asset" && <AssetForm asset={editor.asset} done={() => done("Asset saved", tab === "calendar" ? "calendar" : "assets")} />}
        {editor.mode === "unpublish" && <UnpublishAsset asset={editor.asset} done={() => done("Asset removed from catalogue", "assets")} />}
        {editor.mode === "handover" && <HandoverForm booking={editor.booking} stage={editor.stage} done={async () => {
          await client.invalidateQueries({ queryKey: key });
          setEditor(undefined);
          toast.success("Handover recorded");
        }} />}
        {editor.mode === "hire" && <HireForm asset={editor.asset} start={start} end={end} done={() => done("Rental request sent", "requests")} />}
        {editor.mode === "move" && <MoveForm asset={editor.asset} booking={editor.booking} done={async () => { await refreshDomain(); await done("Asset transport posted", "moves"); }} />}
        {editor.mode === "reason" && <ActionForm booking={editor.booking} action={editor.action} done={() => done("Rental updated")} />}
      </div> : query.isPending ? <LoadingIndicator /> : query.isError ? <p role="alert">{query.error.message}</p> : bookingId && !linkedBooking
        ? <p role="status" className="text-sm text-muted-foreground">
            This rental is unavailable in your current organisation. Select the organisation that received the notification.
          </p>
        : <>
        {tab === "calendar" && role === "TRANSPORTER" && <RentalCalendar assets={assets.filter((asset) => asset.mine)}
          bookings={bookings.filter((booking) => booking.incoming)} onEdit={canList ? (asset) => setEditor({ mode: "asset", asset }) : undefined} />}
        {tab === "browse" && <div className="app-surface mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Label name="Asset type"><select className={field} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All asset types</option>
            {Object.entries(types).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select></Label>
          <Label name="Location"><input className={field} value={location} onChange={(e) => setLocation(e.target.value)} /></Label>
          <Label name="Rental starts (SAST)"><input className={field} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Label>
          <Label name="Rental ends (SAST)"><input className={field} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Label>
          <Label name="Make, model or specification"><input className={field} value={specification} onChange={(e) => setSpecification(e.target.value)} /></Label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={operator} onChange={(e) => setOperator(e.target.checked)} /> Operator included</label>
        </div>}
        {assetTab && tableView && <RentalTable title="Assets" columns={["Asset", "Owner and location", "Rate", "Availability", "Actions"]} empty="No assets found.">
          {visibleAssets.map((asset) => <tr key={asset.id}>
            <td><div className="flex items-center gap-3"><AssetImage asset={asset} className="h-12 w-20 shrink-0 rounded-md" />
              <div><strong>{asset.make} {asset.model}</strong><p className="text-muted-foreground">{types[asset.type]}</p>
                {asset.ratedPayloadTonnes && <p className="text-muted-foreground">{asset.ratedPayloadTonnes} t rated payload</p>}
              </div></div></td>
            <td><strong>{asset.supplierName}</strong><p className="max-w-52 text-muted-foreground">{asset.location.label}</p></td>
            <td><strong>{money.format(Number(asset.rate))} / {asset.unit.toLowerCase()}</strong><p className="text-muted-foreground">{asset.vat}. VAT · {asset.operatorIncluded ? "Operator included" : "Operator excluded"}</p></td>
            <td><p>{date.format(new Date(asset.availability.start))}</p><p className="text-muted-foreground">Until {date.format(new Date(asset.availability.end))}</p>
              {asset.mine && <p>{asset.published ? "Published" : "Paused"}</p>}</td>
            <td>{assetActions(asset)}</td>
          </tr>)}
        </RentalTable>}
        {assetTab && !tableView && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleAssets.map((asset) => <article className="app-surface overflow-hidden" key={asset.id}>
            <AssetImage asset={asset} className="h-40 w-full" />
            <div className="space-y-2 p-4">
              <p className="text-xs text-muted-foreground">{types[asset.type]}</p>
              <h2 className="text-lg font-bold">{asset.make} {asset.model}</h2>
              <p className="text-sm">{money.format(Number(asset.rate))} / {asset.unit.toLowerCase()} · {asset.vat} VAT</p>
              <p className="text-sm text-muted-foreground">{asset.supplierName} · {asset.location.label}</p>
              {asset.ratedPayloadTonnes && <p className="text-sm">{asset.ratedPayloadTonnes} t rated payload</p>}
              {asset.specifications && <p className="whitespace-pre-wrap text-sm">{asset.specifications}</p>}
              <p className="text-xs text-muted-foreground">{asset.operatorIncluded ? "Operator included" : "Operator excluded"} · {asset.fuelIncluded ? "Fuel included" : "Fuel excluded"}</p>
              <p className="text-xs text-muted-foreground">Rental window {date.format(new Date(asset.availability.start))} to {date.format(new Date(asset.availability.end))}</p>
              {asset.mine && <p className="text-sm">{asset.published ? "Published" : "Paused"}</p>}
              <div className="pt-2">{assetActions(asset)}</div>
            </div>
          </article>)}
          {!visibleAssets.length && <p className="text-sm text-muted-foreground">No assets found.</p>}
        </div>}
        {linkedBooking && <button className={button + " mb-4"} onClick={() => changeTab(params.get("view") === "calendar" ? "calendar" : tab)}>
          {params.get("view") === "calendar" ? "Back to rental calendar" : tab === "incoming" ? "View all incoming requests" : tab === "requests" ? "View my requests" : "View my rentals"}
        </button>}
        {tab === "requests" && !linkedBooking && acceptedRentals.length > 0 && <div role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-positive/25 bg-positive/5 p-4">
          <div><p className="text-sm font-bold">{acceptedRentals.length === 1 ? "Your accepted request is now in My rentals" : `${acceptedRentals.length} accepted requests are now in My rentals`}</p>
            <p className="mt-1 text-xs text-muted-foreground">Continue delivery, rental and return arrangements from there.</p></div>
          <button type="button" className={primary} onClick={() => changeTab("hires")}>View my rentals</button>
        </div>}
        {rentalTab && tableView && !linkedBooking && <RentalTable title="Asset rentals" columns={["Asset and reference", "Organisation", "Worksite", "Rental period (SAST)", "Total", "Status", "Actions"]} empty="No rentals to show.">
          {visibleBookings.map((booking) => <tr key={booking.id}>
            <td><strong>{booking.assetName}</strong><p className="break-all font-mono text-xs text-muted-foreground">{booking.id}</p></td>
            <td>{booking.incoming ? booking.renterName : booking.supplierName}</td><td className="max-w-52">{booking.site.label}</td>
            <td className="whitespace-nowrap">{date.format(new Date(booking.start))}<br />{date.format(new Date(booking.end))}</td>
            <td className="whitespace-nowrap font-semibold">{money.format(Number(booking.total))} {booking.terms.vat}. VAT</td>
            <td><p className="capitalize">{statusText(booking.status)}</p>
              {booking.invoice && <p className="text-xs capitalize text-muted-foreground">{statusText(booking.invoice.status)}</p>}
            </td>
            <td><Link className={button + " inline-flex items-center whitespace-nowrap"} to={`?booking=${encodeURIComponent(booking.id)}&layout=table`}>View rental</Link></td>
          </tr>)}
        </RentalTable>}
        {rentalTab && (!tableView || linkedBooking) && <div className="grid items-start gap-6 xl:grid-cols-2">
          {visibleBookings.map((booking) => <BookingCard key={booking.id} booking={booking}
            canManage={booking.incoming ? canList : canBook} canMove={canMove}
            onEdit={setEditor} done={() => done("Rental updated")} />)}
          {!visibleBookings.length && <p className="text-sm text-muted-foreground">No rentals to show.</p>}
        </div>}
        {tab === "moves" && tableView && <RentalTable title="Asset moves" columns={["Asset", "Transport leg", "Destination", "Reference", "Status", "Actions"]} empty="No asset moves posted.">
          {moves.map((move) => <tr key={move.id}>
            <td className="font-semibold">{move.assetName}</td>
            <td className="capitalize">{statusText(move.direction)}</td>
            <td>{move.destination}</td><td className="break-all font-mono text-xs">{move.id}</td>
            <td className="capitalize">{statusText(move.status)}</td>
            <td><Link className={button + " inline-flex items-center whitespace-nowrap"} to={"/owner/loads/" + move.id}>View move</Link></td>
          </tr>)}
        </RentalTable>}
        {tab === "moves" && !tableView && <div className="grid gap-3">
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

const calendarMonth = new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" });
const calendarDay = new Intl.DateTimeFormat("en-ZA", { dateStyle: "full", timeZone: "UTC" });

function RentalCalendar({ assets, bookings, onEdit }: {
  assets: Asset[]; bookings: Booking[]; onEdit: ((asset: Asset) => void) | undefined;
}) {
  const today = dateInput(new Date().toISOString()).slice(0, 10);
  const [month, setMonth] = useState(() => new Date(today.slice(0, 7) + "-01T00:00:00Z"));
  const [selection, setSelection] = useState(today);
  const [assetId, setAssetId] = useState("");
  const selectedAsset = assets.find((asset) => asset.id === assetId);
  const calendarAssets = selectedAsset ? [selectedAsset] : assets;
  const entries = [
    ...bookings.filter((rental) => (!selectedAsset || rental.assetId === selectedAsset.id)
      && ["REQUESTED", "CONFIRMED", "IN_HIRE", "COMPLETED"].includes(rental.status)).map((rental) => ({
      id: rental.id, start: rental.start, end: rental.end, name: rental.assetName,
      kind: rental.status === "REQUESTED" ? "Pending" : rental.status === "COMPLETED" ? "Completed" : "Reserved",
      href: `?booking=${encodeURIComponent(rental.id)}&view=calendar`,
    })),
    ...calendarAssets.flatMap((asset) => asset.blockedPeriods.map((period, index) => ({
      ...period, id: `${asset.id}-block-${index}`, name: `${asset.make} ${asset.model}`, kind: "Blocked", href: "",
    }))),
  ];
  const entriesFor = (day: string) => {
    const start = iso(day + "T00:00");
    const end = new Date(Date.parse(start) + 86_400_000).toISOString();
    return entries.filter((entry) => overlap(entry, { start, end }));
  };
  const offset = (month.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const selectedEntries = entriesFor(selection);
  const navigateMonth = (delta: number) => {
    const next = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + delta, 1));
    setMonth(next);
    setSelection(next.toISOString().slice(0, 10));
  };
  const color: Record<string, string> = {
    Pending: "bg-signal/20 text-foreground", Reserved: "bg-primary/15 text-foreground",
    Completed: "bg-muted text-muted-foreground", Blocked: "bg-danger/10 text-foreground",
  };
  return <section className="app-surface space-y-4 p-4 sm:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-2">
        <button className={button} aria-label="Previous month" onClick={() => navigateMonth(-1)}><ChevronLeft className="size-4" /></button>
        <h2 className="min-w-32 text-center font-bold">{calendarMonth.format(month)}</h2>
        <button className={button} aria-label="Next month" onClick={() => navigateMonth(1)}><ChevronRight className="size-4" /></button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Label name="Filter assets"><select className={field} value={assetId} onChange={(event) => setAssetId(event.target.value)}>
          <option value="">All my assets</option>
          {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.make} {asset.model}</option>)}
        </select></Label>
        {selectedAsset && onEdit && <button className={button} onClick={() => onEdit(selectedAsset)}>Edit availability</button>}
      </div>
    </div>
    <ul aria-label="Calendar legend" className="flex flex-wrap gap-2 text-xs">
      {Object.entries(color).map(([kind, classes]) => <li key={kind} className={`rounded px-2 py-1 ${classes}`}>{kind}</li>)}
    </ul>
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) =>
        <span key={day} className="bg-muted py-2 text-center text-xs font-semibold">{day}</span>)}
      {Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, index) => {
        const number = index - offset + 1;
        if (number < 1 || number > daysInMonth) return <span key={index} className="bg-muted" />;
        const day = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), number));
        const value = day.toISOString().slice(0, 10);
        const items = entriesFor(value);
        const kinds = [...new Set(items.map((item) => item.kind))];
        return <button key={index} type="button" aria-pressed={value === selection}
          aria-label={`${calendarDay.format(day)}, ${items.length} calendar entries`}
          onClick={() => setSelection(value)}
          className="flex min-h-14 flex-col items-center gap-1 bg-card p-1 text-xs font-semibold aria-pressed:bg-signal/15 sm:min-h-20 sm:items-start sm:p-2">
          {number}
          <span className="flex flex-wrap justify-center gap-1 sm:justify-start">{kinds.map((kind) =>
            <span key={kind} className={`rounded px-1 text-[10px] ${color[kind]}`}>
              <span className="sm:hidden">{kind[0]}</span><span className="hidden sm:inline">{kind}</span>
            </span>)}</span>
        </button>;
      })}
    </div>
    <div>
      <h3 className="mb-2 text-sm font-bold">{calendarDay.format(new Date(selection + "T00:00:00Z"))}</h3>
      {!selectedEntries.length && <p className="text-sm text-muted-foreground">No rental requests, reservations or blocked periods for this day.</p>}
      <ul className="divide-y divide-border">
        {selectedEntries.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <div><strong>{entry.name}</strong><p className="text-xs text-muted-foreground">{date.format(new Date(entry.start))} to {date.format(new Date(entry.end))}</p></div>
          <span className={`rounded px-2 py-1 text-xs font-semibold ${color[entry.kind]}`}>{entry.kind}</span>
          {entry.href && <Link className="text-sm font-semibold underline" to={entry.href}>View rental</Link>}
        </li>)}
      </ul>
    </div>
  </section>;
}

const menuItem = "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted";

function ActionsMenu({ label, children }: { label: string; children: ReactNode }) {
  return <Dropdown.Root>
    <Dropdown.Trigger className={button + " inline-grid min-w-10 place-items-center p-0"} aria-label={label}>
      <MoreHorizontal className="size-5" aria-hidden />
    </Dropdown.Trigger>
    <Dropdown.Portal>
      <Dropdown.Content align="end" sideOffset={6} className="z-[100] min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
        {children}
      </Dropdown.Content>
    </Dropdown.Portal>
  </Dropdown.Root>;
}

function UnpublishAsset({ asset, done }: { asset: Asset; done: () => Promise<void> }) {
  const submission = useSubmission();
  return <form className="grid gap-4" onSubmit={(event) => void submission.submit(event, async () => {
    const { id, type, make, model, location, availability, blockedPeriods, photos, specifications,
      ratedPayloadTonnes, transportWeightKg, dimensions, rate, unit, shiftHours,
      minimumUnits, vat, operatorIncluded, fuelIncluded } = asset;
    await trpc.mutation("assetHire.save", {
      id, type, make, model, location, availability, blockedPeriods, photos, specifications,
      ratedPayloadTonnes, transportWeightKg, dimensions, rate, unit, shiftHours,
      minimumUnits, vat, operatorIncluded, fuelIncluded, published: false,
    });
    await done();
  })}>
    <h2 className="text-xl font-bold">Remove {asset.make} {asset.model} from the catalogue?</h2>
    <p className="text-sm text-muted-foreground">This pauses the listing. Existing rentals stay on record. Publish the asset again to accept new requests or confirm pending ones.</p>
    <Submit pending={submission.pending} error={submission.error}>Remove from catalogue</Submit>
  </form>;
}

function RentalTable({ title, columns, empty, children }: {
  title: string; columns: string[]; empty: string; children: ReactNode[];
}) {
  return <div className="app-surface overflow-x-auto" role="region" aria-label={title} tabIndex={0}>
    <table className="w-full min-w-[660px] text-left text-sm [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-3">
      <caption className="sr-only">{title}</caption>
      <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground"><tr>
        {columns.map((column) => <th key={column} scope="col" className="px-3 py-3">{column}</th>)}
      </tr></thead>
      <tbody>{children.length ? children : <tr><td colSpan={columns.length} className="text-muted-foreground">{empty}</td></tr>}</tbody>
    </table>
  </div>;
}

function AssetImage({ asset, className }: { asset: Asset; className: string }) {
  const [failedPhoto, setFailedPhoto] = useState<string>();
  const photo = asset.photos[0];
  const uploaded = !!photo && failedPhoto !== photo;
  return <img className={`${className} bg-[#eeeeee] ${uploaded ? "object-cover" : "object-contain"}`}
    src={uploaded ? photo : `${import.meta.env.BASE_URL}asset-rental/${asset.type.toLowerCase()}.webp`}
    alt={uploaded ? `${asset.make} ${asset.model}` : `Illustration of ${types[asset.type]}`}
    loading="lazy" onError={uploaded ? () => setFailedPhoto(photo) : undefined} />;
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
  const assetPhotoInput = useRef<HTMLInputElement>(null);
  const [selectedPhotoNames, setSelectedPhotoNames] = useState<string[]>([]);
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
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-semibold">Asset photos</legend>
      <input ref={assetPhotoInput} type="file" name="photos" multiple accept="image/*" hidden
        onChange={(event) => setSelectedPhotoNames(Array.from(event.currentTarget.files ?? [], (file) => file.name))} />
      <button type="button" className={primary + " flex w-fit items-center gap-2"}
        disabled={submission.pending} onClick={() => assetPhotoInput.current?.click()}>
        <Upload className="size-4" aria-hidden="true" />{selectedPhotoNames.length ? "Change photos" : "Upload photos"}
      </button>
      <p role="status" className="break-words text-xs text-muted-foreground">
        {selectedPhotoNames.length ? selectedPhotoNames.join(", ") : "No photos selected"}
      </p>
    </fieldset>
    <label className="text-sm"><input type="checkbox" name="published" defaultChecked={asset?.published} /> Publish in Asset Rental</label>
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
    if (!site || !units || !available(asset, from, until)) throw new Error("Select a worksite and an available rental period.");
    await trpc.mutation("assetHire.request", {
      assetId: asset.id, listingVersion: asset.version, site, start: iso(from), end: iso(until), notes: read(form, "notes"),
    });
    await done();
  })}>
    <h2 className="text-xl font-bold" >Rent {asset.make} {asset.model}</h2>
    <p className="text-sm">{asset.supplierName} · {types[asset.type]}</p>
    {asset.photos.length === 0 ? <AssetImage asset={asset} className="h-44 w-full rounded-lg" /> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {asset.photos.map((photo) => <img key={photo} src={photo} className="aspect-video rounded-lg object-cover" alt={asset.make + " " + asset.model} />)}
    </div>}
    <AddressInput placeholder="Worksite address" value={site} onSelect={setSite} />
    <div className="grid gap-3 sm:grid-cols-2">
      <DateTime name="Start (SAST)" fieldName="start" value={from} onChange={setFrom} />
      <DateTime name="End (SAST)" fieldName="end" value={until} onChange={setUntil} />
    </div>
    <Label name="Site access and rental instructions"><textarea name="notes" className={field} maxLength={2000} /></Label>
    <div className="rounded-lg border border-border p-4 text-sm">
      <p>{money.format(Number(asset.rate))} per {asset.unit.toLowerCase()} · {unitHours} h per unit · minimum {asset.minimumUnits}</p>
      <p>{asset.operatorIncluded ? "Operator included" : "Operator excluded"} · {asset.fuelIncluded ? "Fuel included" : "Fuel excluded"}</p>
      {units > 0 && <p className="mt-2 font-bold">{units} × {money.format(Number(asset.rate))} = {money.format(Number(asset.rate) * units)} {asset.vat} VAT</p>}
      <p className="mt-2 text-muted-foreground">Transport is priced separately. The asset owner confirms the rental.</p>
    </div>
    <Submit pending={submission.pending} error={submission.error} disabled={!site || !units || !available(asset, from, until)}>Request rental</Submit>
  </form>;
}

function BookingCard({ booking, canManage, canMove, onEdit, done }: {
  booking: Booking; canManage: boolean; canMove: boolean; onEdit: (editor: Editor) => void; done: () => Promise<void>;
}) {
  const submission = useSubmission();
  const action = { REQUESTED: "CONFIRM", CONFIRMED: "START", IN_HIRE: "COMPLETE" }[booking.status];
  const unit = booking.terms.unit.toLowerCase();
  const finalStatus = ["DECLINED", "CANCELLED"].includes(booking.status);
  const documentLabel = booking.status === "REQUESTED" ? "Rental request" : "Asset rental";
  const label = "block text-[10px] font-black uppercase tracking-widest opacity-75";

  return <article className="min-w-0 max-w-3xl overflow-hidden rounded-lg border border-paper-foreground/10 bg-paper text-paper-foreground shadow-lg">
    <header className="border-b-2 border-dashed border-paper-foreground/20 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold uppercase italic tracking-tighter">{documentLabel}</h2>
          <p className="mt-1 break-all font-mono text-[11px] opacity-75">{booking.id}</p>
        </div>
        <span className={`rounded border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider ${
          finalStatus ? "border-paper-foreground/20 bg-paper-foreground/5" : "border-signal/60 bg-signal/20"
        }`}>{statusText(booking.status)}</span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div className="min-w-0"><dt className={label}>Asset owner</dt><dd className="mt-1 break-words font-bold">{booking.supplierName}</dd></div>
        <div className="min-w-0"><dt className={label}>Renter</dt><dd className="mt-1 break-words font-bold">{booking.renterName}</dd></div>
      </dl>
    </header>

    <div className="space-y-4 px-4 py-5 sm:px-6">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="sm:col-span-2"><dt className={label}>Worksite</dt><dd className="mt-1 break-words">{booking.site.label}</dd></div>
        <div><dt className={label}>Rental starts (SAST)</dt><dd className="mt-1 font-mono text-xs">{date.format(new Date(booking.start))}</dd></div>
        <div><dt className={label}>Rental ends (SAST)</dt><dd className="mt-1 font-mono text-xs">{date.format(new Date(booking.end))}</dd></div>
      </dl>

      <div className="overflow-hidden rounded border border-paper-foreground/15">
        <div className="flex items-start justify-between gap-3 px-3 py-3 text-sm">
          <div className="min-w-0">
            <span className={label}>Asset rental</span>
            <p className="mt-1 break-words font-bold">{booking.assetName}</p>
            <p className="mt-1 font-mono text-xs">{booking.units} {unit}{booking.units === 1 ? "" : "s"} × {money.format(Number(booking.terms.rate))}</p>
          </div>
          <Forklift className="size-5 shrink-0 opacity-60" aria-hidden />
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-dashed border-paper-foreground/20 bg-signal/15 px-3 py-3">
          <span className={label}>Rental total</span>
          <span className="font-mono text-lg font-extrabold tabular-nums">
            {money.format(Number(booking.total))} <span className="whitespace-nowrap text-xs font-semibold">{booking.terms.vat}. VAT</span>
          </span>
        </div>
      </div>

      <p className="text-xs opacity-80">{booking.terms.operatorIncluded ? "Operator included" : "Operator excluded"} · {booking.terms.fuelIncluded ? "Fuel included" : "Fuel excluded"}</p>
      {booking.notes && <div><p className={label}>Site instructions</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{booking.notes}</p></div>}
      {["CONFIRMED", "IN_HIRE", "COMPLETED"].includes(booking.status) &&
        <HandoverSummary booking={booking} canManage={canManage} onEdit={onEdit} />}
      {booking.status === "COMPLETED" && <RentalBilling booking={booking} canIssue={booking.incoming && canManage} done={done} />}
      <details className="group border-t border-paper-foreground/15 pt-3 text-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
          Rental history <ChevronDown className="size-4 group-open:rotate-180" aria-hidden />
        </summary>
        <ul className="mt-3 space-y-2 border-l border-paper-foreground/20 pl-3 text-xs">
          {booking.history.map((item, index) => <li key={`${item.at}-${index}`}>
            <time dateTime={item.at} className="font-mono opacity-75">{date.format(new Date(item.at))}</time>
            <span className="ml-2 font-semibold capitalize">{statusText(item.status)}</span>
            {item.reason && <p className="mt-1 break-words">{item.reason}</p>}
          </li>)}
        </ul>
      </details>
    </div>

    {(canManage && (["REQUESTED", "CONFIRMED"].includes(booking.status) || (booking.incoming && action))
      || canMove && ["CONFIRMED", "IN_HIRE", "COMPLETED"].includes(booking.status)) &&
    <div className="flex flex-wrap items-center gap-2 border-t-2 border-dashed border-paper-foreground/20 bg-paper-foreground/5 px-4 py-4 sm:px-6">
      {canManage && booking.incoming && booking.transitionBlocker &&
        <p role="status" className="basis-full rounded-md bg-signal/15 p-2 text-sm">{booking.transitionBlocker}</p>}
      {canManage && booking.incoming && action && <form onSubmit={(event) => void submission.submit(event, async () => {
        await trpc.mutation("assetHire.transition", { id: booking.id, action });
        await done();
      })}><Submit pending={submission.pending} error={submission.error} disabled={!!booking.transitionBlocker}>{action === "CONFIRM" ? "Confirm rental" : action === "START" ? "Start rental" : "Complete rental"}</Submit></form>}
      {canManage && booking.incoming && booking.status === "REQUESTED" &&
        <button className={button} onClick={() => onEdit({ mode: "reason", action: "DECLINE", booking })}>Decline</button>}
      {canManage && ["REQUESTED", "CONFIRMED"].includes(booking.status) &&
        <button className={button} onClick={() => onEdit({ mode: "reason", action: "CANCEL", booking })}>Cancel rental</button>}
      {canMove && ["CONFIRMED", "IN_HIRE", "COMPLETED"].includes(booking.status) &&
        <div className="flex flex-wrap gap-2">
          {Object.entries(booking.moves ?? {}).map(([leg, reference]) => <Link key={leg} to={`/owner/loads/${reference}`} className={button}>
            View {leg === "DELIVERY" ? "delivery" : "collection"} transport
          </Link>)}
          {!Object.keys(booking.handovers?.RETURN ?? {}).length && !booking.moves?.[transportDirection(booking)] &&
            <button className={button} onClick={() => onEdit({ mode: "move", booking })}>
              {transportDirection(booking) === "DELIVERY" ? "Arrange delivery transport" : "Arrange collection transport"}
            </button>}
        </div>}
    </div>}
  </article>;
}

function RentalBilling({ booking, canIssue, done }: {
  booking: Booking; canIssue: boolean; done: () => Promise<void>;
}) {
  const invoice = booking.invoice;
  const submission = useSubmission();
  const [recording, setRecording] = useState(false);
  const amount = (value: string) => money.format(Number(value));

  if (!invoice) return <section className="border-t border-paper-foreground/15 pt-3">
    <h3 className="text-sm font-bold">Rental invoice</h3>
    {canIssue ? <form className="mt-2" onSubmit={(event) => void submission.submit(event, async () => {
      await trpc.mutation("assetHire.issueInvoice", { id: booking.id });
      await done();
    })}><Submit pending={submission.pending} error={submission.error}>Issue rental invoice</Submit></form>
      : <p className="mt-1 text-sm opacity-75">Awaiting invoice from the asset owner.</p>}
  </section>;

  return <section className="space-y-3 rounded-md border border-paper-foreground/20 p-3 sm:p-4">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-lg font-extrabold uppercase italic">Rental invoice</h3>
        <p className="break-all font-mono text-xs">{invoice.number}</p>
        <p className="mt-1 text-xs opacity-75">Issued {date.format(new Date(invoice.issuedAt))}</p>
      </div>
      <span className="rounded bg-signal/20 px-2 py-1 text-xs font-bold capitalize">{statusText(invoice.status)}</span>
    </header>
    <div className="border-y border-dashed border-paper-foreground/20 py-2 text-sm">
      <p className="font-semibold">{booking.assetName}</p>
      <p>{booking.units} × {amount(booking.terms.rate)} per {booking.terms.unit.toLowerCase()} · {booking.terms.vat}. VAT</p>
    </div>
    <dl className="space-y-1 text-sm">
      {[
        ["Subtotal", invoice.subtotal],
        [`VAT (${Number(invoice.vatRate) * 100}%)`, invoice.vat],
        ["Invoice total", invoice.total],
        ["Payments recorded", invoice.paid],
      ].map(([name, value]) => <div key={name} className="flex justify-between gap-2">
        <dt>{name}</dt><dd className="font-mono tabular-nums">{amount(value!)}</dd>
      </div>)}
      <div className="mt-2 flex flex-wrap justify-between gap-2 rounded bg-signal/15 px-2 py-2 font-bold">
        <dt>Outstanding balance</dt><dd className="font-mono tabular-nums">{amount(invoice.balance)}</dd>
      </div>
    </dl>
    {booking.moves && <div className="text-xs opacity-80">
      <p className="font-semibold">Separately billed transport</p>
      {Object.entries(booking.moves).map(([leg, reference]) => <p key={leg} className="capitalize">{leg.toLowerCase()} · {reference}</p>)}
    </div>}
    {invoice.payments.length > 0 && <details className="text-sm">
      <summary className="cursor-pointer font-semibold">Payment history</summary>
      <ul className="mt-2 divide-y divide-paper-foreground/15">
        {invoice.payments.map((payment) => <li key={payment.id} className="flex flex-wrap justify-between gap-2 py-2">
          <div><p className="break-all font-semibold">{payment.reference}</p><p className="text-xs opacity-75">{date.format(new Date(payment.recordedAt))}</p></div>
          <strong className="font-mono">{amount(payment.amount)}</strong>
        </li>)}
      </ul>
    </details>}
    {canIssue && invoice.status !== "PAID" && (recording
      ? <form className="grid gap-3" onSubmit={(event) => void submission.submit(event, async (form) => {
        await trpc.mutation("assetHire.recordPayment", {
          id: booking.id, amount: read(form, "amount"), reference: read(form, "reference"),
        });
        setRecording(false);
        await done();
      })}>
        <Label name="Amount received (ZAR)"><input className={field + " text-foreground"} name="amount" type="number" min="0.01" max={invoice.balance} step="0.01" required /></Label>
        <Label name="Payment reference"><input className={field + " text-foreground"} name="reference" maxLength={120} required /></Label>
        <div className="flex flex-wrap gap-2">
          <Submit pending={submission.pending} error={submission.error}>Save payment</Submit>
          <button type="button" className={button} disabled={submission.pending} onClick={() => setRecording(false)}>Cancel</button>
        </div>
      </form>
      : <button type="button" className={button} onClick={() => setRecording(true)}>Record payment received</button>)}
  </section>;
}

const handoverChecks = {
  assetIdentity: "Verified the asset and its serial or fleet number",
  conditionInspected: "Inspected the asset for damage",
  attachmentsChecked: "Checked the included attachments and accessories",
};

function HandoverSummary({ booking, canManage, onEdit }: {
  booking: Booking; canManage: boolean; onEdit: (editor: Editor) => void;
}) {
  const ownSide = booking.incoming ? "OWNER" : "RENTER";
  return <section className="border-t border-paper-foreground/15 pt-3">
    <h3 className="mb-2 text-sm font-bold">Delivery and return</h3>
    {(["DELIVERY", "RETURN"] as const).map((stage) => {
      const reports = booking.handovers?.[stage];
      const canRecord = canManage && !reports?.[ownSide] && (stage === "DELIVERY" || booking.status !== "CONFIRMED");
      return <div key={stage} className="border-b border-paper-foreground/15 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm capitalize">{stage.toLowerCase()}</strong>
          {canRecord && <button className={button} onClick={() => onEdit({ mode: "handover", booking, stage })}>Record {stage.toLowerCase()}</button>}
        </div>
        {(["OWNER", "RENTER"] as const).map((side) => {
          const report = reports?.[side];
          return <div key={side} className="mt-2 text-xs">
            <strong>{side === "OWNER" ? "Asset owner" : "Renter"}</strong>
            {report ? <>
              <p>{report.condition === "GOOD" ? "Good condition" : "Damage recorded"} · {date.format(new Date(report.recordedAt))}{report.meterHours != null && ` · ${report.meterHours} meter hours`}</p>
              {report.notes && <p className="whitespace-pre-wrap break-words">{report.notes}</p>}
              <div className="mt-1 flex flex-wrap gap-2">{report.photos.map((photo, index) => <a key={photo} href={photo} target="_blank" rel="noreferrer">
                <img src={photo} alt={`${stage.toLowerCase()} condition photo ${index + 1}`} loading="lazy" className="size-14 rounded object-cover" />
              </a>)}</div>
            </> : <p className="opacity-75">Awaiting record</p>}
          </div>;
        })}
      </div>;
    })}
  </section>;
}

function HandoverForm({ booking, stage, done }: { booking: Booking; stage: HandoverStage; done: () => Promise<void> }) {
  const submission = useSubmission();
  const photoInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState("");
  const uploaded = useRef(new Map<File, string>());
  return <form className="grid gap-4" onSubmit={(event) => void submission.submit(event, async (form) => {
    if (!files.length || files.length > 6) throw new Error("Choose between one and six condition photos.");
    const notes = read(form, "notes");
    const condition = read(form, "condition");
    if (condition === "DAMAGE_FOUND" && !notes) throw new Error("Describe the damage.");
    const urls: string[] = [];
    for (const file of files) {
      let url = uploaded.current.get(file);
      if (url === undefined) {
        ({ url } = await uploadFile(file, "ASSET_HANDOVER_PHOTO"));
        uploaded.current.set(file, url);
      }
      urls.push(url);
    }
    await trpc.mutation("assetHire.handover", {
      id: booking.id, stage, condition, notes, photos: urls,
      checks: Object.fromEntries(Object.keys(handoverChecks).map((key) => [key, form.has(key)])),
      meterHours: read(form, "meterHours") ? quantity(form, "meterHours") : undefined,
    });
    await done();
  })}>
    <h2 className="text-xl font-bold">Record {stage.toLowerCase()} for {booking.assetName}</h2>
    <fieldset className="grid gap-2">
      <legend className="mb-2 font-semibold">Handover checklist</legend>
      {Object.entries(handoverChecks).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm">
        <input type="checkbox" name={key} required /> {label}
      </label>)}
    </fieldset>
    <Label name="Condition"><select name="condition" className={field} required>
      <option value="">Select condition</option><option value="GOOD">Good condition</option><option value="DAMAGE_FOUND">Damage found</option>
    </select></Label>
    <Label name="Meter hours (optional)"><input name="meterHours" className={field} type="number" min={0} max={1000000} step="0.1" /></Label>
    <Label name="Condition notes"><textarea name="notes" className={field} maxLength={2000} /></Label>
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-semibold">Condition photos</legend>
      <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={(event) => {
        const selected = Array.from(event.currentTarget.files ?? []).filter((file) => file.size > 0);
        event.currentTarget.value = "";
        const next = [...files];
        for (const file of selected) {
          if (!next.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) {
            next.push(file);
          }
        }
        if (next.length > 6) {
          setPhotoError("You can add up to six condition photos. Choose fewer files or remove a photo first.");
          return;
        }
        setFiles(next);
        setPhotoError("");
      }} />
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-3">
        <button type="button" className={primary + " inline-flex items-center gap-2"} disabled={submission.pending || files.length === 6}
          onClick={() => photoInput.current?.click()}>
          <Upload className="size-4" aria-hidden /> Add photos
        </button>
        <span className="text-xs text-muted-foreground" aria-live="polite">{files.length} of 6 selected · At least one required</span>
      </div>
      {photoError && <p role="alert" className="text-xs text-danger">{photoError}</p>}
      {files.length > 0 && <ul className="divide-y divide-border rounded-lg border border-border">
        {files.map((file) => <li key={JSON.stringify([file.name, file.size, file.lastModified])} className="flex min-w-0 items-center justify-between gap-2 px-3 py-1.5">
          <span className="truncate text-sm" title={file.name}>{file.name}</span>
          <button type="button" className={button + " grid min-w-10 shrink-0 place-items-center p-0"} aria-label={`Remove ${file.name}`}
            disabled={submission.pending} onClick={() => {
              uploaded.current.delete(file);
              setFiles(files.filter((item) => item !== file));
              setPhotoError("");
            }}><X className="size-4" aria-hidden /></button>
        </li>)}
      </ul>}
    </fieldset>
    <p className="text-sm text-muted-foreground">The asset owner and renter can view this record after you submit it.</p>
    <Submit pending={submission.pending} error={submission.error} disabled={!files.length}>Save handover</Submit>
  </form>;
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
    <Submit pending={submission.pending} error={submission.error}>{action === "DECLINE" ? "Decline rental" : "Cancel rental"}</Submit>
  </form>;
}

function transportDirection(booking: Booking): "DELIVERY" | "COLLECTION" {
  return booking.status === "IN_HIRE" || booking.status === "COMPLETED"
    || Object.keys(booking.handovers?.DELIVERY ?? {}).length > 0 ? "COLLECTION" : "DELIVERY";
}

function MoveForm({ asset, booking, done }: { asset?: Asset | undefined; booking?: Booking | undefined; done: () => Promise<void> }) {
  const submission = useSubmission();
  const [direction, setDirection] = useState<"DELIVERY" | "COLLECTION">(() => booking ? transportDirection(booking) : "DELIVERY");
  const [origin, setOrigin] = useState(booking && transportDirection(booking) === "COLLECTION" ? booking.site : asset?.location ?? booking?.assetLocation ?? null);
  const [destination, setDestination] = useState(booking && transportDirection(booking) === "COLLECTION" ? booking.assetLocation ?? null : booking?.site ?? null);
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
    }}><option value="DELIVERY" disabled={Boolean(booking && transportDirection(booking) === "COLLECTION")}>Deliver to worksite</option><option value="COLLECTION">Collect from worksite</option></select></Label>}
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
