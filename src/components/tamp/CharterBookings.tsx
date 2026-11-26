import { CharterWaybill } from "@/components/tamp/CharterRecords";
import { passengerVehicleAsset } from "@/lib/passenger-assets";
import { LoadingIndicator } from "@/components/tamp/LoadingIndicator";
import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronDown, Check, MapPin, Plus, Route, Search, Trash2, Undo2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { charterAssignmentLabel, charterStageLabel, charterVehicleComplete, type CharterVehicleProgress } from "@/lib/charter-assignment";
import { CharterFleetLive } from "@/components/tamp/CharterFleetLive";
import { AddressInput } from "@/components/tamp/AddressInput";
import { useTamp } from "@/context/TampContext";
import { computeRoute } from "@/fns/routes";
import { hasPermission } from "@/lib/access";
import { trpc } from "@/lib/trpc";
import type { Place } from "@/types/domain";

export type CharterListing = { id: string; make: string; model: string; supplier: string };
type CharterMatch = {
  vehicleId: string; supplier: string; allocations?: CharterMatch[];
  vehicles: { id: string; type: string; make: string; model: string; seats: number;
    wheelchairPositions: number; displacedSeats: number; luggageKg: number; luggageM3: number }[];
};
type CapacityGap = {
  leg: string; passengers: number; wheelchairPositions: number; luggageKg: number; luggageM3: number;
  largestBag: boolean;
};
type Dimensions = { lengthM: number; widthM: number; heightM: number };
type Leg = {
  origin: Place; destination: Place; stops: Place[]; pickupAt: string; estimatedArrival: string;
  passengers: number; wheelchairPositions: number; luggageKg: number; luggageM3: number;
  largestBag: Dimensions | null; distanceKm: number; routeProvider: string;
};
type FleetVehicle = { driverId?: string | null; type?: string; photos?: string[]; id: string; registration: string; make: string; model: string; seats: number; publicationIssue?: string | null };
export type Booking = {
  id: string; version: string; incoming: boolean; allowSplit: boolean; vehicleId: string; vehicleName: string;
  vehicleProgress?: CharterVehicleProgress[];
  driverAssignments?: {
    vehicleId: string; registration: string; driverId?: string | null; driverName: string; canReassign?: boolean; status: keyof typeof charterAssignmentLabel; reason?: string;
  }[];
  groupId?: string; suggestedVehicles?: CharterMatch["vehicles"];
  customer: string; supplier: string; status: "REQUESTED" | "QUOTED" | "CONFIRMED" | "CANCELLED" | "DECLINED";
  outbound: Leg; returnLeg: Leg | null; contactName: string; contactPhone: string; notes: string;
  quote: { total: string; vat: "INCL" | "EXCL"; terms: string; start: string; end: string; validUntil: string; outboundArrivalBy?: string | null; returnArrivalBy?: string | null; vehicles: FleetVehicle[] } | null;
  completedAt?: string;
  ratings?: Record<string, { stars: number; comment: string; at: string }>;
  invoice?: { number: string; issuedAt: string; total: string; vat: string; status: string; currency: string };
  history: { status: string; at: string; reason?: string }[];
};
type CharterAction = "CONFIRM" | "DECLINE" | "CANCEL";
type Address = { place: Place | null; dirty: boolean };
type LegAddresses = { origin: Address; destination: Address; stops: (Address & { id: string })[] };
const blankAddress = (): Address => ({ place: null, dirty: false });
const blankLeg = (): LegAddresses => ({ origin: blankAddress(), destination: blankAddress(), stops: [] });
const field = "min-h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button = "min-h-10 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50";
const primary = button + " bg-signal text-signal-foreground";
const panel = "min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5";
const money = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });
const clock = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" });
const displayTime = (value: string) => clock.format(new Date(value)) + " SAST";
const localTime = (value: string) => new Date(Date.parse(value) + 7_200_000).toISOString().slice(0, 16);
const sasTime = (value: string) => new Date(value + "+02:00").toISOString();
const errorText = (error: unknown) => error instanceof Error ? error.message : "Please try again shortly.";
const read = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid min-w-0 gap-1.5 text-sm font-medium">{label}{children}</label>;
}

function AddressField({ name, value, onChange }: { name: string; value: Address; onChange: (address: Address) => void }) {
  return <div className="min-w-0">
    <p className="mb-1.5 text-sm font-medium">{name}</p>
    <AddressInput value={value.place} placeholder={name}
      onTextEdit={() => onChange({ ...value, dirty: true })}
      onSelect={(place) => onChange({ place, dirty: false })} />
  </div>;
}

function LegFields({ title, prefix, addresses, setAddresses, defaultPassengers, minPickup }: {
  title: string; prefix: string; addresses: LegAddresses; setAddresses: (addresses: LegAddresses) => void;
  defaultPassengers?: string; minPickup?: string | undefined;
}) {
  return <section className="grid gap-3 rounded-xl border border-border p-3 sm:p-4">
    <h3 className="font-semibold">{title}</h3>
    <AddressField name="Pickup address" value={addresses.origin} onChange={(origin) => setAddresses({ ...addresses, origin })} />
    {addresses.stops.map((stop, index) => <div key={stop.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
      <AddressField name={`Stop ${index + 1}`} value={stop} onChange={(address) => setAddresses({
        ...addresses, stops: addresses.stops.map((item) => item.id === stop.id ? { ...item, ...address } : item),
      })} />
      <button type="button" className={button} aria-label={`Remove stop ${index + 1}`} onClick={() =>
        setAddresses({ ...addresses, stops: addresses.stops.filter((item) => item.id !== stop.id) })
      }><Trash2 className="size-4" /></button>
    </div>)}
    {addresses.stops.length < 6 && <button type="button" className={button + " justify-self-start"} onClick={() =>
      setAddresses({ ...addresses, stops: [...addresses.stops, { ...blankAddress(), id: crypto.randomUUID() }] })
    }><Plus className="mr-1 inline size-4" /> Add stop</button>}
    <AddressField name="Destination address" value={addresses.destination} onChange={(destination) => setAddresses({ ...addresses, destination })} />
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Pickup date and time (SAST) *"><input className={field} type="datetime-local" name={prefix + "pickup"} min={minPickup} required /></Field>
      <Field label="Total passengers *"><input className={field} type="number" min={1} max={1000} name={prefix + "passengers"} defaultValue={defaultPassengers} required /></Field>
      <Field label="Wheelchair positions needed"><input className={field} type="number" min={0} max={100} name={prefix + "wheelchairs"} /></Field>
      <Field label="Estimated luggage weight (kg)"><input className={field} type="number" min={0} max={50000} step="any" name={prefix + "kg"} /></Field>
      <Field label="Estimated luggage volume (m³)"><input className={field} type="number" min={0} max={300} step="any" name={prefix + "m3"} /></Field>
    </div>
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">Oversized luggage dimensions</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {(["Length", "Width", "Height"] as const).map((name) => <Field key={name} label={name + " (m)"}>
          <input className={field} type="number" min={0.01} max={name === "Length" ? 100 : 30} step="any" name={prefix + name} />
        </Field>)}
      </div>
    </details>
  </section>;
}

