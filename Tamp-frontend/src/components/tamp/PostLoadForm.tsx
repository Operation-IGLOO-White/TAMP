import { useEffect, useState } from "react";
import { AddressInput } from "@/components/tamp/AddressInput";
import { computeRoute } from "@/fns/routes";
import { formatMoney, PLACES } from "@/lib/tamp-data";
import { bodyTypesForCargo, roadDistanceKm } from "@/lib/tamp-matching";
import { priceLoad } from "@/lib/tamp-pricing";
import { useTamp } from "@/lib/tamp-store";
import type { CargoType, Place } from "@/lib/tamp-types";

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
    origin: PLACES.johannesburg as Place,
    destination: PLACES.durban as Place,
    cargoType: "GENERAL_PALLETISED" as CargoType,
    weightKg: 24000,
    volumeM3: 0,
    pickupDate: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10),
    deliveryDate: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10),
    specialRequirements: "",
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const origin = form.origin;
  const destination = form.destination;

  // Real driving distance/time from the Google Routes API (falls back to the
  // straight-line estimate until it resolves or when no key is configured).
  const [route, setRoute] = useState<{ km: number; min: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setRoute(null);
    computeRoute(origin, destination)
      .then((r) => {
        if (!cancelled && r) setRoute({ km: r.distanceKm, min: r.durationMin });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [origin.lat, origin.lng, destination.lat, destination.lng]);

  const distanceKm = route?.km ?? roadDistanceKm(origin, destination);
  // Platform-derived: cargo type → suitable trucks; pricing engine → quote.
  const suitableBodies = bodyTypesForCargo(form.cargoType);
  const quote = priceLoad(distanceKm, form.weightKg, form.cargoType);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const pickupFrom = new Date(`${form.pickupDate}T08:00:00`).toISOString();
        const pickupTo = new Date(`${form.pickupDate}T17:00:00`).toISOString();
        addLoad({
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
        });
        onDone();
      }}
      className="p-4 border-b border-border bg-graphite/60 grid grid-cols-4 gap-3 animate-slide"
    >
      <Field label="Origin">
        <AddressInput
          value={form.origin}
          onSelect={(p) => set("origin", p)}
          placeholder="Pick-up address…"
        />
      </Field>
      <Field label="Destination">
        <AddressInput
          value={form.destination}
          onSelect={(p) => set("destination", p)}
          placeholder="Drop-off address…"
        />
      </Field>
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
      {role !== "FREIGHT_OWNER" && (
        <p className="col-span-4 text-[10px] text-muted-foreground">
          Posted as {me.companyName}.
        </p>
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
