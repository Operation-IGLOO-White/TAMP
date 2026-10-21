import { Camera, CheckCircle2, FileUp, MapPin, Pencil, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AddressInput } from "@/components/tamp/AddressInput";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { BODY_TYPE_LABEL, BodyTypeIcon } from "@/components/tamp/BodyTypeIcon";
import { StatusChip } from "@/components/tamp/StatusChip";
import { formatMoney, PLACES } from "@/lib/tamp-data";
import { scoreLoadAgainstTrucks } from "@/fns/matching";
import { uploadFile } from "@/fns/upload";
import { useTamp } from "@/context/TampContext";
import type { BodyType, Load, Place, TruckPosting, Vehicle } from "@/types/domain";

const bodyTypes: BodyType[] = [
  "TAUTLINER",
  "FLATBED",
  "TIPPER",
  "TANKER",
  "REFRIGERATED",
  "SIDE_TIPPER",
  "LOWBED",
  "DROPSIDE",
];

// Uber/Bolt-style vehicle onboarding: photos of the actual truck from each
// angle, plus the matching vehicle documents.
const TRUCK_PHOTOS = ["Front", "Left side", "Right side", "Rear"];
const TRUCK_DOCS = [
  "Vehicle licence disc (registration)",
  "Roadworthy certificate",
  "Insurance certificate",
];

const daysFromNow = (iso: string) =>
  Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 864e5));

