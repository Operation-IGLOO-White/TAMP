import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AddressInput } from "@/components/tamp/AddressInput";
import { computeRoute } from "@/fns/routes";
import { formatMoney } from "@/lib/tamp-data";
import { bodyTypesForCargo, roadDistanceKm } from "@/fns/matching";
import { priceLoad, type PriceBreakdown } from "@/fns/pricing";
import { useTamp } from "@/context/TampContext";
import type { BodyType, CargoType, LoadStopKind, Place } from "@/types/domain";

type DraftStop = {
  id: string;
  kind: LoadStopKind;
  place: Place | null;
  date: string;
  contactName: string;
  contactPhone: string;
  instructions: string;
  cargoWeightKg: number;
};

const cargoTypes: { value: CargoType; label: string }[] = [
  { value: "GENERAL_PALLETISED", label: "General palletised" },
  { value: "BULK_DRY", label: "Bulk dry" },
  { value: "BULK_LIQUID", label: "Bulk liquid" },
  { value: "REFRIGERATED", label: "Refrigerated" },
  { value: "ABNORMAL", label: "Abnormal" },
  { value: "CONTAINERISED", label: "Containerised" },
  { value: "LIVESTOCK", label: "Livestock" },
  { value: "HAZARDOUS", label: "Hazardous" },
];