function requestLeg(form: FormData, prefix: string, addresses: LegAddresses) {
  const { origin, destination, stops } = addresses;
  if (!origin.place || !destination.place || origin.dirty || destination.dirty || stops.some((stop) => stop.dirty || !stop.place)) {
    throw new Error("Select an address from the results for every pickup, stop and destination.");
  }
  const dimensions = ["Length", "Width", "Height"].map((name) => Number(read(form, prefix + name)));
  const [lengthM, widthM, heightM] = dimensions;
  if (dimensions.some(Boolean) && !dimensions.every(Boolean)) throw new Error("Enter all three luggage dimensions.");
  const passengers = Number(read(form, prefix + "passengers"));
  const wheelchairPositions = Number(read(form, prefix + "wheelchairs"));
  if (wheelchairPositions > passengers) throw new Error("Include wheelchair passengers in the total passenger count.");
  return {
    origin: origin.place, destination: destination.place, stops: stops.flatMap((stop) => stop.place ? [stop.place] : []),
    pickupAt: sasTime(read(form, prefix + "pickup")), passengers, wheelchairPositions,
    luggageKg: Number(read(form, prefix + "kg")), luggageM3: Number(read(form, prefix + "m3")),
    largestBag: lengthM && widthM && heightM ? { lengthM, widthM, heightM } : null,
  };
}