function FleetPage() {
  const { me, loads, trucks, vehicles, parties, addTruck, updateTruck } = useTamp();
  const isDriver = me.role === "DRIVER";
  const openLoads = useMemo(() => loads.filter((l) => l.status === "POSTED"), [loads]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  // Search across registration, body type, location and status.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trucks;
    return trucks.filter((t) =>
      [
        t.registration,
        BODY_TYPE_LABEL[t.bodyType],
        t.currentLocation.label,
        t.currentLocation.province,
        t.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [trucks, query]);

  // Best-matching open load per truck (highest score it passes). Scored
  // server-side (src/fns/matching.ts) — one call per open load, scoring every
  // available truck at once, rather than one call per truck×load pair.
  const availableTrucks = useMemo(() => trucks.filter((t) => t.status === "AVAILABLE"), [trucks]);
  const [bestLoadByTruckId, setBestLoadByTruckId] = useState<
    Map<string, { load: Load; score: number }>
  >(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const best = new Map<string, { load: Load; score: number }>();
      await Promise.all(
        openLoads.map(async (load) => {
          const owner = parties.find((p) => p.id === load.ownerId);
          if (!owner || availableTrucks.length === 0) return;
          const scored = await scoreLoadAgainstTrucks(load, availableTrucks, parties, owner);
          for (const m of scored) {
            if (!m.passed) continue;
            const current = best.get(m.truck.id);
            if (!current || m.score > current.score) best.set(m.truck.id, { load, score: m.score });
          }
        }),
      );
      if (!cancelled) setBestLoadByTruckId(best);
    })();
    return () => {
      cancelled = true;
    };
  }, [openLoads, availableTrucks, parties]);

  const bestLoadFor = (truck: TruckPosting): { load: Load; score: number } | undefined =>
    bestLoadByTruckId.get(truck.id);

  return (
    <AppShell>
      <PageHeader
        title={isDriver ? "My Trucks" : "Fleet Register"}
        actions={
          <button
            onClick={() => setAdding((a) => !a)}
            className="inline-flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 text-xs font-bold uppercase tracking-wide text-signal-foreground hover:brightness-105"
          >
            {adding ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
            {adding ? "Cancel" : "Add truck"}
          </button>
        }
      />

      <p className="border-b border-border px-6 py-3 text-xs text-muted-foreground">
        Your trucks stay registered — no need to re-post. Edit an available truck's{" "}
        <span className="font-semibold text-foreground">
          capacity, availability and destination
        </span>{" "}
        any time, and see its best-matching open loads.
      </p>

      {adding && <AddTruckForm onDone={() => setAdding(false)} onAdd={addTruck} />}

      {trucks.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          No trucks yet. Add one to start receiving load matches.
        </div>
      ) : (
        <>
          <div className="px-4 pt-4 sm:px-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by registration, body type, location or status…"
                className="w-full rounded-lg border border-border bg-graphite py-2.5 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-signal focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            {query && (
              <p className="mt-2 text-xs text-muted-foreground">
                {filtered.length} of {trucks.length} trucks
              </p>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No trucks match “{query}”.
            </div>
          ) : (
            <div className="grid gap-4 p-4 sm:p-6 xl:grid-cols-2">
              {filtered.map((t) => (
                <TruckCard
                  key={t.id}
                  truck={t}
                  vehicle={vehicles.find((vehicle) => vehicle.id === t.vehicleId)}
                  operatorName={parties.find((p) => p.id === t.transporterId)?.companyName ?? "—"}
                  best={t.status === "AVAILABLE" ? bestLoadFor(t) : undefined}
                  onSave={(patch) => updateTruck(t.id, patch)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

function TruckCard({
  truck,
  vehicle,
  operatorName,
  best,
  onSave,
}: {
  truck: TruckPosting;
  vehicle: Vehicle | undefined;
  operatorName: string;
  best: { load: Load; score: number } | undefined;
  onSave: (patch: Partial<TruckPosting>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => ({
    status: truck.status,
    location: truck.currentLocation as Place,
    availableInDays: daysFromNow(truck.availableFrom),
    capacityKg: truck.payloadCapacityKg,
    dest: (truck.preferredLanes?.[0]
      ? { label: truck.preferredLanes[0].destination, province: "", lat: 0, lng: 0 }
      : null) as Place | null,
  }));

  const save = () => {
    onSave({
      status: form.status,
      currentLocation: form.location,
      payloadCapacityKg: form.capacityKg,
      availableFrom: new Date(Date.now() + form.availableInDays * 864e5).toISOString(),
      availableTo: new Date(Date.now() + (form.availableInDays + 7) * 864e5).toISOString(),
      preferredLanes: form.dest
        ? [{ origin: form.location.label, destination: form.dest.label }]
        : undefined,
    });
    setEditing(false);
  };

  const lane = truck.preferredLanes?.[0];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-graphite shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-steel/40 text-foreground">
            <BodyTypeIcon type={truck.bodyType} className="size-6" />
          </div>
          <div>
            <div className="font-mono text-sm font-bold tracking-tight">{truck.registration}</div>
            <div className="text-xs text-muted-foreground">
              {BODY_TYPE_LABEL[truck.bodyType]} · {(truck.payloadCapacityKg / 1000).toFixed(0)}t ·{" "}
              {operatorName}
            </div>
            {vehicle && (
              <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
                  "Fleet asset"}
                {vehicle.vin ? ` · VIN •••${vehicle.vin.slice(-6)}` : ""} ·{" "}
                {vehicle.verification.toLowerCase()}
              </div>
            )}
          </div>
        </div>
        <StatusChip status={truck.status === "AVAILABLE" ? "POSTED" : "IN_TRANSIT"} />
      </div>

      {/* Availability */}
      {editing ? (
        <div className="grid grid-cols-2 gap-3 p-4">
          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as TruckPosting["status"] })
              }
              className={inputCls}
            >
              <option value="AVAILABLE">Available</option>
              <option value="OFFLINE">Offline</option>
            </select>
          </Field>
          <Field label="Payload capacity (kg)">
            <input
              type="number"
              value={form.capacityKg}
              onChange={(e) => setForm({ ...form, capacityKg: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <Field label="Current location">
            <AddressInput
              value={form.location}
              onSelect={(p) => setForm({ ...form, location: p })}
              placeholder="Where is the truck?"
            />
          </Field>
          <Field label="Available in (days)">
            <input
              type="number"
              min={0}
              value={form.availableInDays}
              onChange={(e) => setForm({ ...form, availableInDays: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <div className="col-span-2">
            <Field label="Destination (preferred lane)">
              <AddressInput
                value={form.dest}
                onSelect={(p) => setForm({ ...form, dest: p })}
                placeholder="Preferred destination (optional)"
              />
            </Field>
          </div>
          <div className="col-span-2 flex gap-2">
            <button
              onClick={save}
              className="flex-1 rounded-md bg-signal py-2 text-[11px] font-black uppercase tracking-widest text-signal-foreground hover:brightness-105"
            >
              Save changes
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border border-border px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="grid gap-1 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5 text-muted-foreground" />
              {truck.currentLocation.label}, {truck.currentLocation.province}
            </span>
            <span className="text-muted-foreground">
              Free {new Date(truck.availableFrom).toLocaleDateString("en-ZA")} –{" "}
              {new Date(truck.availableTo).toLocaleDateString("en-ZA")}
            </span>
            <span className="text-muted-foreground">
              {lane ? `Prefers → ${lane.destination}` : "Any destination"}
            </span>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-foreground hover:bg-steel/40"
          >
            <Pencil className="size-3" /> Edit
          </button>
        </div>
      )}

      {/* Best match */}
      <div className="border-t border-border p-4">
        {truck.status !== "AVAILABLE" ? (
          <p className="text-center text-[11px] text-muted-foreground">
            On a job — not open for matching.
          </p>
        ) : best ? (
          <div className="rounded-lg border border-signal/40 bg-signal/5 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-foreground">
                Best matching load
              </span>
              <span className="flex items-baseline gap-0.5">
                <span className="font-mono text-2xl font-black leading-none text-signal">
                  {best.score}
                </span>
                <span className="text-[9px] font-bold text-muted-foreground">/100</span>
              </span>
            </div>
            <div className="text-sm font-bold uppercase leading-tight">
              {best.load.origin.label} → {best.load.destination.label}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {(best.load.weightKg / 1000).toFixed(0)}t · {best.load.cargoType.replaceAll("_", " ")}
              {best.load.targetRate ? ` · ${formatMoney(best.load.targetRate)}` : ""}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              Pick-up {new Date(best.load.pickupWindow.from).toLocaleDateString("en-ZA")} · the
              cargo owner accepts your truck to engage
            </div>
          </div>
        ) : (
          <p className="text-center text-[11px] text-muted-foreground">
            No open load matches this truck yet.
          </p>
        )}
      </div>
    </div>
  );
}

function AddTruckForm({
  onDone,
  onAdd,
}: {
  onDone: () => void;
  onAdd: ReturnType<typeof useTamp>["addTruck"];
}) {
  const { me } = useTamp();
  const [form, setForm] = useState({
    registration: "",
    bodyType: "TAUTLINER" as BodyType,
    capacityKg: 30000,
    location: PLACES.germiston as Place,
    availableInDays: 2,
    vin: "",
    make: "",
    model: "",
    year: new Date().getFullYear(),
    licenceExpiry: "",
  });
  const [photos, setPhotos] = useState<Record<string, { file: File; url: string }>>({});
  const [docs, setDocs] = useState<Record<string, File>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const registration = form.registration.trim().toUpperCase();
    if (!registration) return setErr("Enter the truck's registration.");
    if (registration.length > 40) return setErr("Registration must be 40 characters or fewer.");
    if (form.vin.trim() && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(form.vin.trim())) {
      return setErr("VIN must contain 17 letters and numbers (excluding I, O and Q).");
    }
    if (!Number.isFinite(form.capacityKg) || form.capacityKg <= 0 || form.capacityKg > 200000) {
      return setErr("Payload capacity must be between 1 and 200,000 kg.");
    }
    if (
      !form.location.label.trim() ||
      !Number.isFinite(form.location.lat) ||
      !Number.isFinite(form.location.lng) ||
      form.location.lat < -90 ||
      form.location.lat > 90 ||
      form.location.lng < -180 ||
      form.location.lng > 180
    ) {
      return setErr("Select a valid current location from the address suggestions.");
    }
    const missingPhotos = TRUCK_PHOTOS.filter((p) => !photos[p]);
    if (missingPhotos.length) return setErr(`Add truck photos: ${missingPhotos.join(", ")}.`);
    const missingDocs = TRUCK_DOCS.filter((d) => !docs[d]);
    if (missingDocs.length) return setErr(`Upload documents: ${missingDocs.join(", ")}.`);
    setErr("");
    setBusy(true);
    const toastId = toast.loading("Registering truck", {
      description: "Uploading vehicle photos and documents…",
    });
    try {
      const [uploadedPhotos, uploadedDocs] = await Promise.all([
        Promise.all(TRUCK_PHOTOS.map((label) => uploadFile(photos[label]!.file, "TRUCK_PHOTO"))),
        Promise.all(TRUCK_DOCS.map((label) => uploadFile(docs[label]!, "TRUCK_DOCUMENT"))),
      ]);
      await onAdd({
        transporterId: me.id,
        ...(me.role === "DRIVER" ? { driverId: me.id } : {}),
        registration,
        bodyType: form.bodyType,
        payloadCapacityKg: form.capacityKg,
        currentLocation: form.location,
        availableFrom: new Date(Date.now() + form.availableInDays * 864e5).toISOString(),
        availableTo: new Date(Date.now() + (form.availableInDays + 7) * 864e5).toISOString(),
        preferredLanes: [],
        photos: uploadedPhotos.map((upload) => upload.url),
        documents: uploadedDocs.map((upload) => upload.url),
        ...(form.vin.trim() ? { vin: form.vin.trim().toUpperCase() } : {}),
        ...(form.make.trim() ? { make: form.make.trim() } : {}),
        ...(form.model.trim() ? { model: form.model.trim() } : {}),
        year: form.year,
        ...(form.licenceExpiry ? { licenceExpiry: form.licenceExpiry } : {}),
      });
      toast.success("Truck registered", {
        id: toastId,
        description: `${registration} was added to your fleet.`,
      });
      onDone();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The truck could not be registered.";
      setErr(message);
      toast.error("Truck registration failed", { id: toastId, description: message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5 border-b border-border bg-graphite/60 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Registration">
          <input
            value={form.registration}
            onChange={(e) => setForm({ ...form, registration: e.target.value })}
            placeholder="JH 41 SG GP"
            className={inputCls}
          />
        </Field>
        <Field label="VIN (optional)">
          <input
            value={form.vin}
            onChange={(e) => setForm({ ...form, vin: e.target.value })}
            placeholder="17-character VIN"
            maxLength={17}
            className={inputCls}
          />
        </Field>
        <Field label="Make">
          <input
            value={form.make}
            onChange={(e) => setForm({ ...form, make: e.target.value })}
            placeholder="Volvo"
            className={inputCls}
          />
        </Field>
        <Field label="Model">
          <input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="FH16"
            className={inputCls}
          />
        </Field>
        <Field label="Year">
          <input
            type="number"
            min={1950}
            max={new Date().getFullYear() + 1}
            value={form.year}
            onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
            className={inputCls}
          />
        </Field>
        <Field label="Licence expiry">
          <input
            type="date"
            value={form.licenceExpiry}
            onChange={(e) => setForm({ ...form, licenceExpiry: e.target.value })}
            className={inputCls}
          />
        </Field>
        <div className="col-span-2 sm:col-span-4">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Body type
          </label>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {bodyTypes.map((t) => {
              const active = form.bodyType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, bodyType: t })}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-center transition-colors ${
                    active
                      ? "border-signal bg-signal/10 text-foreground"
                      : "border-border bg-graphite text-muted-foreground hover:border-signal/50 hover:text-foreground"
                  }`}
                >
                  <BodyTypeIcon type={t} className="size-6" />
                  <span className="text-[9px] font-semibold leading-tight">
                    {BODY_TYPE_LABEL[t]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Payload capacity (kg)">
          <input
            type="number"
            value={form.capacityKg}
            onChange={(e) => setForm({ ...form, capacityKg: Number(e.target.value) })}
            className={inputCls}
          />
        </Field>
        <Field label="Current location">
          <AddressInput
            value={form.location}
            onSelect={(p) => setForm({ ...form, location: p })}
            placeholder="Truck's base / current address…"
          />
        </Field>
      </div>

      {/* Truck photos — Uber/Bolt require a shot of the actual vehicle per angle. */}
      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Truck photos <span className="text-danger">*</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TRUCK_PHOTOS.map((label) => (
            <PhotoTile
              key={label}
              label={label}
              photo={photos[label]}
              onChange={(file, url) => setPhotos((p) => ({ ...p, [label]: { file, url } }))}
            />
          ))}
        </div>
      </div>

      {/* Matching vehicle documents. */}
      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Vehicle documents <span className="text-danger">*</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {TRUCK_DOCS.map((label) => (
            <DocRow
              key={label}
              label={label}
              value={docs[label]}
              onChange={(file) => setDocs((d) => ({ ...d, [label]: file }))}
            />
          ))}
        </div>
      </div>

      {err && <p className="text-xs font-medium text-danger">{err}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-signal px-6 py-2 text-xs font-bold uppercase tracking-widest text-signal-foreground hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Registering…" : "Register truck"}
        </button>
        <span className="text-[10px] text-muted-foreground">
          Submitted for verification — photos &amp; documents are checked before the truck goes
          live.
        </span>
      </div>
    </form>
  );
}

function PhotoTile({
  label,
  photo,
  onChange,
}: {
  label: string;
  photo: { file: File; url: string } | undefined;
  onChange: (file: File, url: string) => void;
}) {
  return (
    <label
      className={`relative flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-md border border-dashed text-center ${
        photo ? "border-positive" : "border-border hover:border-signal/60"
      }`}
    >
      {photo ? (
        <img src={photo.url} alt={label} className="absolute inset-0 size-full object-cover" />
      ) : (
        <Camera className="size-5 text-muted-foreground" />
      )}
      <span
        className={`relative z-10 px-1 text-[10px] font-semibold ${
          photo ? "rounded bg-background/80 text-foreground" : "text-muted-foreground"
        }`}
      >
        {photo ? `✓ ${label}` : label}
      </span>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(f, URL.createObjectURL(f));
        }}
        className="hidden"
      />
    </label>
  );
}

function DocRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: File | undefined;
  onChange: (file: File) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs ${
        value ? "border-positive text-foreground" : "border-border text-muted-foreground"
      }`}
    >
      {value ? (
        <CheckCircle2 className="size-4 shrink-0 text-positive" />
      ) : (
        <FileUp className="size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-tight">{label}</span>
        {value && (
          <span className="block truncate text-[10px] text-muted-foreground">{value.name}</span>
        )}
      </span>
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onChange(file);
        }}
        className="hidden"
      />
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:border-signal";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

export default FleetPage;
