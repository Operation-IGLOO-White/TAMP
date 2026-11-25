import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BusFront, CalendarDays, MapPin, Pencil, Plus, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { CharterBookings, CharterRequestForm, type CharterListing } from "@/components/tamp/CharterBookings";
import { AddressInput } from "@/components/tamp/AddressInput";
import { useTamp } from "@/context/TampContext";
import { uploadFile } from "@/fns/upload";
import { hasPermission } from "@/lib/access";
import { trpc } from "@/lib/trpc";
import type { Place } from "@/types/domain";

const types = {
  MINIBUS: "Minibus",
  MIDIBUS: "Midibus",
  BUS: "Bus",
  COACH: "Coach",
};
const minibusOptions = [
  { make: "Toyota", model: "Hiace Ses’fikile" },
  { make: "Mercedes-Benz", model: "Sprinter Inkanyezi" },
];
const documents = {
  licence: "Vehicle licence disc",
  roadworthy: "Roadworthy certificate",
  operatingLicence: "Operating licence",
  insurance: "Insurance certificate",
};
type VehicleType = keyof typeof types;
type Subtypes = Record<VehicleType, Record<string, string>>;
type DocumentType = keyof typeof documents;
type Vehicle = {
  id: string; type: VehicleType; subtype?: string | null; subtypeLabel?: string | null; make: string; model: string; seats: number;
  wheelchairPositions: number; displacedSeats: number; luggageKg: number; luggageM3: number;
  luggageDimensions: { lengthM: number; widthM: number; heightM: number } | null;
  location: Place; serviceArea: string; photos: string[]; availability: { start: string; end: string };
};
type FleetVehicle = Vehicle & {
  version: string; registration: string; documents: Record<DocumentType, string>; licenceExpiry: string;
  permitExpiry: string; driverId: string | null; published: boolean; verification: "PENDING" | "VERIFIED" | "REJECTED";
  reviewReason?: string; publicationIssue?: string;
};
type Driver = { id: string; name: string };
type Mode = "catalogue" | "fleet" | "review";
type Workspace = {
  vehicles: FleetVehicle[]; drivers: Driver[]; subtypes: Subtypes;
};
type Review = { vehicle: FleetVehicle; supplier: string };
const documentKeys = Object.keys(documents) as DocumentType[];
const field = "min-h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button = "min-h-10 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50";
const primary = button + " bg-signal text-signal-foreground";
const card = "min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm";
const displayDate = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg",
});
const localDate = (value?: string) => value ? new Date(Date.parse(value) + 7_200_000).toISOString().slice(0, 16) : "";
const vehicleName = (vehicle: Vehicle) => [vehicle.make, vehicle.model].join(" ");
const errorText = (error: unknown) => error instanceof Error ? error.message : "Try again shortly.";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid min-w-0 gap-1.5 text-sm font-medium">{label}{children}</label>;
}

export default function PassengerCharter({ mode }: { mode: Mode }) {
  const { authParty } = useTamp();
  return <PassengerWorkspace key={mode + ":" + authParty?.activeOrganisationId} mode={mode} />;
}

