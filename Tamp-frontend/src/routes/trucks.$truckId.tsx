"use client";

import { Link } from "@/lib/nav";
import { useParams, useRouter } from "next/navigation";
import { BadgeCheck, Loader2, MapPin, Star, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AppShell } from "@/components/tamp/AppShell";
import { Avatar } from "@/components/tamp/Avatar";
import { BODY_TYPE_LABEL, BodyTypeIcon } from "@/components/tamp/BodyTypeIcon";
import { LaneRail } from "@/components/tamp/LaneRail";
import { Panel } from "@/components/tamp/StatCard";
import { StatusChip } from "@/components/tamp/StatusChip";
import { findDriver } from "@/fns/parties";
import { daysSince, estimateEta, isActiveTrip } from "@/lib/tamp-dashboard";
import { displayStatusForLoad } from "@/lib/tamp-selectors";
import { useTamp } from "@/lib/tamp-store";
import type { Party } from "@/lib/tamp-types";

function TruckDetail() {
  const { truckId } = useParams<{ truckId: string }>();
  const router = useRouter();
  const { trucks, parties, matches, loads, trips, disputes, role, assignDriver, linkDriver } =
    useTamp();

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
  const driver = truck.driverId ? parties.find((p) => p.id === truck.driverId) : undefined;
  const isAdmin = role === "ADMIN";

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

  return (
    <AppShell>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/90 px-6 py-4 backdrop-blur-md">
        <button
          onClick={() => router.back()}
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
            </dl>
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
            <AssignDriver
              assigned={!!driver}
              onLink={(d) => linkDriver(truck.id, d)}
              onUnassign={() => assignDriver(truck.id, "")}
            />
          </Panel>
        </aside>
      </div>
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

// Assign a driver to this truck by the email they registered with — the fleet
// doesn't hold the driver directory, so we resolve the account server-side.
function AssignDriver({
  assigned,
  onLink,
  onUnassign,
}: {
  assigned: boolean;
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
        setMsg({ ok: false, text: "No driver account found with that email." });
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
        Enter the email the driver signed up with. They'll see this truck's jobs the next time they
        sign in.
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