export function PostLoadForm({ onDone }: { onDone: () => void }) {
  const { role, addLoad, me } = useTamp();
  const [form, setForm] = useState({
    origin: null as Place | null,
    destination: null as Place | null,
    cargoType: "GENERAL_PALLETISED" as CargoType,
    weightKg: 24000,
    volumeM3: 0,
    pickupDate: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10),
    deliveryDate: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10),
    specialRequirements: "",
  });
  const [intermediateStops, setIntermediateStops] = useState<DraftStop[]>([]);
  const [error, setError] = useState("");

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const origin = form.origin;
  const destination = form.destination;
  const routePlaces = useMemo(
    () => [
      ...(origin ? [origin] : []),
      ...intermediateStops.flatMap((stop) => (stop.place ? [stop.place] : [])),
      ...(destination ? [destination] : []),
    ],
    [origin, destination, intermediateStops],
  );
  const routeKey = routePlaces.map((place) => `${place.lat},${place.lng}`).join("|");

  // Real driving distance/time from the Google Routes API (falls back to the
  // straight-line estimate until it resolves or when no key is configured).
  const [route, setRoute] = useState<{ km: number; min: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setRoute(null);
    if (!origin || !destination) return;
    Promise.all(
      routePlaces.slice(0, -1).map((place, index) => computeRoute(place, routePlaces[index + 1]!)),
    )
      .then((legs) => {
        if (!cancelled && legs.every(Boolean)) {
          setRoute({
            km: legs.reduce((total, leg) => total + (leg?.distanceKm ?? 0), 0),
            min: legs.reduce((total, leg) => total + (leg?.durationMin ?? 0), 0),
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [origin, destination, routeKey, routePlaces]);

  // Straight-line fallback distance, from the backend (src/fns/matching.ts),
  // used until the driving-route effect above resolves.
  const [fallbackDistanceKm, setFallbackDistanceKm] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (!origin || !destination) {
      setFallbackDistanceKm(0);
      return;
    }
    Promise.all(
      routePlaces
        .slice(0, -1)
        .map((place, index) => roadDistanceKm(place, routePlaces[index + 1]!)),
    ).then((legs) => {
      if (!cancelled) setFallbackDistanceKm(legs.reduce((total, km) => total + km, 0));
    });
    return () => {
      cancelled = true;
    };
  }, [origin, destination, routeKey, routePlaces]);

  const distanceKm = route?.km ?? fallbackDistanceKm;

  // Platform-derived: cargo type → suitable trucks (src/fns/matching.ts).
  const [suitableBodies, setSuitableBodies] = useState<BodyType[]>([]);
  useEffect(() => {
    let cancelled = false;
    bodyTypesForCargo(form.cargoType).then((b) => {
      if (!cancelled) setSuitableBodies(b);
    });
    return () => {
      cancelled = true;
    };
  }, [form.cargoType]);

  // Pricing engine → quote (src/fns/pricing.ts).
  const [quote, setQuote] = useState<PriceBreakdown>({
    amount: 0,
    perKm: 0,
    distanceKm: 0,
    components: [],
  });
  useEffect(() => {
    let cancelled = false;
    priceLoad(distanceKm, form.weightKg, form.cargoType).then((q) => {
      if (!cancelled) setQuote(q);
    });
    return () => {
      cancelled = true;
    };
  }, [distanceKm, form.weightKg, form.cargoType]);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!origin || !destination) {
          setError("Select both an origin and destination address.");
          return;
        }
        if (intermediateStops.some((stop) => !stop.place)) {
          setError("Select an address for every intermediate stop.");
          return;
        }
        setError("");
        const pickupFrom = new Date(`${form.pickupDate}T08:00:00`).toISOString();
        const pickupTo = new Date(`${form.pickupDate}T17:00:00`).toISOString();
        const at = (date: string, hour: string) => new Date(`${date}T${hour}:00`).toISOString();
        const stops = [
          {
            id: `LS-${crypto.randomUUID()}`,
            sequence: 0,
            kind: "PICKUP" as const,
            place: origin,
            window: { from: pickupFrom, to: pickupTo },
            cargoWeightKg: form.weightKg,
            status: "PENDING" as const,
          },
          ...intermediateStops.map((stop, index) => ({
            id: stop.id,
            sequence: index + 1,
            kind: stop.kind,
            place: stop.place!,
            window: { from: at(stop.date, "08:00"), to: at(stop.date, "17:00") },
            ...(stop.contactName.trim() ? { contactName: stop.contactName.trim() } : {}),
            ...(stop.contactPhone.trim() ? { contactPhone: stop.contactPhone.trim() } : {}),
            ...(stop.instructions.trim() ? { instructions: stop.instructions.trim() } : {}),
            ...(stop.cargoWeightKg > 0 ? { cargoWeightKg: stop.cargoWeightKg } : {}),
            status: "PENDING" as const,
          })),
          {
            id: `LS-${crypto.randomUUID()}`,
            sequence: intermediateStops.length + 1,
            kind: "DROPOFF" as const,
            place: destination,
            window: {
              from: at(form.deliveryDate, "08:00"),
              to: at(form.deliveryDate, "17:00"),
            },
            cargoWeightKg: form.weightKg,
            status: "PENDING" as const,
          },
        ];
        await addLoad({
          ownerId: me.id,
          cargoType: form.cargoType,
          weightKg: form.weightKg,
          volumeM3: form.volumeM3 || undefined,
          origin,
          destination,
          distanceKm,
          pickupWindow: { from: pickupFrom, to: pickupTo },
          deliveryBy: new Date(`${form.deliveryDate}T17:00:00`).toISOString(),
          specialRequirements: form.specialRequirements || undefined,
          stops,
        });
        onDone();
      }}
      className="p-4 border-b border-border bg-graphite/60 grid grid-cols-4 gap-3 animate-slide"
    >
      <Field label="Origin">
        <AddressInput value={form.origin} onSelect={(p) => set("origin", p)} placeholder="" />
      </Field>
      <Field label="Destination">
        <AddressInput
          value={form.destination}
          onSelect={(p) => set("destination", p)}
          placeholder=""
        />
      </Field>
      <div className="col-span-4 rounded-lg border border-border bg-background/50 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide">Intermediate stops</div>
            <p className="text-[10px] text-muted-foreground">
              Stops are visited in the order shown. Route distance and quote include every leg.
            </p>
          </div>
          <div className="flex gap-2">
            {(["PICKUP", "DROPOFF"] as LoadStopKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() =>
                  setIntermediateStops((items) => [
                    ...items,
                    {
                      id: `LS-${crypto.randomUUID()}`,
                      kind,
                      place: null,
                      date: kind === "PICKUP" ? form.pickupDate : form.deliveryDate,
                      contactName: "",
                      contactPhone: "",
                      instructions: "",
                      cargoWeightKg: 0,
                    },
                  ])
                }
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[10px] font-bold uppercase hover:border-signal"
              >
                <Plus className="size-3" /> {kind === "PICKUP" ? "Add pickup" : "Add delivery"}
              </button>
            ))}
          </div>
        </div>
        {intermediateStops.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            Direct delivery — add a stop for collections or split deliveries.
          </p>
        ) : (
          <div className="space-y-3">
            {intermediateStops.map((stop, index) => (
              <div
                key={stop.id}
                className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-6"
              >
                <div className="md:col-span-2">
                  <Field label={`${index + 2}. ${stop.kind.toLowerCase()} address`}>
                    <AddressInput
                      value={stop.place}
                      onSelect={(place) =>
                        setIntermediateStops((items) =>
                          items.map((item) => (item.id === stop.id ? { ...item, place } : item)),
                        )
                      }
                      placeholder="Search address…"
                    />
                  </Field>
                </div>
                <Field label="Service date">
                  <input
                    type="date"
                    value={stop.date}
                    onChange={(event) =>
                      setIntermediateStops((items) =>
                        items.map((item) =>
                          item.id === stop.id ? { ...item, date: event.target.value } : item,
                        ),
                      )
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label="Contact">
                  <input
                    value={stop.contactName}
                    onChange={(event) =>
                      setIntermediateStops((items) =>
                        items.map((item) =>
                          item.id === stop.id ? { ...item, contactName: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="Name"
                    className={inputCls}
                  />
                </Field>
                <Field label="Phone">
                  <input
                    value={stop.contactPhone}
                    onChange={(event) =>
                      setIntermediateStops((items) =>
                        items.map((item) =>
                          item.id === stop.id
                            ? { ...item, contactPhone: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="+27…"
                    className={inputCls}
                  />
                </Field>
                <div className="flex items-end gap-2">
                  <Field label="Cargo kg">
                    <input
                      type="number"
                      min={0}
                      value={stop.cargoWeightKg || ""}
                      onChange={(event) =>
                        setIntermediateStops((items) =>
                          items.map((item) =>
                            item.id === stop.id
                              ? { ...item, cargoWeightKg: Number(event.target.value) }
                              : item,
                          ),
                        )
                      }
                      className={inputCls}
                    />
                  </Field>
                  <button
                    type="button"
                    aria-label="Remove stop"
                    onClick={() =>
                      setIntermediateStops((items) => items.filter((item) => item.id !== stop.id))
                    }
                    className="mb-0.5 rounded-md border border-border p-2 text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="md:col-span-6">
                  <Field label="Instructions">
                    <input
                      value={stop.instructions}
                      onChange={(event) =>
                        setIntermediateStops((items) =>
                          items.map((item) =>
                            item.id === stop.id
                              ? { ...item, instructions: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Gate, loading bay, reference…"
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Field label="Cargo type">
        <select
          value={form.cargoType}
          onChange={(e) => set("cargoType", e.target.value as CargoType)}
          className={inputCls}
        >
          {cargoTypes.map((c) => (
            <option key={c.value} value={c.value} className="bg-graphite">
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Suitable trucks (auto)">
        <div className="flex min-h-[34px] flex-wrap items-center gap-1 rounded-md border border-dashed border-border bg-background px-2 py-1.5">
          {suitableBodies.map((b) => (
            <span
              key={b}
              className="rounded bg-steel px-1.5 py-0.5 text-[10px] font-semibold text-foreground"
            >
              {b.replaceAll("_", " ")}
            </span>
          ))}
        </div>
      </Field>
      <Field label="Weight (kg)">
        <input
          type="number"
          value={form.weightKg}
          onChange={(e) => set("weightKg", Number(e.target.value))}
          className={inputCls}
        />
      </Field>
      <Field label="Volume (m³, optional)">
        <input
          type="number"
          min={0}
          value={form.volumeM3 || ""}
          placeholder="e.g. 60"
          onChange={(e) => set("volumeM3", Number(e.target.value))}
          className={inputCls}
        />
      </Field>
      <Field label="Deliver by">
        <input
          type="date"
          value={form.deliveryDate}
          min={form.pickupDate}
          onChange={(e) => set("deliveryDate", e.target.value)}
          className={inputCls}
        />
      </Field>
      <Field label="Pick-up date">
        <input
          type="date"
          value={form.pickupDate}
          onChange={(e) => set("pickupDate", e.target.value)}
          className={inputCls}
        />
      </Field>
      <Field label="Platform quote (auto)">
        <div
          className="flex min-h-[34px] flex-col justify-center rounded-md border border-dashed border-signal/50 bg-signal/5 px-2 py-1"
          title={quote.components
            .map((c) => `${c.label}: R ${c.amount.toLocaleString("en-ZA")}`)
            .join("\n")}
        >
          <span className="font-mono text-sm font-bold text-foreground">
            {formatMoney({ amount: quote.amount, currency: "ZAR", vat: "excl" })}
          </span>
          <span className="text-[9px] text-muted-foreground">
            ≈ R {quote.perKm}/km · engine-set
          </span>
        </div>
      </Field>
      <Field label={route ? "Driving distance" : "Estimated distance"}>
        <div className="py-1.5 font-mono text-xs">
          {distanceKm} km
          {route && (
            <span className="text-muted-foreground">
              {" "}
              · {Math.floor(route.min / 60)}h {route.min % 60}m
            </span>
          )}
        </div>
      </Field>
      <div className="col-span-4">
        <Field label="Special requirements (optional)">
          <input
            value={form.specialRequirements}
            onChange={(e) => set("specialRequirements", e.target.value)}
            placeholder="Tail-lift required, etc."
            className={inputCls}
          />
        </Field>
      </div>
      <div className="flex items-end gap-2 col-span-4">
        <button
          type="submit"
          className="flex-1 bg-signal text-signal-foreground px-4 py-1.5 text-xs font-bold uppercase tracking-tight hover:brightness-110"
        >
          Publish
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-1.5 text-xs font-bold uppercase border border-border text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      {error && <p className="col-span-4 text-xs font-semibold text-danger">{error}</p>}
      {role !== "FREIGHT_OWNER" && (
        <p className="col-span-4 text-[10px] text-muted-foreground">Posted as {me.companyName}.</p>
      )}
    </form>
  );
}

const inputCls =
  "w-full bg-background border border-border px-2 py-1.5 text-xs text-foreground outline-none focus:border-signal";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground block mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