function PassengerWorkspace({ mode }: { mode: Mode }) {
  const { authParty, role } = useTamp();
  const [params, setParams] = useSearchParams();
  const showBookings = mode === "catalogue" && (params.has("booking") || params.get("view") === "bookings");
  const [requestListing, setRequestListing] = useState<CharterListing | "compare" | null>(null);
  const canRequest = hasPermission(authParty, role === "TRANSPORTER" ? "matches.manage" : "loads.manage");
  const showCatalogue = mode === "catalogue" && !showBookings && !requestListing;
  const canEdit = mode === "fleet" && hasPermission(authParty, "trucks.manage");
  const fleet = useQuery({
    queryKey: ["passenger-fleet", authParty?.id, authParty?.activeOrganisationId],
    queryFn: () => trpc.query<Workspace>("passenger.fleet"),
    enabled: mode === "fleet",
  });
  const reviews = useQuery({
    queryKey: ["passenger-reviews", authParty?.id],
    queryFn: () => trpc.query<Review[]>("passenger.reviews"),
    enabled: mode === "review",
  });
  const catalogue = useQuery({
    queryKey: ["passenger-catalogue", authParty?.id, authParty?.activeOrganisationId],
    queryFn: () => trpc.query<(Vehicle & { supplier: string; mine?: boolean })[]>("passenger.catalogue"),
    enabled: showCatalogue,
  });
  const [editor, setEditor] = useState<FleetVehicle | "new" | null>(null);
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [seats, setSeats] = useState("");
  const [busy, setBusy] = useState(false);
  const [fleetStatus, setFleetStatus] = useState("all");
  const fleetVehicles = fleet.data?.vehicles ?? [];
  const isListed = (vehicle: FleetVehicle) => vehicle.published && !vehicle.publicationIssue;
  const fleetMetrics = [
    { value: "all", label: "Total fleet", count: fleetVehicles.length, tone: "text-foreground" },
    { value: "published", label: "Published", count: fleetVehicles.filter(isListed).length, tone: "text-positive" },
    { value: "pending", label: "Awaiting review", count: fleetVehicles.filter((v) => v.verification === "PENDING").length, tone: "text-signal" },
    { value: "attention", label: "Needs attention", count: fleetVehicles.filter((v) => v.verification !== "PENDING" && v.publicationIssue).length, tone: "text-destructive" },
  ];
  const filteredFleet = fleetVehicles.filter((vehicle) => {
    const statusMatches = {
      all: true, published: isListed(vehicle), hidden: !isListed(vehicle),
      pending: vehicle.verification === "PENDING", verified: vehicle.verification === "VERIFIED",
      rejected: vehicle.verification === "REJECTED",
      attention: vehicle.verification !== "PENDING" && Boolean(vehicle.publicationIssue),
    }[fleetStatus];
    const haystack = [vehicle.registration, vehicleName(vehicle), types[vehicle.type], vehicle.subtypeLabel,
      vehicle.location.label, vehicle.serviceArea, vehicle.verification, isListed(vehicle) ? "published" : "hidden"].join(" ").toLowerCase();
    return statusMatches && (!type || vehicle.type === type) && vehicle.seats >= Number(seats)
      && search.trim().toLowerCase().split(/\s+/).every((word) => haystack.includes(word));
  });
  const query = mode === "fleet" ? fleet : mode === "review" ? reviews : catalogue;
  const title = mode === "fleet" ? "Buses & Minibuses" : mode === "review" ? "Passenger Vehicle Reviews" : "Passenger Charter";
  const visible = (catalogue.data ?? []).filter((vehicle) =>
    (!type || vehicle.type === type) && vehicle.seats >= Number(seats)
    && [vehicle.make, vehicle.model, vehicle.subtypeLabel ?? "", vehicle.supplier, vehicle.serviceArea, vehicle.location.label]
      .some((value) => value.toLowerCase().includes(search.trim().toLowerCase()))
  );
  const update = async (name: string, data: unknown, success: string) => {
    setBusy(true);
    try {
      await trpc.mutation(name, data);
      await query.refetch();
      toast.success(success);
    } catch (error) {
      toast.error("Changes were not saved", { description: errorText(error) });
    } finally {
      setBusy(false);
    }
  };
  function openEditor(vehicle: FleetVehicle | "new") {
    setEditor(vehicle);
    requestAnimationFrame(() => document.getElementById("passenger-vehicle-form")?.scrollIntoView({ block: "start" }));
  }
  return <AppShell>
    <PageHeader title={title} actions={canEdit && !editor
      ? <button className={primary} onClick={() => openEditor("new")}><Plus className="mr-1 inline size-4" /> Add passenger vehicle</button>
      : undefined} />
    <div className={`mx-auto grid w-full gap-5 p-4 md:p-6 ${mode === "fleet" ? "" : "max-w-7xl"}`}>
      {mode === "catalogue" && !requestListing && <nav aria-label="Passenger Charter" className="flex flex-wrap gap-2">
        <Link to="/passenger-charter" className={showBookings ? button : primary}>Browse vehicles</Link>
        <Link to="/passenger-charter?view=bookings" className={showBookings ? primary : button}>Charter requests & bookings</Link>
        {!showBookings && canRequest && <button className={primary} onClick={() => setRequestListing("compare")}>
          Find a transporter
        </button>}
      </nav>}
      {showBookings && <CharterBookings key={params.get("booking") ?? "all"} />}
      {mode === "catalogue" && !showBookings && requestListing && <CharterRequestForm listing={requestListing === "compare" ? null : requestListing}
        close={() => setRequestListing(null)} onSent={(id) => {
          setRequestListing(null);
          setParams({ booking: id });
        }} />}
      {showCatalogue && <div className={card + " grid gap-3 p-4 sm:grid-cols-3"}>
        <Field label="Search by subtype, area or operator"><input className={field} value={search} onChange={(event) => setSearch(event.target.value)} /></Field>
        <Field label="Vehicle type"><select className={field} value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">All passenger vehicles</option>
          {Object.entries(types).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
        </select></Field>
        <Field label="Minimum passenger seats"><input className={field} type="number" min={1} max={150} value={seats} onChange={(event) => setSeats(event.target.value)} /></Field>
      </div>}
      {editor && <VehicleForm key={editor === "new" ? "new" : editor.id} vehicle={editor === "new" ? undefined : editor}
        drivers={fleet.data?.drivers ?? []} subtypes={fleet.data?.subtypes} close={() => setEditor(null)}
        onSaved={async () => { setEditor(null); await fleet.refetch(); }} />}
      {(mode !== "catalogue" || showCatalogue) && query.isPending && <p role="status" className="text-sm text-muted-foreground">Loading passenger vehicles…</p>}
      {(mode !== "catalogue" || showCatalogue) && query.isError && <div role="alert" className={card + " p-4"}>
        <p>The passenger vehicle list could not be loaded.</p>
        <button className={button + " mt-2"} onClick={() => void query.refetch()}>Retry</button>
      </div>}
      {showCatalogue && catalogue.isSuccess && (visible.length
        ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((vehicle) => <VehicleCard key={vehicle.id} vehicle={vehicle} supplier={vehicle.supplier}>
            {canRequest && !vehicle.mine && <button className={primary} onClick={() => {
              setRequestListing(vehicle);
              window.scrollTo({ top: 0 });
            }}>Request quote</button>}
          </VehicleCard>)}
        </div>
        : <p className={card + " p-6 text-sm text-muted-foreground"}>No published passenger vehicles match these filters.</p>)}
      {mode === "fleet" && fleet.isSuccess && <>
        <section aria-label="Passenger fleet overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {fleetMetrics.map((metric) => <button type="button" key={metric.value}
            aria-pressed={fleetStatus === metric.value}
            className={`rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-signal ${fleetStatus === metric.value ? "border-signal/60" : "border-border"}`}
            onClick={() => setFleetStatus(metric.value)}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{metric.label}</p>
            <p className={`mt-2 font-mono text-2xl font-black ${metric.tone}`}>{metric.count}</p>
          </button>)}
        </section>
        <section aria-label="Filter passenger vehicles" className="grid gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" aria-label="Search passenger vehicles" className={field + " pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"}
              placeholder="Search by registration, make, model or location…" value={search} onChange={(event) => setSearch(event.target.value)} />
            {search && <button type="button" aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1"
              onClick={() => setSearch("")}><X className="size-4" /></button>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Vehicle type"><select className={field} value={type} onChange={(event) => setType(event.target.value)}>
              <option value="">All types</option>
              {Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></Field>
            <Field label="Status"><select className={field} value={fleetStatus} onChange={(event) => setFleetStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="published">Published</option>
              <option value="hidden">Hidden from catalogue</option>
              <option value="pending">Awaiting review</option>
              <option value="verified">Verified</option>
              <option value="rejected">Review rejected</option>
              <option value="attention">Needs attention</option>
            </select></Field>
            <Field label="Minimum passenger seats"><input className={field} type="number" min={1} max={150}
              value={seats} onChange={(event) => setSeats(event.target.value)} /></Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p role="status">{filteredFleet.length} of {fleetVehicles.length} vehicles</p>
            {(search || type || seats || fleetStatus !== "all") && <button type="button" className="font-semibold underline"
              onClick={() => { setSearch(""); setType(""); setSeats(""); setFleetStatus("all"); }}>Clear filters</button>}
          </div>
        </section>
        {filteredFleet.length ? <div className="grid gap-4 xl:grid-cols-2">
          {filteredFleet.map((vehicle) => <VehicleCard key={vehicle.id} vehicle={vehicle} supplier={vehicle.registration}
            fleetHeader={<div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-muted"><BusFront className="size-5" /></span>
                <div className="min-w-0 break-words">
                  <h2 className="font-mono text-sm font-bold">{vehicle.registration}</h2>
                  <p className="text-sm font-medium">{vehicleName(vehicle)}</p>
                  <p className="text-xs text-muted-foreground">{[types[vehicle.type], vehicle.subtypeLabel].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                <span className={`rounded-full px-2 py-1 ${vehicle.verification === "VERIFIED" ? "bg-positive/10 text-positive"
                  : vehicle.verification === "REJECTED" ? "bg-destructive/10 text-destructive" : "bg-signal/15 text-foreground"}`}>
                  {vehicle.verification === "VERIFIED" ? "Verified" : vehicle.verification === "REJECTED" ? "Review rejected" : "Awaiting review"}
                </span>
                <span className="rounded-full bg-muted px-2 py-1">{isListed(vehicle) ? "Published" : "Hidden"}</span>
              </div>
            </div>}>
            {vehicle.reviewReason && <p className="break-words text-sm text-destructive">{vehicle.reviewReason}</p>}
            {vehicle.publicationIssue && <p className="text-sm text-muted-foreground">{vehicle.publicationIssue}</p>}
            {canEdit && <div className="mt-1 flex flex-wrap gap-2 border-t border-border pt-3">
              <button className={button} onClick={() => openEditor(vehicle)}><Pencil className="mr-1 inline size-4" /> Edit vehicle</button>
              <button className={primary} disabled={busy || (!vehicle.published && Boolean(vehicle.publicationIssue))} onClick={() =>
                void update("passenger.save", saveData(vehicle, !vehicle.published), vehicle.published ? "Vehicle unpublished" : "Vehicle published")
              }>{vehicle.published ? "Unpublish" : "Publish to Passenger Charter"}</button>
            </div>}
          </VehicleCard>)}
        </div> : <p className={card + " p-6 text-sm text-muted-foreground"}>
          {fleetVehicles.length ? "No passenger vehicles match these filters." : "No buses or minibuses have been added to this fleet."}
        </p>}
      </>}
      {mode === "review" && reviews.isSuccess && (reviews.data.length
        ? <div className="grid gap-4 md:grid-cols-2">
          {reviews.data.map(({ vehicle, supplier }) =>
            <VehicleCard key={vehicle.id} vehicle={vehicle} supplier={supplier}>
              <ReviewForm key={vehicle.version} vehicle={vehicle} busy={busy} onReview={(status, reason) =>
                update("passenger.review", { id: vehicle.id, version: vehicle.version, status, reason }, "Vehicle review saved")
              } />
            </VehicleCard>)}
        </div>
        : <p className={card + " p-6 text-sm text-muted-foreground"}>No passenger vehicles have been submitted.</p>)}
    </div>
  </AppShell>;
}

function saveData(vehicle: FleetVehicle, published: boolean) {
  const { id, version, type, subtype, registration, make, model, seats, wheelchairPositions, displacedSeats,
    luggageKg, luggageM3, luggageDimensions, location, serviceArea, availability, licenceExpiry,
    permitExpiry, photos, documents, driverId } = vehicle;
  return { id, version, type, subtype, registration, make, model, seats, wheelchairPositions, displacedSeats,
    luggageKg, luggageM3, luggageDimensions, location, serviceArea, availability, licenceExpiry,
    permitExpiry, photos, documents, driverId, published };
}

function VehiclePhoto({ vehicle, fleet }: { vehicle: Vehicle; fleet: boolean }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [illustrationFailed, setIllustrationFailed] = useState(false);
  const photo = vehicle.photos?.[photoIndex];
  return <div className={`relative grid h-44 place-items-center ${fleet ? "border-b border-border bg-gradient-to-br from-white via-[#f5f5f3] to-[#e8e8e4]" : "bg-muted"}`}>
    {photo ? (
      <img key={photoIndex} className="h-44 w-full object-contain" src={photo} alt={vehicleName(vehicle)}
        loading="lazy" onError={() => setPhotoIndex(photoIndex + 1)} />
    ) : (
      <>
        {illustrationFailed ? <BusFront aria-hidden="true" className="size-12 text-muted-foreground" /> :
          <img className="h-44 w-full object-contain px-6 pb-7 pt-4"
            src={`${import.meta.env.BASE_URL}fleet/tamp-passenger-${vehicle.type.toLowerCase()}.webp`}
            alt={`Generic ${types[vehicle.type].toLowerCase()}`} loading="lazy"
            onError={() => setIllustrationFailed(true)} />}
        <span className="absolute bottom-2 right-2 rounded-full bg-card px-2 py-1 text-xs text-muted-foreground">
          Illustrative image
        </span>
      </>
    )}
  </div>;
}

function VehicleCard({ vehicle, supplier, children, fleetHeader }: {
  vehicle: Vehicle; supplier: string; children?: ReactNode; fleetHeader?: ReactNode;
}) {
  return <article className={card}>
    {fleetHeader}
    <VehiclePhoto key={JSON.stringify([vehicle.type, vehicle.photos])} vehicle={vehicle} fleet={Boolean(fleetHeader)} />
    <div className="grid gap-2 p-4 text-sm">
      {!fleetHeader && <><div className="text-xs font-semibold text-muted-foreground">{types[vehicle.type]}{vehicle.subtypeLabel && ` · ${vehicle.subtypeLabel}`} · {supplier}</div>
      <h2 className="text-lg font-semibold">{vehicleName(vehicle)}</h2></>}
      <div className="flex flex-wrap items-center gap-2"><Users className="size-4" /> {vehicle.seats} passenger seats
        {vehicle.wheelchairPositions > 0 && <> · {vehicle.wheelchairPositions} wheelchair positions with {vehicle.seats - vehicle.displacedSeats} seats configured</>}
      </div>
      <p>Luggage capacity · {vehicle.luggageKg} kg / {vehicle.luggageM3} m³
        {vehicle.luggageDimensions && <> · {vehicle.luggageDimensions.lengthM} × {vehicle.luggageDimensions.widthM} × {vehicle.luggageDimensions.heightM} m</>}
      </p>
      <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0" /> {vehicle.location.label} · {vehicle.serviceArea}</p>
      <p className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0" />
        {displayDate.format(new Date(vehicle.availability.start))} – {displayDate.format(new Date(vehicle.availability.end))} SAST
      </p>
      {children}
    </div>
  </article>;
}

function ReviewForm({ vehicle, busy, onReview }: {
  vehicle: FleetVehicle; busy: boolean; onReview: (status: "VERIFIED" | "REJECTED", reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  return <div className="grid gap-3 border-t border-border pt-3">
    <p className="font-semibold">{vehicle.registration} · {vehicle.verification.toLowerCase()}</p>
    <p>Vehicle licence expires {vehicle.licenceExpiry} · Operating licence expires {vehicle.permitExpiry}</p>
    <div className="flex flex-wrap gap-2">
      {documentKeys.map((key) => <a key={key} className={button} href={vehicle.documents[key]} target="_blank" rel="noreferrer">{documents[key]}</a>)}
      {vehicle.photos.map((url, index) => <a key={url} className={button} href={url} target="_blank" rel="noreferrer">Photo {index + 1}</a>)}
    </div>
    {vehicle.reviewReason && <p className="text-sm text-destructive">{vehicle.reviewReason}</p>}
    <Field label="Review notes"><input className={field} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></Field>
    <div className="flex flex-wrap gap-2">
      <button className={primary} disabled={busy || vehicle.verification === "VERIFIED"} onClick={() => void onReview("VERIFIED", reason)}>Verify vehicle</button>
      <button className={button} disabled={busy || !reason.trim()} onClick={() => void onReview("REJECTED", reason)}>Reject vehicle</button>
    </div>
  </div>;
}

const vehicleSteps = ["Vehicle", "Capacity", "Availability", "Documents"];
const stepFields = "min-w-0 grid gap-4 sm:grid-cols-2";

function VehicleForm({ vehicle, drivers, subtypes, close, onSaved }: {
  vehicle: FleetVehicle | undefined; drivers: Driver[]; subtypes: Subtypes | undefined; close: () => void; onSaved: () => Promise<void>;
}) {
  const [location, setLocation] = useState<Place | null>(vehicle?.location ?? null);
  const [addressEdited, setAddressEdited] = useState(false);
  const [make, setMake] = useState(vehicle?.make ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [type, setType] = useState<VehicleType>(vehicle?.type ?? "MINIBUS");
  const [subtype, setSubtype] = useState(vehicle?.subtype ?? "");
  const subtypeOptions = Object.entries(subtypes?.[type] ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const lastStep = step === vehicleSteps.length - 1;

  function changeStep(next: number) {
    setError("");
    setStep(next);
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.closest("form")?.scrollIntoView({ block: "start" });
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const activeFields = formElement.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      "[data-active-step] input, [data-active-step] select",
    );
    for (const field of activeFields) {
      if (!field.reportValidity()) return;
    }
    const form = new FormData(formElement);
    const read = (name: string) => String(form.get(name) ?? "").trim();
    const amount = (name: string) => Number(read(name));
    const fail = (message: string) => { setError(message); };
    if (step === 0) {
      if (!read("make") || !read("model")) return fail("Enter the vehicle make and model.");
      if (!/^[A-Za-z0-9 -]{2,24}$/.test(read("registration")) || !/[A-Za-z0-9]/.test(read("registration"))) {
        return fail("Enter a registration with 2 to 24 letters, digits, spaces or hyphens.");
      }
    }
    if (step === 2) {
      if (!location || addressEdited) return fail("Select the vehicle’s base address from the search results.");
      if (!read("serviceArea")) return fail("Enter the vehicle’s service area.");
      if (read("start") >= read("end")) return fail("Availability must end after it starts.");
    }
    if (step === 1 && (amount("displacedSeats") > amount("seats") || (!amount("wheelchairPositions") && amount("displacedSeats")))) {
      return fail("Check the number of seats removed for wheelchair access.");
    }
    const dimensions = ["lengthM", "widthM", "heightM"];
    const measured = dimensions.some((name) => read(name));
    if (step === 1 && measured && dimensions.some((name) => !amount(name))) return fail("Enter all three luggage compartment dimensions.");
    if (!lastStep) return changeStep(step + 1);
    if (!location) return changeStep(2);
    const photos = form.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (photos.length > 6 || (!vehicle && !photos.length)) return fail("Choose one to six vehicle photos.");
    setBusy(true);
    setError("");
    try {
      const files = { ...vehicle?.documents };
      for (const key of documentKeys) {
        const file = form.get(key);
        if (file instanceof File && file.size) files[key] = (await uploadFile(file, "PASSENGER_DOCUMENT")).url;
      }
      const photoUrls: string[] = [];
      for (const file of photos) photoUrls.push((await uploadFile(file, "PASSENGER_PHOTO")).url);
      const result = await trpc.mutation<{ verification: string }>("passenger.save", {
        id: vehicle?.id, version: vehicle?.version, type, subtype: subtypes ? subtype || null : undefined, registration: read("registration"),
        make: read("make"), model: read("model"), seats: amount("seats"),
        wheelchairPositions: amount("wheelchairPositions"), displacedSeats: amount("displacedSeats"),
        luggageKg: amount("luggageKg"), luggageM3: amount("luggageM3"),
        luggageDimensions: measured ? Object.fromEntries(dimensions.map((name) => [name, amount(name)])) : null,
        location, serviceArea: read("serviceArea"), licenceExpiry: read("licenceExpiry"),
        permitExpiry: read("permitExpiry"), photos: photos.length ? photoUrls : vehicle?.photos,
        documents: files, driverId: read("driver") || null,
        availability: { start: read("start") + "+02:00", end: read("end") + "+02:00" },
        published: vehicle?.published && !vehicle.publicationIssue,
      });
      toast.success(result.verification === "PENDING" ? "Vehicle submitted for review" : "Vehicle saved");
      await onSaved();
    } catch (failure) {
      fail(errorText(failure));
    } finally {
      setBusy(false);
    }
  }
  return <form id="passenger-vehicle-form" className={card + " mx-auto w-full max-w-3xl scroll-mt-24 p-4 sm:p-6"} onSubmit={submit} noValidate aria-busy={busy}>
    <h2 className="mb-4 text-lg font-semibold">{vehicle ? "Edit passenger vehicle" : "Add passenger vehicle"}</h2>
    <ol aria-label="Registration progress" className="mb-5 grid grid-cols-4 gap-1 border-b border-border pb-4 sm:gap-3">
      {vehicleSteps.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined}
        className={`grid justify-items-center gap-1 text-center text-[11px] font-medium sm:text-sm ${index === step ? "text-foreground" : "text-muted-foreground"}`}>
        <span className={`grid size-7 place-items-center rounded-full ${index <= step ? "bg-signal text-signal-foreground" : "bg-muted"}`}>{index + 1}</span>
        {label}
      </li>)}
    </ol>
    <h3 ref={heading} tabIndex={-1} className="mb-4 font-semibold outline-none">Step {step + 1} of {vehicleSteps.length} · {vehicleSteps[step]}</h3>
    <div hidden={step !== 0} data-active-step={step === 0 ? "" : undefined}>
      <fieldset disabled={busy} className={stepFields}>
        <Field label="Vehicle type *"><select className={field} value={type} onChange={(event) => {
            setType(event.target.value as VehicleType);
            setSubtype("");
          }}>
          {Object.entries(types).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
        </select></Field>
        {subtypeOptions.length > 0 && <Field label="Vehicle subtype"><select className={field} value={subtype}
          onChange={(event) => setSubtype(event.target.value)}>
          <option value="">Select a subtype</option>
          {subtypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></Field>}
        {type === "MINIBUS" && <div className="flex flex-wrap gap-2 sm:col-span-2">
          {minibusOptions.map((option) => <button type="button" className={button} key={option.model} onClick={() => {
            setMake(option.make);
            setModel(option.model);
          }}>{option.make} {option.model}</button>)}
        </div>}
        <Field label="Make *"><input className={field} name="make" maxLength={80} required value={make} onChange={(event) => setMake(event.target.value)} /></Field>
        <Field label="Model *"><input className={field} name="model" maxLength={80} required value={model} onChange={(event) => setModel(event.target.value)} /></Field>
        <Field label="Registration *"><input className={field} name="registration" minLength={2} maxLength={24} required defaultValue={vehicle?.registration} /></Field>
      </fieldset>
    </div>
    <div hidden={step !== 1} data-active-step={step === 1 ? "" : undefined}>
      <fieldset disabled={busy} className={stepFields}>
        <Field label="Passenger seats, excluding driver *"><input className={field} name="seats" type="number" min={1} max={150} required defaultValue={vehicle?.seats} /></Field>
        <Field label="Wheelchair positions"><input className={field} name="wheelchairPositions" type="number" min={0} max={30} defaultValue={vehicle?.wheelchairPositions} /></Field>
        <Field label="Seats removed for wheelchair access"><input className={field} name="displacedSeats" type="number" min={0} max={150} defaultValue={vehicle?.displacedSeats} /></Field>
        <Field label="Luggage capacity (kg)"><input className={field} name="luggageKg" type="number" min={0} max={20000} step="any" defaultValue={vehicle?.luggageKg} /></Field>
        <Field label="Luggage volume (m³)"><input className={field} name="luggageM3" type="number" min={0} max={150} step="any" defaultValue={vehicle?.luggageM3} /></Field>
        {(["lengthM", "widthM", "heightM"] as const).map((name) => <Field key={name} label={`Luggage compartment ${name.slice(0, -1)} (m)`}>
          <input className={field} name={name} type="number" min={0.01} max={name === "lengthM" ? 100 : 30} step="any" defaultValue={vehicle?.luggageDimensions?.[name]} />
        </Field>)}
      </fieldset>
    </div>
    <div hidden={step !== 2} data-active-step={step === 2 ? "" : undefined}>
      <fieldset disabled={busy} className={stepFields}>
        <div className="min-w-0"><p className="mb-1.5 text-sm font-medium">Base location *</p>
          <AddressInput value={location} onTextEdit={() => setAddressEdited(true)} onSelect={(place) => {
            setLocation(place);
            setAddressEdited(false);
          }} placeholder="Search for an address" />
        </div>
        <Field label="Service area *"><input className={field} name="serviceArea" maxLength={200} required defaultValue={vehicle?.serviceArea} /></Field>
        <Field label="Assigned driver"><select className={field} name="driver" defaultValue={vehicle?.driverId ?? ""}>
          <option value="">Choose later</option>
          {drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name}</option>)}
        </select></Field>
        <Field label="Available from (SAST) *"><input className={field} name="start" type="datetime-local" required defaultValue={localDate(vehicle?.availability.start)} /></Field>
        <Field label="Available until (SAST) *"><input className={field} name="end" type="datetime-local" required defaultValue={localDate(vehicle?.availability.end)} /></Field>
      </fieldset>
    </div>
    <div hidden={step !== 3} data-active-step={step === 3 ? "" : undefined}>
      <fieldset disabled={busy} className={stepFields}>
        <Field label="Vehicle licence expiry *"><input className={field} name="licenceExpiry" type="date" required defaultValue={vehicle?.licenceExpiry} /></Field>
        <Field label="Operating licence expiry *"><input className={field} name="permitExpiry" type="date" required defaultValue={vehicle?.permitExpiry} /></Field>
        <Field label={vehicle ? "Replace vehicle photos (up to 6)" : "Vehicle photos (1–6) *"}>
          <input className={field} name="photos" type="file" multiple accept="image/*" required={!vehicle} />
        </Field>
        {documentKeys.map((key) => <Field key={key} label={documents[key] + (vehicle ? " (replace)" : " *")}>
          <input className={field} name={key} type="file" accept="image/*,application/pdf" required={!vehicle?.documents[key]} />
        </Field>)}
      </fieldset>
    </div>
    {error && <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <button className={button} disabled={busy} type="button" onClick={close}>Cancel</button>
      {step > 0 && <button className={button} disabled={busy} type="button" onClick={() => changeStep(step - 1)}>Back</button>}
      <button className={primary} disabled={busy}>{busy ? "Saving…" : !lastStep ? "Continue" : vehicle ? "Save changes" : "Submit for review"}</button>
    </div>
  </form>;
}
