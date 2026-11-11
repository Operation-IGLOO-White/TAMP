import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarDays, Check, MapPin, Package, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AddressInput } from "@/components/tamp/AddressInput";
import { useTamp } from "@/context/TampContext";
import { bodyTypesForCargo, roadDistanceKm } from "@/fns/matching";
import { priceLoad, type PriceBreakdown } from "@/fns/pricing";
import { computeRoute } from "@/fns/routes";
import { formatMoney } from "@/lib/tamp-data";
import type { BodyType, CargoType, Load, LoadStopKind, Place } from "@/types/domain";

type DraftStop = { id: string; kind: LoadStopKind; place: Place | null; date: string; contactName: string; contactPhone: string; instructions: string; cargoWeightKg: number };
type RecurrenceMode = "NONE" | "WEEKLY" | "SPECIFIC_DAYS";
type FormState = { origin: Place | null; destination: Place | null; cargoType: CargoType; weightKg: number; volumeM3: number; pickupDate: string; pickupTime: string; deliveryDate: string; deliveryTime: string; recurrenceMode: RecurrenceMode; recurrenceDays: number[]; recurrenceEnds: string; specialRequirements: string };

const cargoTypes: { value: CargoType; label: string }[] = [
  { value: "GENERAL_PALLETISED", label: "General palletised" }, { value: "BULK_DRY", label: "Bulk dry" },
  { value: "BULK_LIQUID", label: "Bulk liquid" }, { value: "REFRIGERATED", label: "Refrigerated" },
  { value: "ABNORMAL", label: "Abnormal" }, { value: "CONTAINERISED", label: "Containerised" },
  { value: "LIVESTOCK", label: "Livestock" }, { value: "HAZARDOUS", label: "Hazardous" },
];
const steps = [{ label: "Route", icon: MapPin }, { label: "Cargo", icon: Package }, { label: "Schedule", icon: CalendarDays }, { label: "Review", icon: Check }] as const;
const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const datePart = (value: string | undefined, fallback: string) => value?.slice(0, 10) || fallback;
const timePart = (value: string | undefined, fallback: string) => value?.slice(11, 16) || fallback;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function nextRecurringDate(fromDate: string, time: string, daysOfWeek: number[]) {
  const cursor = new Date(`${fromDate}T${time}:00`);
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = new Date(cursor);
    candidate.setDate(candidate.getDate() + offset);
    const mondayIndex = (candidate.getDay() + 6) % 7;
    if (daysOfWeek.includes(mondayIndex)) {
      candidate.setHours(0, 5, 0, 0);
      return candidate.toISOString();
    }
  }
  return new Date(cursor.getTime() + 7 * 864e5).toISOString();
}

function initialForm(load?: Load): FormState {
  const recurrenceMode: RecurrenceMode = load?.recurrence?.frequency ?? "NONE";
  return { origin: load?.origin ?? null, destination: load?.destination ?? null, cargoType: load?.cargoType ?? "GENERAL_PALLETISED", weightKg: load?.weightKg ?? 24000, volumeM3: load?.volumeM3 ?? 0, pickupDate: datePart(load?.pickupWindow.from, day(3)), pickupTime: timePart(load?.pickupWindow.from, "08:00"), deliveryDate: datePart(load?.deliveryBy, day(5)), deliveryTime: timePart(load?.deliveryBy, "17:00"), recurrenceMode, recurrenceDays: load?.recurrence?.daysOfWeek ?? [], recurrenceEnds: datePart(load?.recurrence?.endsOn, ""), specialRequirements: load?.specialRequirements ?? "" };
}
function initialStops(load?: Load): DraftStop[] {
  return (load?.stops ?? []).slice().sort((a, b) => a.sequence - b.sequence).slice(1, -1).map((stop) => ({ id: stop.id, kind: stop.kind, place: stop.place, date: datePart(stop.window.from, datePart(load?.pickupWindow.from, day(3))), contactName: stop.contactName ?? "", contactPhone: stop.contactPhone ?? "", instructions: stop.instructions ?? "", cargoWeightKg: stop.cargoWeightKg ?? 0 }));
}