export function CharterRequestForm({ listing, close, onSent }: {
  listing: CharterListing | null; close: () => void; onSent: (id: string) => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [outbound, setOutbound] = useState(blankLeg);
  const [step, setStep] = useState(0);
  const [inbound, setInbound] = useState<LegAddresses | null>(null);
  const [returnPassengers, setReturnPassengers] = useState("");
  const [matches, setMatches] = useState<CharterMatch[]>([]);
  const [gaps, setGaps] = useState<CapacityGap[]>([]);
  const [chosen, setChosen] = useState("");
  const [allowSplit, setAllowSplit] = useState(false);
  const finalStep = listing ? 2 : 3;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pickup, setPickup] = useState("");
  const routeReady = Boolean(outbound.origin.place && outbound.destination.place && !outbound.origin.dirty && !outbound.destination.dirty && outbound.stops.every((stop) => stop.place && !stop.dirty));
  const routePreview = useQuery({
    queryKey: ["charter-route-preview", outbound],
    enabled: routeReady,
    queryFn: () => computeRoute(outbound.origin.place!, outbound.destination.place!, outbound.stops.map((stop) => stop.place!)),
    staleTime: 60_000, retry: 1,
  });
  const arrival = pickup && routePreview.data ? Date.parse(sasTime(pickup)) + routePreview.data.durationMin * 60_000 : null;
  const earliestReturn = arrival ? new Date(Math.ceil((arrival + 60_000) / 60_000) * 60_000).toISOString() : null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    for (const input of formElement.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "[data-current] input, [data-current] textarea",
    )) {
      if (!input.reportValidity()) {
        const message = input.validationMessage || "Check the required fields before continuing.";
        setError(message);
        toast.error("Check your charter details", { description: message });
        return;
      }
    }
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      const first = requestLeg(form, "out-", outbound);
      const second = step > 0 && inbound ? requestLeg(form, "return-", inbound) : null;
      if (Date.parse(first.pickupAt) <= Date.now()) throw new Error("Choose a future pickup date and time.");
      if (second && second.pickupAt <= first.pickupAt) throw new Error("Return pickup must follow outbound pickup.");
      if (step < 2) {
        setBusy(true);
        const route = await computeRoute(first.origin, first.destination, first.stops);
        if (!route?.routeToken) throw new Error("We could not calculate this route. Please retry before choosing your return.");
        if (second && Date.parse(second.pickupAt) <= Date.parse(first.pickupAt) + route.durationMin * 60_000) {
          throw new Error(`Your outbound trip arrives around ${displayTime(new Date(Date.parse(first.pickupAt) + route.durationMin * 60_000).toISOString())}. Choose a return pickup after this time.`);
        }
        setStep(step + 1);
        formElement.scrollIntoView({ block: "start" });
        return;
      }
      setBusy(true);
      const [outRoute, returnRoute] = await Promise.all([
        computeRoute(first.origin, first.destination, first.stops),
        second ? computeRoute(second.origin, second.destination, second.stops) : null,
      ]);
      if (!outRoute?.routeToken || (second && !returnRoute?.routeToken)) throw new Error("The route could not be calculated. Please try again.");
      if (second && Date.parse(second.pickupAt) <= Date.parse(first.pickupAt) + outRoute.durationMin * 60_000) {
        throw new Error(`Your outbound trip arrives around ${displayTime(new Date(Date.parse(first.pickupAt) + outRoute.durationMin * 60_000).toISOString())}. Choose a later return pickup.`);
      }
      const trip = { outbound: { ...first, routeToken: outRoute.routeToken },
        returnLeg: second && { ...second, routeToken: returnRoute?.routeToken },
        allowSplit, allowMultipleProviders: allowSplit && form.has("allowMultipleProviders"),
      };
      if (!listing && step === 2) {
        const found = await trpc.mutation<(CharterMatch | { gaps: CapacityGap[] })[]>("charter.search", trip);
        setMatches(found.filter((entry): entry is CharterMatch => "vehicleId" in entry));
        setGaps(found.flatMap((entry) => "gaps" in entry ? entry.gaps : []));
        setChosen("");
        setStep(3);
        formElement.scrollIntoView({ block: "start" });
        return;
      }
      if (!listing && !chosen) throw new Error("Choose a transporter before requesting a quote.");
      const combined = matches.find((match) => match.vehicleId === chosen && match.allocations);
      const result = await trpc.mutation<{ id: string }>(combined ? "charter.requestGroup" : "charter.request", {
        ...trip, ...(combined ? { vehicleIds: combined.vehicles.map((vehicle) => vehicle.id) } : {}), id, vehicleId: listing?.id ?? chosen, requireFleetMatch: !listing,
        contactName: read(form, "contact"), contactPhone: read(form, "phone"), notes: read(form, "notes"),
      });
      toast.success("Charter request sent");
      onSent(result.id);
    } catch (failure) {
      setError(errorText(failure));
      toast.error("Charter request could not continue", { description: errorText(failure) });
    } finally {
      setBusy(false);
    }
  }
  return <form className={panel + " w-full min-w-0 scroll-mt-24"} onSubmit={submit} onChange={(event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.name === "out-pickup") setPickup(target.value);
  }} noValidate aria-busy={busy}>
    <h2 className="mb-2 text-lg font-semibold">{listing ? "Request a charter quote" : "Find a charter transporter"}</h2>
    {listing && <p className="mb-4 text-sm text-muted-foreground">{listing.make} {listing.model} · {listing.supplier}</p>}
    <nav aria-label="Charter request progress" className={`mb-6 grid ${listing ? "grid-cols-3" : "grid-cols-4"} gap-1 sm:gap-2`}>
      {[{ label: "Outbound", icon: MapPin }, { label: "Return (optional)", icon: Undo2 },
        { label: "Contact details", icon: UserRound }, ...(listing ? [] : [{ label: "Compare", icon: Route }])]
        .map(({ label, icon: Icon }, index) => {
          const active = index === step;
          const complete = index < step;
          return <button key={label} type="button" aria-current={active ? "step" : undefined}
            disabled={busy || index > step} onClick={() => { setError(""); setStep(index); }}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[9px] font-bold uppercase tracking-wide transition sm:flex-row sm:justify-center sm:gap-2 sm:px-3 sm:text-xs ${active
              ? "border-signal bg-signal/10 text-foreground" : complete
                ? "border-success/40 bg-success/5 text-foreground" : "border-border text-muted-foreground"}`}>
            <span className={`grid size-6 shrink-0 place-items-center rounded-full ${active ? "bg-signal text-signal-foreground" : complete ? "bg-success text-white" : "bg-steel"}`}>
              {complete ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
            </span>
            <span>{label}</span>
          </button>;
        })}
    </nav>
    {error && <div role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm font-medium text-destructive">{error}</div>}
    {step <= 1 && routeReady && <div className="mb-4 rounded-xl border border-signal/30 bg-signal/5 p-4 text-sm" aria-live="polite">
      {routePreview.isFetching ? "Calculating road distance and travel time…" : routePreview.data ? <>
        <p className="font-semibold">Outbound · {routePreview.data.distanceKm.toFixed(1)} km · {Math.floor(routePreview.data.durationMin / 60)}h {Math.ceil(routePreview.data.durationMin % 60)}m estimated driving time</p>
        {arrival && <p className="mt-1">Estimated arrival: {displayTime(new Date(arrival).toISOString())}. Allow extra time for breaks, traffic and your activity before returning.</p>}
      </> : <button type="button" className="underline" onClick={() => void routePreview.refetch()}>Route estimate unavailable. Retry</button>}
    </div>}
    <fieldset className="grid gap-4" disabled={busy}>
      <div hidden={step !== 0} data-current={step === 0 ? "" : undefined}>
        <LegFields title="Outbound trip" prefix="out-" addresses={outbound} setAddresses={setOutbound} />
      </div>
      <div hidden={step !== 1} data-current={step === 1 ? "" : undefined}>
        <button type="button" aria-pressed={Boolean(inbound)} className={primary + " mb-3 inline-flex items-center gap-2"} onClick={(event) => {
          const form = event.currentTarget.form;
          if (form) setReturnPassengers(read(new FormData(form), "out-passengers"));
          setInbound(inbound ? null : { origin: outbound.destination, destination: outbound.origin, stops: [] });
        }}><Undo2 className="size-4" />{inbound ? "Remove return trip" : "Add a return trip"}</button>
        {inbound && earliestReturn && <div className="mb-3 rounded-xl border border-border p-3 text-sm">
          <p className="font-medium">Choose a return pickup after {displayTime(earliestReturn)}</p>
          <p className="mt-1 text-muted-foreground">Quick suggestions include time at your destination. You can also choose your own date and time below.</p>
          <div className="mt-2 flex flex-wrap gap-2">{[1, 2, 4].map((hours) => <button key={hours} type="button" className={button} onClick={(event) => {
            const input = event.currentTarget.form?.elements.namedItem("return-pickup");
            if (input instanceof HTMLInputElement) input.value = localTime(new Date(Date.parse(earliestReturn) + hours * 3_600_000).toISOString());
          }}>Stay {hours}h · {displayTime(new Date(Date.parse(earliestReturn) + hours * 3_600_000).toISOString())}</button>)}</div>
        </div>}
        {inbound && <LegFields title="Return trip" prefix="return-" addresses={inbound} setAddresses={setInbound} defaultPassengers={returnPassengers} minPickup={earliestReturn ? localTime(earliestReturn) : undefined} />}
      </div>
      <div hidden={step !== 2} data-current={step === 2 ? "" : undefined}>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contact name *"><input className={field} name="contact" maxLength={120} required /></Field>
            <Field label="Contact phone *"><input className={field} name="phone" type="tel" minLength={5} maxLength={40} required /></Field>
          </div>
          <Field label="Trip instructions"><textarea className={field} name="notes" maxLength={1500} rows={2} /></Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allowSplit} onChange={(event) => setAllowSplit(event.target.checked)} className="accent-signal" />
            Allow the group to travel in multiple vehicles
          </label>
          {!listing && allowSplit && <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="allowMultipleProviders" className="accent-signal" />
            Allow multiple Transporters if one cannot cover the whole trip
          </label>}
        </div>
      </div>
      {!listing && step === 3 && <section className="grid gap-3" aria-label="Matching transporters">
        <p className="text-sm text-muted-foreground">Each option covers the full group. Each participating Transporter will confirm pickup logistics and pricing in its own quote.</p>
        {matches.length === 0 && <div className={panel}>
          <p className="font-semibold">No available allocation could cover this itinerary</p>
          {gaps.map((gap) => {
            const missing = [
              gap.passengers && `${gap.passengers} passenger seats`,
              gap.wheelchairPositions && `${gap.wheelchairPositions} wheelchair positions`,
              gap.luggageKg && `${gap.luggageKg} kg luggage capacity`,
              gap.luggageM3 && `${gap.luggageM3} m³ luggage space`,
              gap.largestBag && "space for the largest luggage item",
            ].filter(Boolean);
            return missing.length > 0 && <p key={gap.leg} className="text-sm">{gap.leg} · Short by at least {missing.join(", ")}</p>;
          })}
          <p className="text-sm text-muted-foreground">Go back to adjust the dates or group requirements and search again.</p>
        </div>}
        <div className="grid gap-4 lg:grid-cols-2">{matches.map((match) => <label key={match.vehicleId} className={`min-w-0 cursor-pointer overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:shadow-md ${chosen === match.vehicleId ? "border-signal ring-1 ring-signal" : "border-border"}`}>
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <span className="flex items-center gap-2 font-semibold"><input type="radio" name="supplier" className="accent-signal" checked={chosen === match.vehicleId} onChange={() => setChosen(match.vehicleId)} />{match.supplier}</span>
            <span className="rounded-full bg-signal/15 px-3 py-1 text-xs font-semibold">{match.vehicles.length} {match.vehicles.length === 1 ? "vehicle" : "vehicles"}</span>
          </div>
          {(match.allocations ?? [match]).map((allocation) => <div key={allocation.vehicleId}>
            {match.allocations && <p className="px-4 pt-3 text-sm font-semibold">{allocation.supplier}</p>}
            {allocation.vehicles.map((vehicle) => <div key={vehicle.id}>
              <div className="relative flex h-44 items-center justify-center bg-gradient-to-br from-white to-stone-100 p-4 sm:h-52">
                <img src={passengerVehicleAsset(vehicle)} alt={`${vehicle.make} ${vehicle.model}`} className="h-full w-full object-contain" />
                <span className="absolute bottom-2 right-3 text-[10px] text-stone-500">Illustrative image</span>
              </div>
              <div className="grid gap-3 p-4">
                <div><p className="text-xs uppercase text-muted-foreground">{vehicle.type.toLowerCase()}</p><h3 className="text-lg font-bold">{vehicle.make} {vehicle.model}</h3></div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl border border-border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Passenger seats</p><p className="font-semibold">{vehicle.seats}</p></div>
                  <div className="rounded-xl border border-border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Luggage capacity</p><p className="font-semibold">{vehicle.luggageKg} kg / {vehicle.luggageM3} m³</p></div>
                </div>
                {vehicle.wheelchairPositions > 0 && <p className="text-sm text-muted-foreground">{vehicle.wheelchairPositions} wheelchair positions · {vehicle.seats - vehicle.displacedSeats} seats in wheelchair configuration</p>}
              </div>
            </div>)}
          </div>)}
          <div className={`border-t border-border px-4 py-3 text-center text-sm font-semibold ${chosen === match.vehicleId ? "bg-signal text-signal-foreground" : "text-muted-foreground"}`}>{chosen === match.vehicleId ? "Selected for quote request" : "Select this transporter"}</div>
        </label>)}</div>
      </section>}
    </fieldset>
    <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
      <button className={button} type="button" onClick={() => {
        if (step === 0) close();
        else {
          setError("");
          setStep(step - 1);
        }
      }} disabled={busy}>{step === 0 ? "Back to catalogue" : "Back"}</button>
      <button className={primary} disabled={busy || (step === 3 && !chosen)}>
        {busy ? "Checking itinerary…" : step === finalStep ? "Send quote request" : step === 2 ? "Compare transporters" : "Continue"}
      </button>
    </div>
  </form>;
}

export function CharterBookings({ workspace }: { workspace?: "engagements" | "dispatch" } = {}) {
  const { authParty, role } = useTamp();
  const [params] = useSearchParams();
  const bookingId = params.get("booking");
  const bookings = useQuery({
    queryKey: ["charter-bookings", authParty?.id, authParty?.activeOrganisationId],
    queryFn: () => trpc.query<Booking[]>("charter.list"),
    refetchInterval: 20_000,
  });
  const canDispatch = hasPermission(authParty, "dispatch.manage");
  const canTrack = hasPermission(authParty, "tracking.read");
  const canQuote = role === "TRANSPORTER" && hasPermission(authParty, "trucks.manage");
  const fleet = useQuery({
    queryKey: ["passenger-fleet", authParty?.id, authParty?.activeOrganisationId],
    queryFn: () => trpc.query<{ vehicles: FleetVehicle[] }>("passenger.fleet"),
    enabled: canQuote,
  });
  const canRequest = hasPermission(authParty, role === "TRANSPORTER" ? "matches.manage" : "loads.manage");
  const [tab, setTab] = useState<"sent" | "incoming">(role === "TRANSPORTER" ? "incoming" : "sent");
  const [editor, setEditor] = useState<{ id: string; version: string; action: "quote" | CharterAction } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const allBookings = bookings.data ?? [];
  const linked = allBookings.find((row) => row.id === bookingId);
  const workspaceBookings = workspace ? allBookings.filter((row) => row.incoming
    && (workspace === "dispatch" ? row.status === "CONFIRMED" : row.status !== "CONFIRMED")) : allBookings;
  const scopedRows = workspaceBookings.filter((row) => bookingId
    ? row.id === bookingId || (!row.incoming && linked?.groupId && row.groupId === linked.groupId)
    : row.incoming === (tab === "incoming"));
  const rows = scopedRows.filter((row) =>
    (statusFilter === "ALL" || row.status === statusFilter)
    && [row.id, row.vehicleName, row.customer, row.supplier, row.outbound.origin.label, row.outbound.destination.label]
      .join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  const customerGroups = [...new Set(rows.flatMap((row) => !row.incoming && row.groupId ? [row.groupId] : []))];

  async function save(path: string, data: unknown, message: string) {
    setBusy(true);
    setError("");
    try {
      await trpc.mutation(path, data);
      setEditor(null);
      await bookings.refetch();
      toast.success(message);

    } catch (failure) {
      setError(errorText(failure));
      toast.error("Charter action could not be completed", { description: errorText(failure) });
      await bookings.refetch();
    } finally {
      setBusy(false);
    }
  }

  return <div className="grid w-full min-w-0 gap-4">
    {!workspace && !bookingId && role === "TRANSPORTER" && <div className="flex flex-wrap gap-2">
      <button className={tab === "incoming" ? primary : button} onClick={() => setTab("incoming")}>Incoming requests</button>
      <button className={tab === "sent" ? primary : button} onClick={() => setTab("sent")}>Sent requests</button>
    </div>}
    {bookingId && <Link to={workspace === "engagements" ? "/transporter/engagements?service=passenger" : workspace === "dispatch" ? "/transporter/dispatch" : "/passenger-charter?view=bookings"} className={button + " justify-self-start"}>All charter requests</Link>}
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center">
      <label className="relative flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input aria-label="Search charter bookings" type="search" className={field + " pl-9"} placeholder="Search route, reference, vehicle or company…"
          value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      <select aria-label="Filter charter status" className={field + " sm:w-44"} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
        <option value="ALL">All statuses</option>
        {["REQUESTED", "QUOTED", "CONFIRMED", "DECLINED", "CANCELLED"].map((status) =>
          <option key={status} value={status}>{status.toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</option>)}
      </select>
      <span role="status" className="shrink-0 text-xs text-muted-foreground">{rows.length} of {scopedRows.length} requests</span>
    </div>
    {bookings.isPending && <LoadingIndicator />}
    {bookings.isError && <div role="alert" className={panel}>Charter requests could not be loaded. <button className={button} onClick={() => void bookings.refetch()}>Retry</button></div>}
    {bookings.isSuccess && !rows.length && <p className={panel + " text-sm text-muted-foreground"}>{bookingId ? "This charter is unavailable in your organisation." : "No charter requests yet."}</p>}
    {customerGroups.map((id) => <CombinedCharter key={id} id={id} bookings={rows.filter((row) => row.groupId === id)}
      canManage={canRequest} canTrack={canTrack} refresh={() => bookings.refetch()} />)}
    {rows.map((booking) => {
      const canManage = booking.incoming ? canQuote : canRequest;
      const open = ["REQUESTED", "QUOTED"].includes(booking.status);
      const changed = editor?.id === booking.id && editor.version !== booking.version;
      const active = editor?.id === booking.id && !changed ? editor.action : null;
      const future = Date.parse(booking.outbound.pickupAt) > Date.now();
      const progress = booking.vehicleProgress ?? [];
      const complete = progress.length > 0 && progress.every(charterVehicleComplete);
      const quoteValid = Boolean(booking.quote && Date.parse(booking.quote.validUntil) > Date.now());
      const choose = (action: "quote" | CharterAction) => {
        setError("");
        setEditor({ id: booking.id, version: booking.version, action });
      };
      return <article className="grid min-w-0 gap-4 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" key={booking.id}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1"><p className="break-all font-mono text-[10px] text-muted-foreground">{booking.groupId ? `Combined charter · ${booking.groupId}` : booking.id}</p><h2 className="mt-2 break-words text-sm font-black uppercase sm:text-base">{booking.outbound.origin.label} <span className="mx-1 inline-block text-xl">→</span> {booking.outbound.destination.label}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{booking.vehicleName} · {booking.outbound.passengers} passengers · {booking.returnLeg ? "Return trip" : "One-way"}</p>
            <p className="text-sm text-muted-foreground">{booking.incoming ? booking.customer : booking.supplier}</p></div>
          <span className="shrink-0 rounded-md bg-signal/15 px-2 py-1 text-[10px] font-bold uppercase">
            {booking.status === "CONFIRMED" && complete ? "Completed" : booking.status === "QUOTED" && !quoteValid ? "Quote expired" : booking.status.toLowerCase().replace(/^./, (ch) => ch.toUpperCase())}
          </span>
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-y border-border py-3 text-xs">
          <p><span className="text-muted-foreground">Pickup </span>{displayTime(booking.outbound.pickupAt)}</p>
          {booking.quote && <p className="font-mono font-bold">{money.format(Number(booking.quote.total))} {booking.quote.vat === "INCL" ? "incl." : "excl."} VAT</p>}
        </div>
        <details className="group/booking min-w-0">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 text-xs font-bold text-signal">
            <span className="group-open/booking:hidden">Show details</span>
            <span className="hidden group-open/booking:inline">Hide details</span>
            <ChevronDown className="size-4 transition-transform group-open/booking:rotate-180" aria-hidden />
          </summary>
          <div className="mt-3 grid min-w-0 gap-4">
        {booking.quote && <CharterQuotePanel booking={booking} />}
        {booking.vehicleProgress?.map((vehicle) => <CharterWaybill key={vehicle.vehicleId} booking={booking} vehicle={vehicle} />)}
        <details open={Boolean(bookingId)} className="min-w-0">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-signal">View itinerary and booking details</summary>
          <div className="mt-4 grid min-w-0 gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <LegSummary leg={booking.outbound} title="Outbound" />
          {booking.returnLeg && <LegSummary leg={booking.returnLeg} title="Return" />}
        </div>
        <div className="break-words text-sm">
          <p>{booking.contactName} · {booking.contactPhone}</p>
          <p>{booking.allowSplit ? "Multiple vehicles allowed" : "One vehicle requested"}</p>
          {booking.suggestedVehicles && <p>Suggested vehicles · {booking.suggestedVehicles.map((v) => `${v.make} ${v.model}`).join(", ")}</p>}
          {booking.notes && <p className="mt-1 whitespace-pre-wrap">{booking.notes}</p>}
        </div>
        {canTrack && booking.status === "CONFIRMED" && (booking.incoming || !booking.groupId)
          && <CharterFleetLive bookingId={booking.id} origin={booking.outbound.origin} />}
        {progress.length > 0 && <section className="grid gap-2 rounded-xl border border-border p-3">
          <h3 className="text-sm font-semibold">Vehicle progress</h3>
          {progress.map((vehicle) => <div key={vehicle.vehicleId} className="grid gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_1fr_1fr]">
            <p className="font-semibold">{vehicle.registration}</p>
            {vehicle.status !== "ACCEPTED" ? <p className="text-muted-foreground sm:col-span-2">{charterAssignmentLabel[vehicle.status]}</p> : <>
              <p>Outbound · {charterStageLabel[vehicle.legs.outbound.stage]}
                {vehicle.legs.outbound.nextStop > 0 && vehicle.legs.outbound.stage === "ON_ROUTE"
                  && ` (${vehicle.legs.outbound.nextStop} stops complete)`}
              </p>
              {vehicle.legs.returnLeg && <p>Return · {charterStageLabel[vehicle.legs.returnLeg.stage]}
                {vehicle.legs.returnLeg.nextStop > 0 && vehicle.legs.returnLeg.stage === "ON_ROUTE"
                  && ` (${vehicle.legs.returnLeg.nextStop} stops complete)`}
              </p>}
            </>}
          </div>)}
        </section>}
        {booking.driverAssignments && booking.driverAssignments.length > 0 && <section className="grid gap-2 rounded-xl border border-border p-3">
          <h3 className="text-sm font-semibold">Driver assignments</h3>
          {booking.driverAssignments.map((assignment) => <div key={assignment.vehicleId} className="grid gap-1 text-sm">
            <p className="flex flex-wrap justify-between gap-x-3">
              <span>{assignment.registration} · {assignment.driverName}</span>
              <span className={assignment.status === "DECLINED" ? "font-semibold text-destructive" : "font-semibold"}>
                {charterAssignmentLabel[assignment.status]}
              </span>
            </p>
            {assignment.reason && <p className="break-words text-muted-foreground">{assignment.reason}</p>}
            {canDispatch && assignment.canReassign && <ReassignCharterDriver
              bookingId={booking.id} vehicleId={assignment.vehicleId} registration={assignment.registration}
              onSaved={async () => { await bookings.refetch(); }} />}
          </div>)}
        </section>}
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Booking history</summary>
          <ul className="mt-2 space-y-1">{booking.history.map((entry, index) =>
            <li key={index}>{displayTime(entry.at)} · {entry.status.toLowerCase()}{entry.reason && ` · ${entry.reason}`}</li>
          )}</ul>
        </details>
          </div>
        </details>
        {workspace === "engagements" && <Link to="/transporter/dispatch" className="text-xs font-semibold text-signal">Accepted passenger bookings appear in Dispatch →</Link>}
        {canManage && future && !active && <div className="flex flex-wrap gap-2">
          {booking.incoming && open && <button className={primary} onClick={() => choose("quote")}>{booking.quote ? "Revise quote" : "Prepare quote"}</button>}
          {!booking.groupId && !booking.incoming && booking.status === "QUOTED" && quoteValid && <button className={primary} onClick={() => choose("CONFIRM")}>Review and book</button>}
          {booking.incoming && open && <button className={button} onClick={() => choose("DECLINE")}>Decline request</button>}
          {!booking.groupId && (open || booking.status === "CONFIRMED") && <button className={button} onClick={() => choose("CANCEL")}>Cancel charter</button>}
        </div>}
        {active === "quote" && <QuoteForm key={booking.version} booking={booking} vehicles={fleet.data?.vehicles.filter((vehicle) => !vehicle.publicationIssue) ?? []}
          busy={busy} onClose={() => setEditor(null)} onSubmit={(data) => void save("charter.quote", data, "Quote sent")} />}
        {active && active !== "quote" && <form className="grid gap-3 rounded-xl border border-border p-3" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void save("charter.transition", { id: booking.id, version: booking.version, action: active, reason: read(form, "reason") },
            active === "CONFIRM" ? "Charter booked" : active === "DECLINE" ? "Request declined" : "Charter cancelled");
        }}>
          {active === "CONFIRM" ? <label className="flex items-start gap-3 rounded-lg bg-signal/10 p-4 text-sm leading-relaxed"><input className="mt-1 size-4 shrink-0 accent-signal" type="checkbox" required /> I accept the quoted vehicles, itinerary, price and terms.</label> :
            <Field label="Reason *"><textarea className={field} name="reason" required maxLength={500} /></Field>}
          <div className="flex gap-2">
            <button type="button" className={button} disabled={busy} onClick={() => setEditor(null)}>Back</button>
            <button className={primary} disabled={busy}>{busy ? "Saving…" : active === "CONFIRM" ? "Confirm booking" : active === "DECLINE" ? "Confirm decline" : "Confirm cancellation"}</button>
          </div>
        </form>}
        {changed && <p className="text-sm text-muted-foreground" role="status">This charter changed. Review the updated details before continuing.</p>}
        {active && error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </div>
        </details>
      </article>;
    })}
  </div>;
}

export function ReassignCharterDriver({ bookingId, vehicleId, registration, onSaved, compact = false }: {
  bookingId: string; vehicleId: string; registration: string; onSaved: () => Promise<void>; compact?: boolean;
}) {
  const { authParty } = useTamp();
  const [open, setOpen] = useState(compact);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const options = useQuery({
    queryKey: ["charter-driver-options", authParty?.id, authParty?.activeOrganisationId, bookingId, vehicleId],
    queryFn: () => trpc.query<{ expectedDriverId: string | null; drivers: { id: string; name: string; eligible?: boolean; reason?: string }[] }>(
      "charter.driverOptions", { bookingId, vehicleId }),
    enabled: open, retry: false, gcTime: 0,
  });
  if (!open) return <button type="button" className={button + " justify-self-start"}
    onClick={() => { setError(""); setOpen(true); }}>Assign / change driver</button>;

  return <form className={compact ? "grid gap-3" : "mt-2 grid gap-3 rounded-lg border border-border p-3"} onSubmit={async (event) => {
    event.preventDefault();
    if (!options.data || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await trpc.mutation("charter.reassignDriver", {
        bookingId, vehicleId, expectedDriverId: options.data.expectedDriverId,
        driverId: read(form, "replacementDriver"), reason: read(form, "replacementReason") || "Initial driver assignment",
      });
      if (!compact) setOpen(false);
      await onSaved();
      toast.success("Replacement driver invited");
    } catch (failure) {
      setError(errorText(failure));
      toast.error("Charter action could not be completed", { description: errorText(failure) });
    } finally {
      setSaving(false);
    }
  }}>
    {!compact && <h4 className="font-semibold">Assign driver for {registration}</h4>}
    {options.isPending && <p role="status">Checking driver availability…</p>}
    {options.isError && <p role="alert">{errorText(options.error)}</p>}
    {options.data && !options.data.drivers.length && <p className="text-muted-foreground">No eligible replacement drivers are available for this reservation.</p>}
    {options.data && options.data.drivers.length > 0 && <>
      <Field label="Select compliant driver">
        <select className={field} name="replacementDriver" required value={selectedDriverId} onChange={(event) => setSelectedDriverId(event.target.value)} disabled={saving}>
          <option value="" disabled>Select a driver</option>
          {options.data.drivers.map((driver) => <option key={driver.id} value={driver.id} disabled={driver.eligible === false}>{driver.name}{driver.reason ? ` — ${driver.reason}` : ""}</option>)}
        </select>
      </Field>
      <Field label={options.data.expectedDriverId ? "Reason for reassignment *" : "Pickup or route instructions (optional)"}>
        <textarea className={field} name="replacementReason" required={Boolean(options.data.expectedDriverId)} maxLength={500} rows={2} disabled={saving} />
      </Field>
    </>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2">
      {!compact && <button type="button" className={button} onClick={() => setOpen(false)} disabled={saving}>Close</button>}
      {options.isError && <button type="button" className={button} onClick={() => void options.refetch()}>Retry</button>}
      {options.data && options.data.drivers.length > 0 && <button className={primary + " w-full"} disabled={saving || options.isFetching || !selectedDriverId}>
        {saving ? "Sending offer…" : "Send driver offer"}
      </button>}
    </div>
  </form>;
}

function CombinedCharter({ id, bookings, canManage, canTrack, refresh }: {
  id: string; bookings: Booking[]; canManage: boolean; canTrack: boolean; refresh: () => Promise<unknown>;
}) {
  const [action, setAction] = useState<"CONFIRM" | "CANCEL" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const versions = Object.fromEntries(bookings.map((booking) => [booking.id, booking.version]));
  const revision = JSON.stringify(versions);
  const [reviewed, setReviewed] = useState("");
  const [replacement, setReplacement] = useState<Booking | null>(null);
  const [options, setOptions] = useState<CharterMatch[] | null>(null);
  const replaceable = bookings.every((booking) => ["REQUESTED", "QUOTED", "DECLINED"].includes(booking.status));

  async function findReplacement(booking: Booking) {
    setBusy(true);
    setError("");
    setReplacement(booking);
    setOptions(null);
    try {
      setOptions(await trpc.query<CharterMatch[]>("charter.replacementOptions", {
        id: booking.id, version: booking.version,
      }));
    } catch (failure) {
      setError(errorText(failure));
      toast.error("Charter action could not be completed", { description: errorText(failure) });
    } finally {
      setBusy(false);
    }
  }

  async function selectReplacement(option: CharterMatch) {
    if (!replacement) return;
    setBusy(true);
    setError("");
    try {
      await trpc.mutation("charter.replaceProvider", {
        id: replacement.id, version: replacement.version, vehicleIds: option.vehicles.map((vehicle) => vehicle.id),
      });
      setReplacement(null);
      await refresh();
      toast.success("Replacement requested");
    } catch (failure) {
      setError(errorText(failure));
      toast.error("Charter action could not be completed", { description: errorText(failure) });
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  const ready = bookings.every((booking) => booking.status === "QUOTED" && booking.quote
    && Date.parse(booking.quote.validUntil) > Date.now());
  const active = bookings.some((booking) => booking.status !== "CANCELLED")
    && bookings.every((booking) => Date.parse(booking.outbound.pickupAt) > Date.now());
  const vehicles = bookings.flatMap((booking) => booking.vehicleProgress ?? []);
  const completed = vehicles.filter(charterVehicleComplete).length;
  const allComplete = bookings.every((booking) => booking.status === "CONFIRMED" && Boolean(booking.vehicleProgress?.length))
    && vehicles.length > 0 && completed === vehicles.length;
  const totals = new Map<string, number>();
  for (const booking of bookings) {
    if (booking.quote && ["QUOTED", "CONFIRMED"].includes(booking.status)) {
      const cents = Math.round(Number(booking.quote.total) * 100);
      totals.set(booking.quote.vat, (totals.get(booking.quote.vat) ?? 0) + cents);
    }
  }
  return <section className={panel + " grid gap-3"}>
    <h2 className="text-lg font-semibold">Combined charter · {bookings.length} Transporters</h2>
    {vehicles.length > 0 && <p className="text-sm font-medium">
      {allComplete ? "Completed · " : ""}{completed} of {vehicles.length} vehicles finished all assigned legs
    </p>}
    {canTrack && bookings.some((booking) => booking.status === "CONFIRMED") && bookings[0]
      && <CharterFleetLive bookingId={bookings[0].id} origin={bookings[0].outbound.origin} />}
    <ul className="grid gap-1 text-sm">
      {bookings.map((booking) => <li key={booking.id}>
        {booking.supplier} · {booking.status.toLowerCase()}
        {booking.quote && ["QUOTED", "CONFIRMED"].includes(booking.status)
          && ` · ${money.format(Number(booking.quote.total))} ${booking.quote.vat === "INCL" ? "incl." : "excl."} VAT`}
        {canManage && active && replaceable && !action && <button type="button" className={button + " ml-2"}
          disabled={busy} onClick={() => void findReplacement(booking)}>Find replacement</button>}
      </li>)}
    </ul>
    {totals.size > 0 && <p className="font-semibold">Quoted totals · {[...totals].map(([vat, cents]) =>
      `${money.format(cents / 100)} ${vat === "INCL" ? "incl." : "excl."} VAT`).join(" + ")}</p>}
    {replacement && <section className="grid gap-2 rounded-xl border border-border p-3" aria-live="polite">
      <h3 className="font-semibold">Replace {replacement.supplier}</h3>
      {busy && !options && <p className="text-sm">Checking available Transporters…</p>}
      {options?.length === 0 && <p className="text-sm text-muted-foreground">No replacement could cover this allocation alongside the other Transporters.</p>}
      {options?.map((option) => <div key={option.vehicleId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div><p className="font-semibold">{option.supplier}</p>
          <p>{option.vehicles.map((vehicle) => `${vehicle.make} ${vehicle.model} (${vehicle.seats} seats)`).join(", ")}</p></div>
        <button className={primary} type="button" disabled={busy} onClick={() => void selectReplacement(option)}>Request replacement quote</button>
      </div>)}
      <button type="button" className={button + " justify-self-start"} disabled={busy}
        onClick={() => { setReplacement(null); setError(""); }}>Back</button>
    </section>}
    {canManage && active && !action && !replacement && <div className="flex flex-wrap gap-2">
      {ready && <button className={primary} onClick={() => { setReviewed(revision); setAction("CONFIRM"); }}>Review and book combined fleet</button>}
      <button className={button} onClick={() => { setReviewed(revision); setAction("CANCEL"); }}>Cancel combined charter</button>
    </div>}
    {action && <form className="grid gap-2" onSubmit={async (event) => {
      event.preventDefault();
      if (reviewed !== revision) return;
      const form = new FormData(event.currentTarget);
      setBusy(true);
      setError("");
      try {
        await trpc.mutation("charter.transitionGroup", { id, versions, action, reason: read(form, "reason") });
        setAction(null);
        await refresh();
        toast.success(action === "CONFIRM" ? "Combined charter booked" : "Combined charter cancelled");
      } catch (failure) {
        setError(errorText(failure));
      toast.error("Charter action could not be completed", { description: errorText(failure) });
        await refresh();
      } finally {
        setBusy(false);
      }
    }}>
      {action === "CONFIRM" ? <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" required /> I accept the vehicles, prices and terms from every Transporter.
      </label> : <Field label="Cancellation reason"><textarea className={field} name="reason" maxLength={500} required /></Field>}
      {reviewed !== revision && <p role="status" className="text-sm">A quote changed. Close this review and check the latest plan.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={busy} onClick={() => { setAction(null); setError(""); }}>Back</button>
        <button className={primary} disabled={busy || reviewed !== revision || (action === "CONFIRM" && !ready)}>
          {busy ? "Saving…" : action === "CONFIRM" ? "Confirm all allocations" : "Confirm cancellation"}
        </button>
      </div>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}

function CharterQuotePanel({ booking }: { booking: Booking }) {
  const quote = booking.quote!;
  return <section aria-label="Charter quotation" className="grid min-w-0 gap-5 xl:grid-cols-[minmax(280px,.65fr)_minmax(0,1fr)]">
    <div className="overflow-hidden rounded-xl border border-border bg-[#faf9f6] text-[#202024] shadow-sm">
      <div className="flex items-start justify-between gap-3 p-5">
        <h3 className="text-2xl font-black italic tracking-tighter">CHARTER QUOTE</h3>
        <span className="rounded border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase">{booking.status}</span>
      </div>
      <p className="break-all px-5 pb-5 font-mono text-[10px] text-zinc-500">{booking.id}</p>
      <div className="grid grid-cols-2 gap-4 border-y border-dashed border-zinc-300 p-5">
        <div><p className="text-[10px] font-bold uppercase text-zinc-500">Transporter</p><p className="mt-2 text-sm font-bold">{booking.supplier}</p></div>
        <div><p className="text-[10px] font-bold uppercase text-zinc-500">Customer</p><p className="mt-2 text-sm font-bold">{booking.customer}</p></div>
      </div>
      <dl className="grid gap-3 p-5 text-xs">
        {[["Journey", booking.returnLeg ? "Outbound & return" : "One-way"],
          ["Passengers", String(booking.outbound.passengers)],
          ["Vehicles", String(quote.vehicles.length)],
          ["Pickup", displayTime(booking.outbound.pickupAt)],
          ...(booking.status === "QUOTED" ? [["Quote expires", displayTime(quote.validUntil)]] : [])]
          .map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 border-b border-dashed border-zinc-200 pb-2">
            <dt className="text-zinc-500">{label}</dt><dd className="font-semibold">{value}</dd>
          </div>)}
      </dl>
      <div className="border-y border-amber-300/50 bg-amber-100/70 p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider">Total charter price</p>
        <p className="mt-2 font-mono text-3xl font-black">{money.format(Number(quote.total))}</p>
        <p className="mt-1 text-xs">{quote.vat === "INCL" ? "Including" : "Excluding"} VAT</p>
      </div>
      <div className="p-5 text-xs">
        <p className="font-bold uppercase">Quote terms</p>
        <p className="mt-2 whitespace-pre-wrap leading-relaxed text-zinc-600">{quote.terms || "No additional terms supplied."}</p>
      </div>
    </div>
    <div className="grid min-w-0 content-start gap-4">
      {quote.vehicles.map((vehicle) => <article key={vehicle.id} className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="relative flex h-48 items-center justify-center bg-gradient-to-br from-white via-[#f5f5f3] to-[#e8e8e4] sm:h-56">
          <img src={passengerVehicleAsset({ type: vehicle.type ?? "COACH", model: vehicle.model })}
            alt={`Illustrative ${vehicle.make} ${vehicle.model}`} loading="lazy" className="h-full w-full object-contain px-6 py-5" />
          <span className="absolute bottom-2 right-3 rounded-full bg-white/90 px-2 py-1 text-[9px] text-zinc-500">Illustrative image</span>
        </div>
        <div className="grid gap-3 p-4">
          <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{booking.supplier}</p>
            <h3 className="mt-1 text-lg font-bold">{vehicle.make} {vehicle.model}</h3></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3"><p className="text-[10px] uppercase text-muted-foreground">Registration</p><p className="mt-1 font-mono text-sm font-bold">{vehicle.registration}</p></div>
            <div className="rounded-lg border border-border bg-muted/30 p-3"><p className="text-[10px] uppercase text-muted-foreground">Passenger capacity</p><p className="mt-1 text-sm font-bold">{vehicle.seats} seats</p></div>
          </div>
        </div>
      </article>)}
      <div className="rounded-xl border border-border bg-card p-4 text-xs">
        <p className="font-bold uppercase tracking-wide text-muted-foreground">Reserved for your itinerary</p>
        <p className="mt-2">{displayTime(quote.start)} – {displayTime(quote.end)}</p>
        <p className="mt-2 text-muted-foreground">Review the vehicle, itinerary and total price before confirming your booking.</p>
      </div>
    </div>
  </section>;
}

function LegSummary({ leg, title }: { leg: Leg; title: string }) {
  return <section className="grid gap-2 rounded-xl border border-border p-3 text-sm">
    <h3 className="font-semibold">{title}</h3>
    <ol className="grid gap-3">
      {[leg.origin, ...leg.stops, leg.destination].map((point, index, points) => <li key={index} className="flex min-w-0 gap-3">
        <span className={`mt-1 size-2.5 shrink-0 rounded-full ${index === 0 ? "bg-signal" : "border-2 border-foreground"}`} />
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {index === 0 ? "Pickup" : index === points.length - 1 ? "Destination" : `Stop ${index}`}</p>
          <p className="mt-1 break-words font-medium">{point.label}</p></div>
      </li>)}
    </ol>
    <p className="flex gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0" /> {displayTime(leg.pickupAt)}</p>
    <p>Estimated arrival {displayTime(leg.estimatedArrival)} · {leg.distanceKm} km{leg.routeProvider === "estimated" && " (estimated route)"}</p>
    <p>{leg.passengers} passengers · {leg.wheelchairPositions} wheelchair positions · {leg.luggageKg} kg / {leg.luggageM3} m³ luggage</p>
    {leg.largestBag && <p>Largest item {leg.largestBag.lengthM} × {leg.largestBag.widthM} × {leg.largestBag.heightM} m</p>}
  </section>;
}

function QuoteForm({ booking, vehicles, busy, onSubmit, onClose }: {
  booking: Booking; vehicles: FleetVehicle[]; busy: boolean; onSubmit: (data: unknown) => void; onClose: () => void;
}) {
  const lastLeg = booking.returnLeg ?? booking.outbound;
  const [start, setStart] = useState(() => localTime(booking.quote?.start ?? booking.outbound.pickupAt));
  const [end, setEnd] = useState(() => localTime(booking.quote?.end ?? lastLeg.estimatedArrival));
  const [manualIds, setManualIds] = useState<string[] | null>(() => booking.quote?.vehicles.map((vehicle) => vehicle.id) ?? (booking.allowSplit ? null : [booking.vehicleId]));
  const validWindow = Boolean(start && end && start < end);
  const { authParty } = useTamp();
  const recommendation = useQuery({
    queryKey: ["charter-recommend", authParty?.id, authParty?.activeOrganisationId, booking.id, booking.version, start, end],
    queryFn: () => trpc.query<{ vehicleIds: string[] }>("charter.recommend", {
      id: booking.id, version: booking.version, start: sasTime(start), end: sasTime(end),
    }),
    enabled: validWindow && booking.allowSplit,
    retry: false,
  });
  const suggestedIds = recommendation.data?.vehicleIds ?? [];
  const availableIds = new Set(vehicles.map((vehicle) => vehicle.id));
  const selected = (manualIds ?? suggestedIds).filter((id) => availableIds.has(id));
  const recommendationPending = validWindow && recommendation.isFetching;
  return <form className="grid gap-3 rounded-xl border border-border p-3" onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      id: booking.id, version: booking.version, vehicleIds: selected, total: read(form, "total"),
      vat: read(form, "vat"), terms: read(form, "terms"), start: sasTime(read(form, "start")),
      end: sasTime(read(form, "end")), validUntil: sasTime(read(form, "validUntil")),
    });
  }}>
    <fieldset disabled={busy} className="grid gap-3">
      <legend className="mb-2 font-semibold">{booking.allowSplit ? "Vehicles for this quote" : "Customer’s selected vehicle"}</legend>
      {!booking.allowSplit && <p className="rounded-lg bg-muted/40 p-3 text-sm font-semibold">{booking.vehicleName}</p>}
      <p className="text-sm text-muted-foreground">A driver can be assigned after the customer accepts the quote.</p>
      {booking.allowSplit && <><div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
        {recommendationPending && <p>Checking your fleet for this itinerary…</p>}
        {!recommendationPending && validWindow && recommendation.isError && <p className="text-muted-foreground">
          {errorText(recommendation.error)}
        </p>}
        {!recommendationPending && recommendation.isSuccess && <p className="text-muted-foreground">
          {suggestedIds.length ? `${suggestedIds.length} recommended ${suggestedIds.length === 1 ? "vehicle" : "vehicles"}`
            : "No automatic allocation found for this window. Review your fleet or adjust the reservation window."}
        </p>}
        {suggestedIds.length > 0 && manualIds !== null && <button className={button} type="button" onClick={() => setManualIds(null)}>
          Use recommended vehicles
        </button>}
      </div>
      <div className="grid max-h-48 gap-2 overflow-auto">
        {vehicles.map((vehicle) => <label key={vehicle.id} className="flex gap-2 text-sm">
          <input type={booking.allowSplit ? "checkbox" : "radio"} name={booking.allowSplit ? undefined : "vehicle"} checked={selected.includes(vehicle.id)}
            onChange={(event) => setManualIds(!booking.allowSplit ? [vehicle.id] : event.target.checked
              ? [...selected, vehicle.id] : selected.filter((id) => id !== vehicle.id))} />
          {vehicle.registration} · {vehicle.make} {vehicle.model} · {vehicle.seats} seats
        </label>)}
      </div>
      </>}
      {!vehicles.length && <p className="text-sm text-muted-foreground">No passenger fleet vehicles are available to quote.</p>}
      <p className="text-sm text-muted-foreground">Include time to reach pickup, wait between legs and finish after drop-off.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Reserve from (SAST) *"><input className={field} type="datetime-local" name="start" required value={start} onChange={(event) => setStart(event.target.value)} /></Field>
        <Field label="Reserve until (SAST) *"><input className={field} type="datetime-local" name="end" required value={end} onChange={(event) => setEnd(event.target.value)} /></Field>
        <Field label="Total price (ZAR) *"><input className={field} type="number" min="0.01" max="99999999.99" step="0.01" name="total" required defaultValue={booking.quote?.total} /></Field>
        <Field label="VAT treatment"><select className={field} name="vat" defaultValue={booking.quote?.vat ?? "EXCL"}><option value="EXCL">Excluding VAT</option><option value="INCL">Including VAT</option></select></Field>
        <Field label="Quote expires (SAST) *"><input className={field} type="datetime-local" name="validUntil" required defaultValue={booking.quote ? localTime(booking.quote.validUntil) : undefined} /></Field>
      </div>
      <Field label="Quote terms"><textarea className={field} maxLength={1500} name="terms" rows={2} defaultValue={booking.quote?.terms} /></Field>
    </fieldset>
    <div className="flex gap-2">
      <button type="button" className={button} disabled={busy} onClick={onClose}>Back</button>
      <button className={primary} disabled={busy || !validWindow || !selected.length}>{busy ? "Sending…" : "Send quote"}</button>
    </div>
  </form>;
}
