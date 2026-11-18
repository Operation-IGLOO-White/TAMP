
import { Link } from "@/lib/nav";
import { useParams, useNavigate } from "react-router-dom";
import { Activity, AlertTriangle, BadgeCheck, Check, ExternalLink, FileText, Fuel, Images, Loader2, MapPin, ShieldCheck, Star, UserPlus, Wrench, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/tamp/AppShell";
import { Avatar } from "@/components/tamp/Avatar";
import { BODY_TYPE_LABEL, BodyTypeIcon } from "@/components/tamp/BodyTypeIcon";
import { LaneRail } from "@/components/tamp/LaneRail";
import { Panel } from "@/components/tamp/StatCard";
import { StatusChip } from "@/components/tamp/StatusChip";
import { IncidentDialog } from "@/components/tamp/IncidentDialog";
import { findDriver } from "@/fns/parties";
import { daysSince, estimateEta, isActiveTrip } from "@/lib/tamp-dashboard";
import { displayStatusForLoad } from "@/lib/tamp-selectors";
import { useTamp } from "@/context/TampContext";
import { assessFleetCompliance } from "@/lib/fleet-compliance";
import { setVehicleVerification } from "@/fns/vehicles";
import { reviewDocument } from "@/fns/documents";
import { fleetVehicleAsset } from "@/lib/fleet-assets";
import type { Party } from "@/types/domain";

function TruckDetail() {
  const { truckId } = useParams<{ truckId: string }>();
  const navigateBack = useNavigate();
  const { trucks, vehicles, maintenance, fuelLogs, parties, matches, loads, trips, disputes, role, me, assignDriver, linkDriver } =
    useTamp();
  const [verificationOverride, setVerificationOverride] = useState<"PENDING" | "VERIFIED" | "REJECTED" | null>(null);
  const [documentReviewOverrides, setDocumentReviewOverrides] = useState<Record<string, "APPROVED" | "REJECTED">>({});
  const [cancelLoadId, setCancelLoadId] = useState<string | null>(null);
  const verifyVehicle = useMutation({
    mutationFn: (status: "PENDING" | "VERIFIED" | "REJECTED") =>
      setVehicleVerification(truckId!, status),
    onSuccess: (updated) => {
      setVerificationOverride(updated.verification === "UNVERIFIED" ? "PENDING" : updated.verification);
      toast.success(`Truck marked ${updated.verification.toLowerCase()}`);
    },
    onError: () => toast.error("Truck verification could not be saved"),
  });
  const reviewVehicleDocument = useMutation({
    mutationFn: (input: { documentId: string; status: "APPROVED" | "REJECTED"; reason?: string }) =>
      reviewDocument({ subjectType: "TRUCK", subjectId: truckId!, ...input }),
    onSuccess: (result, input) => {
      setDocumentReviewOverrides((current) => ({ ...current, [input.documentId]: result.reviewStatus }));
      toast.success(`Document ${result.reviewStatus.toLowerCase()}`);
    },
    onError: () => toast.error("Document review could not be saved"),
  });

  const truck = trucks.find((t) => t.id === truckId);

  if (!truck) {
    return (
      <AppShell>
        <div className="p-10 text-center">
          <p className="text-sm text-muted-foreground">Truck {truckId} not found.</p>
        </div>
      </AppShell>
    );
  }

  const operator = parties.find((p) => p.id === truck.transporterId);
  const storedVehicle = vehicles.find((vehicle) => vehicle.id === truck.vehicleId);
  const vehicle = storedVehicle && verificationOverride
    ? { ...storedVehicle, verification: verificationOverride }
    : storedVehicle;
  const compliance = assessFleetCompliance(truck, vehicle, maintenance);
  const photos = vehicle?.photos?.length ? vehicle.photos : truck.photos ?? [];
  const documents = vehicle?.documents?.length ? vehicle.documents : truck.documents ?? [];
  const documentEvidence = documents.map((url, index) => {
    const metadata = truck.documentMetadata?.find((item) => item.url === url);
    return {
      url,
      id: metadata?.id || url,
      name: metadata?.name || evidenceName(url, index),
      reviewStatus: documentReviewOverrides[url] ?? metadata?.reviewStatus ?? "PENDING",
      reviewReason: metadata?.reviewReason,
    };
  });
  const allDocumentsApproved = documentEvidence.length >= 3 && documentEvidence.every((item) => item.reviewStatus === "APPROVED");
  const driver = truck.driverId ? parties.find((p) => p.id === truck.driverId) : undefined;
  const isAdmin = role === "ADMIN";
  const canManageDriver = isAdmin || me.id === truck.transporterId;
  const canDriveOwnTruck =
    me.id === truck.transporterId && me.role === "TRANSPORTER" && me.verification === "VERIFIED";

  const truckTrips = trips
    .map((trip) => {
      const match = matches.find((m) => m.id === trip.matchId);
      if (match?.truckPostingId !== truck.id) return null;
      const load = loads.find((l) => l.id === match.loadId);
      return load ? { trip, load } : null;
    })
    .filter((x): x is { trip: (typeof trips)[number]; load: (typeof loads)[number] } => x !== null);
  const activeJob = truckTrips.find((t) => isActiveTrip(t.trip.status));
  const pastJobs = truckTrips.filter((t) => !isActiveTrip(t.trip.status));
  const truckFuel = fuelLogs.filter((log) => log.truckId === truck.id);
  const fuelSpend = truckFuel.reduce((sum, log) => sum + log.cost.amount, 0);
  const scheduledMaintenance = maintenance.filter(
    (task) => task.truckId === truck.id && task.status === "SCHEDULED",
  );
  const operationalScore = truck.status === "ON_TRIP" ? 92 : truck.status === "AVAILABLE" ? 78 : 24;

  return (
    <AppShell>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/90 px-6 py-4 backdrop-blur-md">
        <button
          onClick={() => navigateBack(-1)}
          className="text-[10px] font-bold uppercase tracking-widest text-signal"
        >
          ← Back
        </button>
        <BodyTypeIcon type={truck.bodyType} className="size-5 text-muted-foreground" />
        <h1 className="font-mono text-sm font-bold tracking-tight">{truck.registration}</h1>
        <span
          className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
            truck.status === "AVAILABLE"
              ? "bg-positive/15 text-positive"
              : "bg-steel text-foreground"
          }`}
        >
          {truck.status.replaceAll("_", " ")}
        </span>
      </div>

      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-[#f7f7f4] via-white to-[#ecece7] px-5 py-6 text-black sm:px-8">
        <div className="absolute -right-20 -top-24 size-72 rounded-full bg-signal/20 blur-3xl" />
        <div className="relative grid items-center gap-6 xl:grid-cols-[minmax(380px,1fr)_minmax(520px,.9fr)]">
          <div className="relative animate-in fade-in slide-in-from-left-3 duration-500">
            <div className="pointer-events-none absolute inset-x-[8%] bottom-5 h-12 rounded-[50%] bg-black/10 blur-2xl" />
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-black/55">
              <span>Fleet intelligence</span><span className="size-1 rounded-full bg-signal" />
              <span>{BODY_TYPE_LABEL[truck.bodyType]}</span>
            </div>
            <img
              src={fleetVehicleAsset(truck)}
              alt={`${truck.registration} profile`}
              className="relative h-48 w-full object-contain drop-shadow-[0_18px_18px_rgba(0,0,0,.2)] transition-transform duration-700 hover:-translate-y-1 hover:scale-[1.03] sm:h-64"
            />
          </div>
          <FleetInstrumentCluster
            registration={truck.registration}
            compliance={{ value: compliance.score, detail: compliance.level.replaceAll("_", " ") }}
            operational={{ value: operationalScore, detail: truck.status.replaceAll("_", " ") }}
            fuel={{ value: Math.min(100, truckFuel.length * 12), detail: `R ${fuelSpend.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}` }}
            maintenance={{ value: Math.max(0, 100 - scheduledMaintenance.length * 15), detail: `${scheduledMaintenance.length} scheduled` }}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="space-y-6">
          <Panel title="Specification">
            <dl className="grid grid-cols-2 gap-px bg-border">
              <Spec label="Body type" value={BODY_TYPE_LABEL[truck.bodyType]} />
              <Spec
                label="Payload capacity"
                value={`${(truck.payloadCapacityKg / 1000).toFixed(0)} t`}
              />
              <Spec
                label="Volume capacity"
                value={truck.volumeCapacityM3 ? `${truck.volumeCapacityM3} m³` : "Not provided"}
              />
              <Spec
                label="Availability policy"
                value={truck.alwaysAvailable ? "Always available between jobs" : "Scheduled window"}
              />
              <Spec
                label="Current location"
                value={`${truck.currentLocation.label}, ${truck.currentLocation.province}`}
              />
              <Spec label="Truck ref" value={`#${truck.id}`} />
              <Spec
                label="Available from"
                value={new Date(truck.availableFrom).toLocaleDateString("en-ZA")}
              />
              <Spec
                label="Available to"
                value={new Date(truck.availableTo).toLocaleDateString("en-ZA")}
              />
              <Spec
                label="Preferred lane"
                value={
                  truck.preferredLanes && truck.preferredLanes.length
                    ? `${truck.preferredLanes[0]!.origin} → ${truck.preferredLanes[0]!.destination}`
                    : "None set"
                }
              />
              <Spec label="Posted" value={`${daysSince(truck.createdAt)}d ago`} />
              <Spec label="VIN" value={truck.vin ?? vehicle?.vin ?? "Not provided"} />
              <Spec
                label="Vehicle"
                value={[truck.year ?? vehicle?.year, truck.make ?? vehicle?.make, truck.model ?? vehicle?.model].filter(Boolean).join(" ") || "Not provided"}
              />
              <Spec
                label="Licence number"
                value={truck.licenceNumber ?? vehicle?.licenceNumber ?? "Not provided"}
              />
              <Spec
                label="Licence expiry"
                value={truck.licenceExpiry ? new Date(truck.licenceExpiry).toLocaleDateString("en-ZA") : "Not provided"}
              />
              <Spec label="Verification" value={verificationOverride ?? vehicle?.verification ?? "PENDING"} />
            </dl>
          </Panel>

          <Panel title="Compliance review">
            <div className="space-y-5 p-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <ComplianceStat label="Status" value={verificationOverride ?? vehicle?.verification ?? "PENDING"} />
                <ComplianceStat label="Compliance" value={compliance.level.replaceAll("_", " ")} />
                <ComplianceStat label="Score" value={`${compliance.score}%`} />
                <ComplianceStat label="Documents" value={`${documents.length}/3`} />
              </div>

              {(compliance.blockers.length > 0 || compliance.warnings.length > 0) ? (
                <div className="rounded-xl border border-border bg-graphite/50 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
                    <AlertTriangle className="size-4 text-signal" /> Compliance findings
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {[...compliance.blockers, ...compliance.warnings].map((message) => (
                      <li key={message}>• {message}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-positive/30 bg-positive/5 p-4 text-sm text-positive">
                  <ShieldCheck className="size-5" /> All compliance checks passed.
                </div>
              )}

              {isAdmin && (
                <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                  {(verificationOverride ?? vehicle?.verification ?? "PENDING") !== "REJECTED" && (
                    <button type="button" disabled={verifyVehicle.isPending} onClick={() => verifyVehicle.mutate("REJECTED")} className="rounded-lg bg-danger/15 px-4 py-2 text-xs font-bold uppercase text-danger disabled:opacity-50">
                      Reject truck
                    </button>
                  )}
                  {(verificationOverride ?? vehicle?.verification ?? "PENDING") !== "VERIFIED" && (
                    <button type="button" disabled={verifyVehicle.isPending || !allDocumentsApproved || photos.length === 0} onClick={() => verifyVehicle.mutate("VERIFIED")} className="rounded-lg bg-signal px-5 py-2 text-xs font-black uppercase text-signal-foreground disabled:cursor-not-allowed disabled:opacity-40">
                      Verify truck
                    </button>
                  )}
                </div>
              )}
            </div>
          </Panel>

          <Panel title={`Truck photos (${photos.length})`}>
            <div className="p-4">
              {photos.length ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {photos.map((url, index) => (
                    <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-border bg-graphite">
                      <img src={url} alt={`${truck.registration} view ${index + 1}`} className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.03]" />
                      <div className="flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase"><span className="inline-flex items-center gap-1"><Images className="size-3" /> View {index + 1}</span><ExternalLink className="size-3" /></div>
                    </a>
                  ))}
                </div>
              ) : <EmptyEvidence text="No truck photos were attached." />}
            </div>
          </Panel>

          <Panel title={`Vehicle documents (${documents.length})`}>
            <div className="p-4">
              {documents.length ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {documentEvidence.map((document, index) => (
                    <div key={`${document.url}-${index}`} className="rounded-xl border border-border bg-graphite p-3">
                      <div className="flex items-center gap-3">
                        <FileText className="size-5 shrink-0 text-signal" />
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{document.name}</span>
                        <a href={document.url} target="_blank" rel="noreferrer" aria-label={`View ${document.name}`}><ExternalLink className="size-3.5 shrink-0 text-muted-foreground" /></a>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2">
                        <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${document.reviewStatus === "APPROVED" ? "bg-positive/15 text-positive" : document.reviewStatus === "REJECTED" ? "bg-danger/15 text-danger" : "bg-signal/15 text-signal"}`}>{document.reviewStatus}</span>
                        {isAdmin && <span className="flex gap-1"><button type="button" disabled={reviewVehicleDocument.isPending} onClick={() => reviewVehicleDocument.mutate({ documentId: document.url, status: "APPROVED" })} className="grid size-8 place-items-center rounded-md bg-signal text-signal-foreground disabled:opacity-50" aria-label={`Approve ${document.name}`}><Check className="size-3.5" /></button><button type="button" disabled={reviewVehicleDocument.isPending} onClick={() => { const reason = window.prompt("Why is this document being rejected?")?.trim(); if (reason) reviewVehicleDocument.mutate({ documentId: document.url, status: "REJECTED", reason }); }} className="grid size-8 place-items-center rounded-md border border-danger/40 text-danger disabled:opacity-50" aria-label={`Reject ${document.name}`}><X className="size-3.5" /></button></span>}
                      </div>
                      {document.reviewReason && <p className="mt-2 text-[10px] text-danger">{document.reviewReason}</p>}
                    </div>
                  ))}
                </div>
              ) : <EmptyEvidence text="No vehicle documents were attached." />}
            </div>
          </Panel>

          {activeJob && (
            <Panel title="Current job">
              <div className="px-4 py-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-bold uppercase">
                    {activeJob.load.origin.label} → {activeJob.load.destination.label}
                  </span>
                  <StatusChip
                    status={displayStatusForLoad(activeJob.load, matches, trips, disputes)}
                  />
                </div>
                <LaneRail
                  origin={activeJob.load.origin}
                  destination={activeJob.load.destination}
                  distanceKm={activeJob.load.distanceKm}
                  progressPct={activeJob.trip.progressPct}
                  simulated
                />
                <div className="mt-2 text-[11px] text-muted-foreground">
                  ETA{" "}
                  {estimateEta(activeJob.load, activeJob.trip).toLocaleString("en-ZA", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                {me.role === "TRANSPORTER" ? (
                  <div className="mt-4 flex justify-end border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => setCancelLoadId(activeJob.load.id)}
                      className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-danger hover:bg-danger/20"
                    >
                      Cancel trip
                    </button>
                  </div>
                ) : null}
              </div>
            </Panel>
          )}

          <Panel title={`Trip history (${pastJobs.length})`}>
            <div className="divide-y divide-border">
              {pastJobs.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No completed trips yet.
                </p>
              )}
              {pastJobs.map(({ trip, load }) => (
                <div key={trip.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-sm font-bold uppercase leading-tight">
                      {load.origin.label} → {load.destination.label}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {trip.id} · {trip.status.replaceAll("_", " ")}
                    </div>
                  </div>
                  <StatusChip status={displayStatusForLoad(load, matches, trips, disputes)} />
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Operator">
            {operator ? (
              <PartyRow party={operator} secondary={operator.verification} link={isAdmin}>
                {operator.ratingAvg !== null && (
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-3 fill-signal text-signal" /> {operator.ratingAvg}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <BadgeCheck className="size-3.5" /> {operator.verification}
                </span>
              </PartyRow>
            ) : (
              <p className="px-4 py-4 text-xs text-muted-foreground">Unknown operator.</p>
            )}
          </Panel>

          <Panel title="Assigned driver">
            {driver ? (
              <PartyRow party={driver} secondary={driver.companyName} link={isAdmin} />
            ) : (
              <p className="flex items-center gap-2 px-4 pt-4 text-xs text-danger">
                <MapPin className="size-4" /> No driver assigned — trips can't start.
              </p>
            )}
            {canManageDriver && (
              <AssignDriver
                assigned={!!driver}
                selfAssigned={truck.driverId === me.id}
                canAssignSelf={canDriveOwnTruck}
                onAssignSelf={() => assignDriver(truck.id, me.id)}
                onLink={(d) => linkDriver(truck.id, d)}
                onUnassign={() => assignDriver(truck.id, "")}
              />
            )}
          </Panel>
        </aside>
      </div>
      <IncidentDialog
        loadId={cancelLoadId ?? ""}
        open={cancelLoadId !== null}
        initialMode="cancel"
        onClose={() => setCancelLoadId(null)}
      />
    </AppShell>
  );
}

function PartyRow({
  party,
  secondary,
  link,
  children,
}: {
  party: Party;
  secondary: string;
  link: boolean;
  children?: ReactNode;
}) {
  const inner = (
    <>
      <Avatar party={party} size="md" />
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">
          {party.role === "TRANSPORTER" ? party.companyName : party.contactName}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          {children ?? secondary}
        </div>
      </div>
    </>
  );
  return link ? (
    <Link
      to="/admin/users/$partyId"
      params={{ partyId: party.id }}
      className="flex items-center gap-3 px-4 py-4 hover:bg-steel/30"
    >
      {inner}
    </Link>
  ) : (
    <div className="flex items-center gap-3 px-4 py-4">{inner}</div>
  );
}

function ComplianceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-graphite p-3">
      <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-bold uppercase">{value}</div>
    </div>
  );
}

function EmptyEvidence({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function evidenceName(url: string, index: number) {
  try {
    return decodeURIComponent(
      new URL(url, window.location.origin).pathname.split("/").pop() || `Document ${index + 1}`,
    );
  } catch {
    return `Document ${index + 1}`;
  }
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-graphite px-4 py-3">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}

type InstrumentReading = { value: number; detail: string };

function FleetInstrumentCluster({
  registration,
  compliance,
  operational,
  fuel,
  maintenance,
}: {
  registration: string;
  compliance: InstrumentReading;
  operational: InstrumentReading;
  fuel: InstrumentReading;
  maintenance: InstrumentReading;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[620px] overflow-hidden rounded-[18%_18%_12%_12%/10%_10%_16%_16%] border border-black/20 bg-[linear-gradient(145deg,rgba(7,8,11,.82)_0%,rgba(24,26,31,.75)_44%,rgba(4,5,7,.86)_100%)] p-2.5 text-white shadow-[0_20px_42px_rgba(0,0,0,.2),inset_0_1px_0_rgba(255,255,255,.2),inset_0_-16px_38px_rgba(0,0,0,.32)] backdrop-blur-xl sm:p-3">
      <div className="pointer-events-none absolute inset-x-[9%] top-0 h-16 rounded-[50%] bg-gradient-to-b from-white/18 to-transparent blur-xl" />
      <div className="pointer-events-none absolute -right-12 -top-16 size-44 rounded-full bg-signal/15 blur-3xl" />
      <div className="relative mb-0 flex items-center justify-between px-5 pt-0.5">
        <span className="hidden h-px flex-1 bg-gradient-to-r from-transparent via-signal/80 to-signal sm:block" />
        <div className="px-3 text-center">
          <div className="text-[9px] font-black uppercase tracking-[.25em] text-white/80 sm:text-[10px]">Fleet intelligence</div>
          <div className="mt-0.5 font-mono text-[7px] uppercase tracking-[.18em] text-signal/90">Live vehicle health</div>
        </div>
        <span className="hidden h-px flex-1 bg-gradient-to-l from-transparent via-signal/80 to-signal sm:block" />
      </div>

      <div className="relative grid grid-cols-2 gap-px overflow-hidden rounded-[1.75rem] bg-white/10">
        <AnalogGauge label="Compliance" {...compliance} icon={ShieldCheck} warning={compliance.value < 80} />
        <AnalogGauge label="Operational" {...operational} icon={Activity} />
        <AnalogGauge label="Fuel records" {...fuel} icon={Fuel} displayValue={fuel.detail} status="Recorded spend" />
        <AnalogGauge label="Maintenance" {...maintenance} icon={Wrench} />
      </div>

      <div className="relative mx-auto -mt-0.5 flex w-fit items-center gap-2.5 rounded-full border border-signal/50 bg-black/55 px-3.5 py-1.5 shadow-[0_0_18px_rgba(244,180,0,.18),inset_0_1px_0_rgba(255,255,255,.12)] backdrop-blur-md">
        <span className="size-1.5 animate-pulse rounded-full bg-positive shadow-[0_0_8px_currentColor]" />
        <span className="font-mono text-[10px] font-black tracking-[.13em] text-white sm:text-xs">{registration}</span>
        <span className="text-[7px] font-bold uppercase tracking-widest text-white/45">Online</span>
      </div>
    </div>
  );
}

function AnalogGauge({
  label,
  value,
  detail,
  displayValue,
  status,
  icon: Icon,
  warning = false,
}: InstrumentReading & {
  label: string;
  displayValue?: string;
  status?: string;
  icon: typeof ShieldCheck;
  warning?: boolean;
}) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  const needleRotation = -90 + safeValue * 1.8;
  const statusText = status ?? detail;
  return (
    <div className="group relative min-w-0 overflow-hidden bg-[linear-gradient(155deg,rgba(255,255,255,.055),rgba(255,255,255,.012)_45%,rgba(0,0,0,.18))] px-2 pb-2 pt-2 shadow-[inset_0_1px_0_rgba(255,255,255,.055)] backdrop-blur-sm sm:px-3">
      <div className="flex items-center justify-center gap-1.5 text-[8px] font-black uppercase tracking-[.13em] text-white/65 sm:text-[10px]">
        <Icon className="size-3 text-signal sm:size-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div className="relative mx-auto -mt-2 aspect-[1.8/1] w-full max-w-[190px]">
        <svg viewBox="0 0 180 108" className="h-full w-full overflow-visible" aria-hidden="true">
          <defs>
            <filter id={`gauge-glow-${label.replace(/\s/g, "-")}`} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <path d="M 20 88 A 70 70 0 0 1 160 88" fill="none" stroke="rgba(255,255,255,.13)" strokeWidth="10" strokeLinecap="round" pathLength="100" />
          <path d="M 20 88 A 70 70 0 0 1 160 88" fill="none" stroke="#f4b400" strokeWidth="8" strokeLinecap="round" pathLength="100" strokeDasharray={`${safeValue} 100`} filter={`url(#gauge-glow-${label.replace(/\s/g, "-")})`} className="transition-[stroke-dasharray] duration-700" />
          {Array.from({ length: 11 }, (_, index) => {
            const angle = Math.PI - (Math.PI * index) / 10;
            const x1 = 90 + Math.cos(angle) * 59;
            const y1 = 88 - Math.sin(angle) * 59;
            const x2 = 90 + Math.cos(angle) * 67;
            const y2 = 88 - Math.sin(angle) * 67;
            return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,.72)" strokeWidth={index % 5 === 0 ? 2 : 1} />;
          })}
          <g style={{ transform: `rotate(${needleRotation}deg)`, transformOrigin: "90px 88px" }} className="transition-transform duration-700 ease-out">
            <line x1="90" y1="88" x2="90" y2="35" stroke="white" strokeWidth="2.5" strokeLinecap="round" filter={`url(#gauge-glow-${label.replace(/\s/g, "-")})`} />
          </g>
          <circle cx="90" cy="88" r="5" fill="#08090c" stroke="#f4b400" strokeWidth="3" />
          <text x="18" y="103" fill="rgba(255,255,255,.5)" fontSize="8" fontFamily="monospace">0</text>
          <text x="153" y="103" fill="rgba(255,255,255,.5)" fontSize="8" fontFamily="monospace">100</text>
        </svg>
        <div className="pointer-events-none absolute inset-x-0 top-[47%] text-center">
          <div className="font-mono text-lg font-black leading-none tracking-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,.8)] sm:text-xl">{displayValue ?? safeValue}</div>
        </div>
      </div>
      <div className={`mx-auto -mt-2 w-fit max-w-full truncate rounded-full border px-2.5 py-0.5 text-[6px] font-black uppercase tracking-[.1em] sm:text-[7px] ${warning ? "border-danger/55 bg-danger/20 text-red-300" : "border-white/15 bg-white/5 text-white/70"}`} title={statusText}>
        {statusText}
      </div>
    </div>
  );
}

// Assign a driver to this truck by the organisation-managed email. Driver
// accounts can be provisioned directly from the Organisation screen.
function AssignDriver({
  assigned,
  selfAssigned,
  canAssignSelf,
  onAssignSelf,
  onLink,
  onUnassign,
}: {
  assigned: boolean;
  selfAssigned: boolean;
  canAssignSelf: boolean;
  onAssignSelf: () => void;
  onLink: (driver: Party) => void;
  onUnassign: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // A looked-up driver who can't yet be assigned (unverified) — shown with a badge.
  const [pending, setPending] = useState<Party | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    setBusy(true);
    setMsg(null);
    setPending(null);
    try {
      const driver = await findDriver(value);
      if (!driver) {
        setMsg({ ok: false, text: "No driver found. Add them under Organisation first." });
        return;
      }
      if (driver.verification !== "VERIFIED") {
        setPending(driver);
        return;
      }
      onLink(driver);
      setMsg({ ok: true, text: `${driver.contactName} assigned.` });
      setEmail("");
    } catch {
      setMsg({ ok: false, text: "Lookup failed — please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 border-t border-border p-4">
      {canAssignSelf && !selfAssigned && (
        <button
          type="button"
          onClick={onAssignSelf}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-signal bg-signal/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-foreground hover:bg-signal/20"
        >
          <UserPlus className="size-3.5" /> Assign myself as driver
        </button>
      )}
      {selfAssigned && (
        <p className="rounded-md bg-positive/10 px-3 py-2 text-xs font-semibold text-positive">
          You are assigned as this truck's driver.
        </p>
      )}
      <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {assigned ? "Reassign driver by email" : "Assign a driver by email"}
      </label>
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setMsg(null);
            setPending(null);
          }}
          placeholder="driver@email.co.za"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-signal"
        />
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-signal px-3 py-2 text-xs font-bold uppercase tracking-wide text-signal-foreground hover:brightness-105 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
          Assign
        </button>
      </form>
      {pending && (
        <div className="space-y-1 rounded-md border border-border bg-graphite px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{pending.contactName}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {pending.email}
              </span>
            </span>
            <VerificationBadge status={pending.verification} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {pending.verification === "REJECTED"
              ? "This driver's account was rejected — they can't be assigned."
              : "Awaiting administrator approval — you can assign them once verified."}
          </p>
        </div>
      )}
      {msg && (
        <p className={`text-[11px] font-medium ${msg.ok ? "text-positive" : "text-danger"}`}>
          {msg.text}
        </p>
      )}
      {assigned && (
        <button
          onClick={onUnassign}
          className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-danger"
        >
          Remove driver
        </button>
      )}
      <p className="text-[10px] leading-snug text-muted-foreground">
        Enter an organisation driver's email. Add new drivers under Organisation; they do not need
        to sign up themselves.
      </p>
    </div>
  );
}

function VerificationBadge({ status }: { status: Party["verification"] }) {
  const tone =
    status === "VERIFIED"
      ? "bg-positive/15 text-positive"
      : status === "REJECTED"
        ? "bg-danger/15 text-danger"
        : "bg-signal/20 text-foreground";
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${tone}`}
    >
      {status}
    </span>
  );
}

export default TruckDetail;