export function PostLoadForm({ onDone, initialLoad }: { onDone: () => void; initialLoad?: Load }) {
  const { role, addLoad, updateLoad, me } = useTamp();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => initialForm(initialLoad));
  const [stops, setStops] = useState<DraftStop[]>(() => initialStops(initialLoad));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const updateStop = (id: string, patch: Partial<DraftStop>) => setStops((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const addStop = (kind: LoadStopKind) => setStops((items) => [...items, { id: `LS-${crypto.randomUUID()}`, kind, place: null, date: kind === "PICKUP" ? form.pickupDate : form.deliveryDate, contactName: "", contactPhone: "", instructions: "", cargoWeightKg: 0 }]);
  const moveStop = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= stops.length) return;
    setStops((items) => { const next = [...items]; [next[index], next[target]] = [next[target]!, next[index]!]; return next; });
  };

  const routePlaces = useMemo(() => [...(form.origin ? [form.origin] : []), ...stops.flatMap((stop) => stop.place ? [stop.place] : []), ...(form.destination ? [form.destination] : [])], [form.origin, form.destination, stops]);
  const routeKey = routePlaces.map((place) => `${place.lat},${place.lng}`).join("|");
  const [route, setRoute] = useState<{ km: number; min: number } | null>(null);
  const [fallbackDistanceKm, setFallbackDistanceKm] = useState(0);
  useEffect(() => {
    let cancelled = false; setRoute(null);
    if (routePlaces.length < 2) return;
    Promise.all(routePlaces.slice(0, -1).map((place, index) => computeRoute(place, routePlaces[index + 1]!))).then((legs) => { if (!cancelled && legs.every(Boolean)) setRoute({ km: legs.reduce((total, leg) => total + (leg?.distanceKm ?? 0), 0), min: legs.reduce((total, leg) => total + (leg?.durationMin ?? 0), 0) }); }).catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);
  useEffect(() => {
    let cancelled = false;
    if (routePlaces.length < 2) { setFallbackDistanceKm(0); return; }
    Promise.all(routePlaces.slice(0, -1).map((place, index) => roadDistanceKm(place, routePlaces[index + 1]!))).then((legs) => { if (!cancelled) setFallbackDistanceKm(legs.reduce((total, km) => total + km, 0)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);
  const distanceKm = route?.km ?? fallbackDistanceKm;
  const [suitableBodies, setSuitableBodies] = useState<BodyType[]>([]);
  useEffect(() => { let cancelled = false; bodyTypesForCargo(form.cargoType).then((bodies) => { if (!cancelled) setSuitableBodies(bodies); }); return () => { cancelled = true; }; }, [form.cargoType]);
  const [quote, setQuote] = useState<PriceBreakdown>({ amount: 0, perKm: 0, distanceKm: 0, components: [] });
  useEffect(() => { let cancelled = false; priceLoad(distanceKm, form.weightKg, form.cargoType).then((next) => { if (!cancelled) setQuote(next); }); return () => { cancelled = true; }; }, [distanceKm, form.weightKg, form.cargoType]);

  const validationError = (target: number) => {
    if (target === 0) { if (!form.origin) return "Select the collection origin before continuing."; const incomplete = stops.findIndex((stop) => !stop.place); if (incomplete >= 0) return `Select an address for stop ${incomplete + 2}.`; if (!form.destination) return "Select the final delivery destination before continuing."; }
    if (target === 1) { if (!Number.isFinite(form.weightKg) || form.weightKg <= 0) return "Enter the total cargo weight in kilograms."; if (form.volumeM3 < 0) return "Volume cannot be less than zero."; }
    if (target === 2) { const dates = [form.pickupDate, ...stops.map((stop) => stop.date), form.deliveryDate]; if (dates.some((date) => !date)) return "Choose a service date for every route point."; if (!form.pickupTime || !form.deliveryTime) return "Choose both the pickup time and final destination time."; const pickupAt = new Date(`${form.pickupDate}T${form.pickupTime}:00`).getTime(); const deliveryAt = new Date(`${form.deliveryDate}T${form.deliveryTime}:00`).getTime(); if (deliveryAt <= pickupAt) return "Final destination time must be after the pickup time."; const bad = dates.findIndex((date, index) => index > 0 && date < dates[index - 1]!); if (bad >= 0) return `Route point ${bad + 1} is dated before the previous stop. Adjust the dates or reorder the stops.`; if (form.recurrenceMode === "SPECIFIC_DAYS" && form.recurrenceDays.length === 0) return "Choose at least one recurring day."; if (form.recurrenceEnds && form.recurrenceEnds < form.pickupDate) return "The recurring end date cannot be before the first pickup."; }
    return "";
  };
  const goNext = () => { const message = validationError(step); if (message) { setError(message); return; } setError(""); setStep((current) => Math.min(current + 1, steps.length - 1)); };
  const submit = async () => {
    const message = [0, 1, 2].map(validationError).find(Boolean); if (message) { setError(message); return; }
    if (!form.origin || !form.destination) return;
    setSaving(true); setError("");
    try {
      const at = (date: string, hour: string) => new Date(`${date}T${hour}:00`).toISOString();
      const pickupFrom = at(form.pickupDate, form.pickupTime); const pickupTo = new Date(new Date(pickupFrom).getTime() + 60 * 60_000).toISOString();
      const savedStops = [
        { id: initialLoad?.stops?.[0]?.id ?? `LS-${crypto.randomUUID()}`, sequence: 0, kind: "PICKUP" as const, place: form.origin, window: { from: pickupFrom, to: pickupTo }, cargoWeightKg: form.weightKg, status: "PENDING" as const },
        ...stops.map((stop, index) => ({ id: stop.id, sequence: index + 1, kind: stop.kind, place: stop.place!, window: { from: at(stop.date, "08:00"), to: at(stop.date, "17:00") }, ...(stop.contactName.trim() ? { contactName: stop.contactName.trim() } : {}), ...(stop.contactPhone.trim() ? { contactPhone: stop.contactPhone.trim() } : {}), ...(stop.instructions.trim() ? { instructions: stop.instructions.trim() } : {}), ...(stop.cargoWeightKg > 0 ? { cargoWeightKg: stop.cargoWeightKg } : {}), status: "PENDING" as const })),
        { id: initialLoad?.stops?.at(-1)?.id ?? `LS-${crypto.randomUUID()}`, sequence: stops.length + 1, kind: "DROPOFF" as const, place: form.destination, window: { from: at(form.deliveryDate, form.deliveryTime), to: at(form.deliveryDate, form.deliveryTime) }, cargoWeightKg: form.weightKg, status: "PENDING" as const },
      ];
      const recurrenceDays = form.recurrenceMode === "WEEKLY" ? [(new Date(`${form.pickupDate}T12:00:00`).getDay() + 6) % 7] : form.recurrenceDays;
      const recurrence = form.recurrenceMode === "NONE" ? undefined : { scheduleId: initialLoad?.recurrence?.scheduleId ?? `RS-${crypto.randomUUID()}`, frequency: form.recurrenceMode, daysOfWeek: recurrenceDays, nextPostAt: nextRecurringDate(form.pickupDate, form.pickupTime, recurrenceDays), ...(form.recurrenceEnds ? { endsOn: at(form.recurrenceEnds, "23:59") } : {}), active: true, isTemplate: true };
      const input = { ownerId: initialLoad?.ownerId ?? me.id, cargoType: form.cargoType, weightKg: form.weightKg, volumeM3: form.volumeM3 || undefined, origin: form.origin, destination: form.destination, distanceKm, pickupWindow: { from: pickupFrom, to: pickupTo }, deliveryBy: at(form.deliveryDate, form.deliveryTime), specialRequirements: form.specialRequirements.trim() || undefined, stops: savedStops, ...(recurrence ? { recurrence } : {}) };
      if (initialLoad) await updateLoad(initialLoad.id, input); else await addLoad(input);
      onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We could not save this load. Please try again."); } finally { setSaving(false); }
  };

  return <section className="border-b border-border bg-background/95 animate-slide">
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
      <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-signal">{initialLoad ? `Editing ${initialLoad.reference}` : "New freight request"}</p><h2 className="mt-1 text-xl font-bold sm:text-2xl">{initialLoad ? "Update your load" : "Post a load"}</h2><p className="mt-1 text-xs text-muted-foreground sm:text-sm">Complete one clear step at a time. You can review everything before saving.</p></div><button type="button" onClick={onDone} aria-label="Close load form" className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-steel/30 hover:text-foreground"><X className="size-5" /></button></div>
      <nav aria-label="Load form progress" className="mb-6 grid grid-cols-4 gap-1 sm:gap-2">{steps.map((item, index) => { const Icon = item.icon; const active = index === step; const complete = index < step; return <button key={item.label} type="button" onClick={() => index < step && setStep(index)} className={`flex min-w-0 flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[9px] font-bold uppercase tracking-wide transition sm:flex-row sm:justify-center sm:px-3 sm:text-xs ${active ? "border-signal bg-signal/10 text-foreground" : complete ? "border-success/40 bg-success/5 text-foreground" : "border-border text-muted-foreground"}`}><span className={`grid size-6 shrink-0 place-items-center rounded-full ${active ? "bg-signal text-signal-foreground" : complete ? "bg-success text-white" : "bg-steel"}`}>{complete ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}</span><span className="truncate">{item.label}</span></button>; })}</nav>
      <form onSubmit={(event) => event.preventDefault()}>
        {step === 0 && <RouteStep form={form} set={set} stops={stops} updateStop={updateStop} addStop={addStop} moveStop={moveStop} removeStop={(id) => setStops((items) => items.filter((item) => item.id !== id))} />}
        {step === 1 && <CargoStep form={form} set={set} suitableBodies={suitableBodies} />}
        {step === 2 && <ScheduleStep form={form} set={set} stops={stops} updateStop={updateStop} />}
        {step === 3 && <ReviewStep form={form} stops={stops} suitableBodies={suitableBodies} distanceKm={distanceKm} durationMin={route?.min} quote={quote} onEdit={setStep} />}
        {error && <div role="alert" className="mt-5 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm font-semibold text-danger">{error}</div>}
        {role !== "FREIGHT_OWNER" && <p className="mt-3 text-[10px] text-muted-foreground">This load will be posted as {me.companyName}.</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={() => step === 0 ? onDone() : (setError(""), setStep((current) => current - 1))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-5 text-sm font-bold uppercase tracking-wide hover:bg-steel/30"><ArrowLeft className="size-4" /> {step === 0 ? "Cancel" : "Back"}</button>{step < steps.length - 1 ? <button type="button" onClick={goNext} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-signal px-6 text-sm font-black uppercase tracking-wide text-signal-foreground hover:brightness-105">Continue <ArrowRight className="size-4" /></button> : <button type="button" disabled={saving} onClick={submit} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-signal px-6 text-sm font-black uppercase tracking-wide text-signal-foreground hover:brightness-105 disabled:opacity-60"><Check className="size-4" /> {saving ? "Saving…" : initialLoad ? "Save changes" : "Publish load"}</button>}</div>
      </form>
    </div>
  </section>;
}

function RouteStep({ form, set, stops, updateStop, addStop, moveStop, removeStop }: { form: FormState; set: <K extends keyof FormState>(key: K, value: FormState[K]) => void; stops: DraftStop[]; updateStop: (id: string, patch: Partial<DraftStop>) => void; addStop: (kind: LoadStopKind) => void; moveStop: (index: number, direction: -1 | 1) => void; removeStop: (id: string) => void }) {
  return <div><StepHeading title="Build the route" description="Route points are visited from top to bottom. Add stops, then move them into the correct order." /><div className="space-y-3"><RoutePoint number={1} label="Collection origin" tone="start"><AddressInput value={form.origin} onSelect={(place) => set("origin", place)} placeholder="" /></RoutePoint>
    {stops.map((stop, index) => <div key={stop.id} className="rounded-xl border border-border bg-graphite p-3 sm:p-4"><div className="mb-3 flex items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-signal text-xs font-black text-signal-foreground">{index + 2}</span><button type="button" onClick={() => updateStop(stop.id, { kind: stop.kind === "PICKUP" ? "DROPOFF" : "PICKUP" })} className="rounded-full border border-border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide hover:border-signal">{stop.kind === "PICKUP" ? "Extra pickup" : "Delivery stop"}</button><span className="ml-auto hidden text-[10px] text-muted-foreground sm:inline">Position {index + 2}</span><button type="button" disabled={index === 0} onClick={() => moveStop(index, -1)} aria-label="Move stop earlier" className="rounded-md border border-border p-2 disabled:opacity-30"><ArrowUp className="size-4" /></button><button type="button" disabled={index === stops.length - 1} onClick={() => moveStop(index, 1)} aria-label="Move stop later" className="rounded-md border border-border p-2 disabled:opacity-30"><ArrowDown className="size-4" /></button><button type="button" onClick={() => removeStop(stop.id)} aria-label="Remove stop" className="rounded-md border border-danger/30 p-2 text-danger"><Trash2 className="size-4" /></button></div><AddressInput value={stop.place} onSelect={(place) => updateStop(stop.id, { place })} placeholder="Search the stop address" /><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Contact name (optional)"><input value={stop.contactName} onChange={(event) => updateStop(stop.id, { contactName: event.target.value })} className={inputCls} /></Field><Field label="Contact phone (optional)"><input value={stop.contactPhone} onChange={(event) => updateStop(stop.id, { contactPhone: event.target.value })} className={inputCls} inputMode="tel" /></Field></div></div>)}
    <RoutePoint number={stops.length + 2} label="Final destination" tone="end"><AddressInput value={form.destination} onSelect={(place) => set("destination", place)} placeholder="" /></RoutePoint></div><div className="mt-4 grid gap-2 sm:flex"><button type="button" onClick={() => addStop("PICKUP")} className={secondaryButton}><Plus className="size-4" /> Add pickup</button><button type="button" onClick={() => addStop("DROPOFF")} className={secondaryButton}><Plus className="size-4" /> Add delivery</button><p className="self-center text-xs text-muted-foreground sm:ml-2">Use the arrows to decide which stop comes first.</p></div></div>;
}

function CargoStep({ form, set, suitableBodies }: { form: FormState; set: <K extends keyof FormState>(key: K, value: FormState[K]) => void; suitableBodies: BodyType[] }) {
  return <div><StepHeading title="Describe the cargo" description="We use these details to find suitable trucks and calculate the platform quote." /><div className="grid gap-4 sm:grid-cols-2"><Field label="Cargo type"><select value={form.cargoType} onChange={(event) => set("cargoType", event.target.value as CargoType)} className={inputCls}>{cargoTypes.map((cargo) => <option key={cargo.value} value={cargo.value}>{cargo.label}</option>)}</select></Field><Field label="Total weight (kg)"><input type="number" min={1} value={form.weightKg || ""} onChange={(event) => set("weightKg", Number(event.target.value))} className={inputCls} inputMode="numeric" /></Field><Field label="Volume (m³, optional)"><input type="number" min={0} value={form.volumeM3 || ""} onChange={(event) => set("volumeM3", Number(event.target.value))} className={inputCls} inputMode="decimal" /></Field><Field label="Suitable trucks (automatic)"><div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-border bg-background px-3 py-2">{suitableBodies.map((body) => <span key={body} className="rounded-md bg-steel px-2 py-1 text-[10px] font-bold">{body.replaceAll("_", " ")}</span>)}</div></Field><div className="sm:col-span-2"><Field label="Special requirements (optional)"><textarea rows={4} value={form.specialRequirements} onChange={(event) => set("specialRequirements", event.target.value)} placeholder="Loading equipment, temperature, access or handling instructions" className={inputCls} /></Field></div></div></div>;
}

function ScheduleStep({ form, set, stops, updateStop }: { form: FormState; set: <K extends keyof FormState>(key: K, value: FormState[K]) => void; stops: DraftStop[]; updateStop: (id: string, patch: Partial<DraftStop>) => void }) {
  const toggleDay = (dayIndex: number) => set("recurrenceDays", form.recurrenceDays.includes(dayIndex) ? form.recurrenceDays.filter((day) => day !== dayIndex) : [...form.recurrenceDays, dayIndex].sort());
  const weeklyDay = WEEKDAYS[(new Date(`${form.pickupDate}T12:00:00`).getDay() + 6) % 7];
  return <div>
    <StepHeading title="Set the schedule" description="Choose exact pickup and final destination times. Route dates must follow the order shown." />
    <div className="space-y-3">
      <ScheduleRow number={1} title="Collection origin" address={form.origin?.label}>
        <div className="grid grid-cols-2 gap-2"><Field label="Pickup date"><input type="date" value={form.pickupDate} onChange={(event) => set("pickupDate", event.target.value)} className={inputCls} /></Field><Field label="Pickup time"><input type="time" value={form.pickupTime} onChange={(event) => set("pickupTime", event.target.value)} className={inputCls} /></Field></div>
      </ScheduleRow>
      {stops.map((stop, index) => <ScheduleRow key={stop.id} number={index + 2} title={stop.kind === "PICKUP" ? "Extra pickup" : "Delivery stop"} address={stop.place?.label}><input type="date" value={stop.date} min={index === 0 ? form.pickupDate : stops[index - 1]!.date} max={form.deliveryDate} onChange={(event) => updateStop(stop.id, { date: event.target.value })} className={inputCls} /><div className="mt-2 grid gap-2 sm:grid-cols-2"><input type="number" min={0} value={stop.cargoWeightKg || ""} onChange={(event) => updateStop(stop.id, { cargoWeightKg: Number(event.target.value) })} placeholder="Cargo kg at this stop" className={inputCls} /><input value={stop.instructions} onChange={(event) => updateStop(stop.id, { instructions: event.target.value })} placeholder="Stop instructions" className={inputCls} /></div></ScheduleRow>)}
      <ScheduleRow number={stops.length + 2} title="Final destination" address={form.destination?.label}>
        <div className="grid grid-cols-2 gap-2"><Field label="Delivery date"><input type="date" min={stops.at(-1)?.date ?? form.pickupDate} value={form.deliveryDate} onChange={(event) => set("deliveryDate", event.target.value)} className={inputCls} /></Field><Field label="Destination time"><input type="time" value={form.deliveryTime} onChange={(event) => set("deliveryTime", event.target.value)} className={inputCls} /></Field></div>
      </ScheduleRow>
    </div>

    <div className="mt-5 rounded-xl border border-border bg-graphite p-4">
      <div className="mb-3"><h4 className="text-sm font-bold">Does this load repeat?</h4><p className="mt-1 text-xs text-muted-foreground">TAMP will automatically create the next load on the selected days using the same route, cargo and timing.</p></div>
      <div className="grid gap-2 sm:grid-cols-3">
        {([{"value":"NONE","label":"One-time load"},{"value":"WEEKLY","label":"Every week"},{"value":"SPECIFIC_DAYS","label":"Specific days"}] as const).map((option) => <button type="button" key={option.value} onClick={() => set("recurrenceMode", option.value)} className={`rounded-lg border px-3 py-3 text-left text-xs font-bold ${form.recurrenceMode === option.value ? "border-signal bg-signal/10" : "border-border"}`}>{option.label}</button>)}
      </div>
      {form.recurrenceMode === "WEEKLY" && <p className="mt-3 rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">Repeats every <strong className="text-foreground">{weeklyDay}</strong> at {form.pickupTime}.</p>}
      {form.recurrenceMode === "SPECIFIC_DAYS" && <div className="mt-3"><div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Posting days</div><div className="grid grid-cols-4 gap-2 sm:grid-cols-7">{WEEKDAYS.map((label, index) => <button type="button" key={label} onClick={() => toggleDay(index)} className={`rounded-lg border px-2 py-2 text-xs font-bold ${form.recurrenceDays.includes(index) ? "border-signal bg-signal text-signal-foreground" : "border-border"}`}>{label}</button>)}</div></div>}
      {form.recurrenceMode !== "NONE" && <div className="mt-3 max-w-xs"><Field label="Repeat until (optional)"><input type="date" min={form.pickupDate} value={form.recurrenceEnds} onChange={(event) => set("recurrenceEnds", event.target.value)} className={inputCls} /></Field></div>}
    </div>
  </div>;
}

function ReviewStep({ form, stops, suitableBodies, distanceKm, durationMin, quote, onEdit }: { form: FormState; stops: DraftStop[]; suitableBodies: BodyType[]; distanceKm: number; durationMin: number | undefined; quote: PriceBreakdown; onEdit: (step: number) => void }) {
  const points = [{ label: form.origin?.label, kind: "Origin" }, ...stops.map((stop) => ({ label: stop.place?.label, kind: stop.kind === "PICKUP" ? "Pickup" : "Delivery" })), { label: form.destination?.label, kind: "Destination" }];
  return <div><StepHeading title="Review before publishing" description="Confirm the route order, cargo and dates. Posted loads can still be edited before a carrier is engaged." /><div className="grid gap-4 lg:grid-cols-2"><ReviewCard title="Route" onEdit={() => onEdit(0)}>{points.map((point, index) => <div key={`${point.kind}-${index}`} className="flex gap-3 py-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-steel text-[10px] font-black">{index + 1}</span><div><div className="text-[10px] font-bold uppercase text-muted-foreground">{point.kind}</div><div className="text-sm font-semibold">{point.label}</div></div></div>)}</ReviewCard><ReviewCard title="Cargo" onEdit={() => onEdit(1)}><Summary label="Type" value={cargoTypes.find((cargo) => cargo.value === form.cargoType)?.label ?? form.cargoType} /><Summary label="Weight" value={`${form.weightKg.toLocaleString("en-ZA")} kg`} /><Summary label="Volume" value={form.volumeM3 ? `${form.volumeM3} m³` : "Not specified"} /><Summary label="Suitable trucks" value={suitableBodies.join(", ").replaceAll("_", " ")} /></ReviewCard><ReviewCard title="Schedule" onEdit={() => onEdit(2)}><Summary label="Pickup" value={`${new Date(`${form.pickupDate}T12:00:00`).toLocaleDateString("en-ZA", { dateStyle: "long" })} at ${form.pickupTime}`} /><Summary label="Final destination" value={`${new Date(`${form.deliveryDate}T12:00:00`).toLocaleDateString("en-ZA", { dateStyle: "long" })} at ${form.deliveryTime}`} /><Summary label="Repeats" value={form.recurrenceMode === "NONE" ? "No — one-time load" : form.recurrenceMode === "WEEKLY" ? "Weekly" : form.recurrenceDays.map((day) => WEEKDAYS[day]).join(", ")} /><Summary label="Route points" value={`${points.length} total`} /></ReviewCard><div className="rounded-xl border border-signal/40 bg-signal/5 p-4 sm:p-5"><div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Platform quote</div><div className="mt-2 font-mono text-2xl font-black">{formatMoney({ amount: quote.amount, currency: "ZAR", vat: "excl" })}</div><div className="mt-2 text-sm text-muted-foreground">{distanceKm.toLocaleString("en-ZA")} km{durationMin ? ` · ${Math.floor(durationMin / 60)}h ${durationMin % 60}m` : ""}</div><div className="mt-1 text-xs text-muted-foreground">Approximately R {quote.perKm}/km · calculated automatically</div></div></div></div>;
}

function StepHeading({ title, description }: { title: string; description: string }) { return <div className="mb-5"><h3 className="text-lg font-bold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>; }
function RoutePoint({ number, label, tone, children }: { number: number; label: string; tone: "start" | "end"; children: React.ReactNode }) { return <div className="rounded-xl border border-border bg-graphite p-3 sm:p-4"><div className="mb-3 flex items-center gap-2"><span className={`grid size-7 place-items-center rounded-full text-xs font-black text-white ${tone === "start" ? "bg-success" : "bg-danger"}`}>{number}</span><span className="text-xs font-bold uppercase tracking-wide">{label}</span></div>{children}</div>; }
function ScheduleRow({ number, title, address, children }: { number: number; title: string; address: string | undefined; children: React.ReactNode }) { return <div className="grid gap-3 rounded-xl border border-border bg-graphite p-4 sm:grid-cols-[1fr_280px] sm:items-start"><div className="flex min-w-0 gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-steel text-xs font-black">{number}</span><div className="min-w-0"><div className="text-xs font-bold uppercase">{title}</div><div className="mt-1 truncate text-xs text-muted-foreground">{address}</div></div></div><div>{children}</div></div>; }
function ReviewCard({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) { return <div className="rounded-xl border border-border bg-graphite p-4 sm:p-5"><div className="mb-3 flex items-center justify-between"><h4 className="text-sm font-bold uppercase tracking-wide">{title}</h4><button type="button" onClick={onEdit} className="text-xs font-bold text-signal hover:underline">Edit</button></div>{children}</div>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 last:border-0"><span className="text-xs text-muted-foreground">{label}</span><span className="text-right text-xs font-semibold">{value}</span></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>{children}</label>; }
const inputCls = "w-full min-h-12 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/15";
const secondaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-xs font-bold uppercase hover:border-signal";
