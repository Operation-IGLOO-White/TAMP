
import { Link } from "@/lib/nav";
import { ExternalLink, FileText, Images, Search, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { BODY_TYPE_LABEL, BodyTypeIcon } from "@/components/tamp/BodyTypeIcon";
import { useTamp } from "@/context/TampContext";
import { assessFleetCompliance } from "@/lib/fleet-compliance";
import { setVehicleVerification } from "@/fns/vehicles";
import type { TruckPosting, Vehicle, VerificationStatus } from "@/types/domain";

function AdminTrucks() {
  const { trucks, vehicles, maintenance, parties } = useTamp();
  const [query, setQuery] = useState("");
  const [reviewTruckId, setReviewTruckId] = useState<string | null>(null);
  const [verificationOverrides, setVerificationOverrides] = useState<Record<string, VerificationStatus>>({});
  const verify = useMutation({
    mutationFn: ({ truckId, status }: { truckId: string; status: "VERIFIED" | "REJECTED" | "PENDING" }) =>
      setVehicleVerification(truckId, status),
    onSuccess: (vehicle, variables) => {
      setVerificationOverrides((current) => ({ ...current, [variables.truckId]: vehicle.verification }));
      toast.success(`Vehicle marked ${vehicle.verification.toLowerCase()}`);
    },
    onError: () => toast.error("Vehicle review could not be saved"),
  });

  // Decorate each truck with its owner + driver names once, then filter.
  const rows = useMemo(
    () =>
      trucks.map((t) => {
        const owner = parties.find((p) => p.id === t.transporterId);
        const driver = t.driverId ? parties.find((p) => p.id === t.driverId) : undefined;
        const vehicle = vehicles.find((vehicle) => vehicle.id === t.vehicleId);
        const effectiveVehicle = verificationOverrides[t.id]
          ? vehicle
            ? { ...vehicle, verification: verificationOverrides[t.id]! }
            : ({
                id: t.vehicleId ?? `VH-${t.id}`,
                ownerId: t.transporterId,
                registration: t.registration,
                bodyType: t.bodyType,
                payloadCapacityKg: t.payloadCapacityKg,
                photos: t.photos ?? [],
                documents: t.documents ?? [],
                verification: verificationOverrides[t.id]!,
                status: "ACTIVE",
                createdAt: t.createdAt,
                updatedAt: new Date().toISOString(),
              } satisfies Vehicle)
          : vehicle;
        const compliance = assessFleetCompliance(
          t,
          effectiveVehicle,
          maintenance,
        );
        return { truck: t, owner, driver, vehicle: effectiveVehicle, compliance };
      }),
    [trucks, vehicles, maintenance, parties, verificationOverrides],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ truck: t, owner, driver, compliance }) =>
      [
        t.id,
        t.registration,
        BODY_TYPE_LABEL[t.bodyType],
        t.currentLocation.label,
        t.currentLocation.province,
        t.status,
        owner?.companyName,
        owner?.contactName,
        driver?.contactName,
        compliance.level,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  return (
    <AppShell>
      <PageHeader title="All Trucks" />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by registration, body type, owner, driver, location or status…"
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

        <p className="text-xs text-muted-foreground">
          {query ? `${filtered.length} of ${trucks.length}` : trucks.length} trucks
        </p>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-graphite/60 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-3">Truck</th>
                <th className="px-3 py-3">Body</th>
                <th className="px-3 py-3 text-right">Capacity</th>
                <th className="px-3 py-3">Owner</th>
                <th className="px-3 py-3">Driver</th>
                <th className="px-3 py-3">Location</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Compliance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(({ truck: t, owner, driver, compliance }) => (
                <tr key={t.id} className="hover:bg-steel/20">
                  <td className="px-4 py-3">
                    <Link
                      to="/trucks/$truckId"
                      params={{ truckId: t.id }}
                      className="flex items-center gap-2.5 font-mono font-semibold hover:text-signal"
                    >
                      <BodyTypeIcon type={t.bodyType} className="size-5 text-muted-foreground" />
                      {t.registration}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{BODY_TYPE_LABEL[t.bodyType]}</td>
                  <td className="px-3 py-3 text-right font-mono">
                    {(t.payloadCapacityKg / 1000).toFixed(0)} t
                  </td>
                  <td className="px-3 py-3">{owner?.companyName ?? "—"}</td>
                  <td className="px-3 py-3">{driver?.contactName ?? "—"}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {t.currentLocation.label}, {t.currentLocation.province}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                        t.status === "AVAILABLE"
                          ? "bg-positive/15 text-positive"
                          : "bg-steel text-foreground"
                      }`}
                    >
                      {t.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className={`text-[10px] font-bold uppercase ${compliance.level === "COMPLIANT" ? "text-positive" : compliance.level === "DUE_SOON" ? "text-signal" : "text-danger"}`}>
                      {compliance.level.replaceAll("_", " ")}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{compliance.score}%</div>
                    <button
                      type="button"
                      onClick={() => setReviewTruckId(t.id)}
                      className="mt-2 rounded border border-border px-2 py-1 text-[9px] font-bold uppercase tracking-wide hover:border-signal hover:text-signal"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {trucks.length === 0 ? "No trucks on the platform yet." : `No trucks match “${query}”.`}
            </div>
          )}
        </div>
      </div>
      {reviewTruckId && (() => {
        const row = rows.find(({ truck }) => truck.id === reviewTruckId);
        return row ? (
          <TruckReviewDialog
            truck={row.truck}
            vehicle={row.vehicle}
            compliance={row.compliance}
            verification={verificationOverrides[row.truck.id] ?? row.vehicle?.verification ?? "PENDING"}
            saving={verify.isPending}
            onClose={() => setReviewTruckId(null)}
            onDecision={(status) => verify.mutate({ truckId: row.truck.id, status })}
          />
        ) : null;
      })()}
    </AppShell>
  );
}

function TruckReviewDialog({
  truck,
  vehicle,
  compliance,
  verification,
  saving,
  onClose,
  onDecision,
}: {
  truck: TruckPosting;
  vehicle: Vehicle | undefined;
  compliance: ReturnType<typeof assessFleetCompliance>;
  verification: VerificationStatus;
  saving: boolean;
  onClose: () => void;
  onDecision: (status: "VERIFIED" | "REJECTED" | "PENDING") => void;
}) {
  const photos = vehicle?.photos?.length ? vehicle.photos : truck.photos ?? [];
  const documents = vehicle?.documents?.length ? vehicle.documents : truck.documents ?? [];
  const fileName = (url: string, index: number) => {
    try {
      return decodeURIComponent(new URL(url, window.location.origin).pathname.split("/").pop() || `Document ${index + 1}`);
    } catch {
      return `Document ${index + 1}`;
    }
  };
  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm" onMouseDown={onClose}>
      <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
          <div>
            <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-signal" /><h2 className="text-lg font-bold">Truck compliance review</h2></div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{truck.registration} · {truck.id}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close review" className="rounded-lg border border-border p-2 hover:bg-steel"><X className="size-4" /></button>
        </header>

        <div className="space-y-6 p-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <ReviewStat label="Review status" value={verification} />
            <ReviewStat label="Compliance" value={compliance.level.replaceAll("_", " ")} />
            <ReviewStat label="Score" value={`${compliance.score}%`} />
            <ReviewStat label="Documents" value={`${documents.length}/3`} />
          </div>

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide"><Images className="size-4" /> Truck photos ({photos.length})</h3>
            {photos.length ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {photos.map((url, index) => (
                  <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-border bg-graphite">
                    <img src={url} alt={`${truck.registration} view ${index + 1}`} className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.03]" />
                    <div className="flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase">View {index + 1}<ExternalLink className="size-3" /></div>
                  </a>
                ))}
              </div>
            ) : <EmptyReview text="No truck photos were attached." />}
          </div>

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide"><FileText className="size-4" /> Vehicle documents ({documents.length})</h3>
            {documents.length ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {documents.map((url, index) => (
                  <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-border bg-graphite p-3 hover:border-signal">
                    <FileText className="size-5 shrink-0 text-signal" />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{fileName(url, index)}</span>
                    <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                  </a>
                ))}
              </div>
            ) : <EmptyReview text="No vehicle documents were attached." />}
          </div>

          {(compliance.blockers.length > 0 || compliance.warnings.length > 0) && (
            <div className="rounded-xl border border-border bg-graphite/50 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide">Review findings</h3>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {[...compliance.blockers, ...compliance.warnings].map((message) => <li key={message}>• {message}</li>)}
              </ul>
            </div>
          )}
        </div>

        <footer className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-border bg-background/95 px-5 py-4 backdrop-blur">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-xs font-bold uppercase">Close</button>
          <button type="button" disabled={saving} onClick={() => onDecision("REJECTED")} className="rounded-lg bg-danger/15 px-4 py-2 text-xs font-bold uppercase text-danger disabled:opacity-50">Reject truck</button>
          <button type="button" disabled={saving || documents.length < 3 || photos.length === 0} onClick={() => onDecision("VERIFIED")} className="rounded-lg bg-positive px-5 py-2 text-xs font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-40">Verify truck</button>
        </footer>
      </section>
    </div>
  );
}

function ReviewStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-graphite p-3"><div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div><div className="mt-1 text-sm font-bold uppercase">{value}</div></div>;
}

function EmptyReview({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{text}</div>;
}

export default AdminTrucks;
