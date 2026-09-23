"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { Link } from "@/lib/nav";
import { BadgeCheck, FileText, Mail, Phone, Star } from "lucide-react";
import { AppShell } from "@/components/tamp/AppShell";
import { Avatar } from "@/components/tamp/Avatar";
import { Panel } from "@/components/tamp/StatCard";
import { StatusChip } from "@/components/tamp/StatusChip";
import { getOnboarding, setPartyVerification } from "@/fns/parties";
import { ROLE_SHORT } from "@/lib/role-routes";
import { formatMoney } from "@/lib/tamp-data";
import { displayStatusForLoad } from "@/lib/tamp-selectors";
import { useTamp } from "@/lib/tamp-store";
import type { OnboardingUserType, Party } from "@/lib/tamp-types";

const USER_TYPE_LABEL: Record<OnboardingUserType, string> = {
  CARGO_OWNER: "Cargo Owner",
  CARRIER: "Carrier / Truck Owner",
  BROKER: "Broker / Business",
  DRIVER: "Truck Driver",
};

const VERIFICATION_STATUSES: Party["verification"][] = [
  "UNVERIFIED",
  "PENDING",
  "VERIFIED",
  "REJECTED",
];

const VERIFY_TONE: Record<Party["verification"], string> = {
  VERIFIED: "bg-positive/15 text-positive",
  PENDING: "bg-signal/20 text-signal-foreground",
  UNVERIFIED: "bg-steel text-muted-foreground",
  REJECTED: "bg-danger/15 text-danger",
};

function PartyDetail() {
  const { partyId } = useParams<{ partyId: string }>();
  const { parties, loads, trucks, matches, trips, disputes, audit, setVerification } = useTamp();

  const party = parties.find((p) => p.id === partyId);
  // Verification writes through to Postgres (parties aren't in the domain sync).
  const verify = useMutation({
    mutationFn: (v: { partyId: string; status: Party["verification"] }) =>
      setPartyVerification({ data: v }),
  });
  // The rich sign-up application, for review before approving.
  const { data: onboarding } = useQuery({
    queryKey: ["onboarding", partyId],
    queryFn: () => getOnboarding(partyId),
    enabled: !!party,
  });
  const setStatus = (status: Party["verification"]) => {
    if (!party) return;
    setVerification(party.id, status);
    verify.mutate({ partyId: party.id, status });
  };

  if (!party) {
    return (
      <AppShell>
        <div className="p-10 text-center">
          <p className="text-sm text-muted-foreground">User {partyId} not found.</p>
          <Link
            to="/admin/users"
            className="mt-3 inline-block text-xs font-bold uppercase tracking-wide text-signal hover:underline"
          >
            ← Back to users
          </Link>
        </div>
      </AppShell>
    );
  }

  const ownedLoads = loads.filter((l) => l.ownerId === party.id);
  const ownedTrucks = trucks.filter((t) => t.transporterId === party.id);
  const drivenTrucks = trucks.filter((t) => t.driverId === party.id);
  const activity = audit
    .filter((e) => e.actorId === party.id || e.subjectId === party.id)
    .slice(0, 8);

  return (
    <AppShell>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/90 px-6 py-4 backdrop-blur-md">
        <Link
          to="/admin/users"
          className="text-[10px] font-bold uppercase tracking-widest text-signal"
        >
          ← Users
        </Link>
        <h1 className="text-sm font-bold tracking-tight">{party.contactName}</h1>
      </div>

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[320px_1fr] lg:items-start">
        {/* Identity + admin controls */}
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-graphite p-6 text-center">
            <div className="flex justify-center">
              <Avatar party={party} size="lg" />
            </div>
            <div className="mt-4 text-lg font-bold leading-tight">{party.contactName}</div>
            <div className="text-sm text-muted-foreground">{party.companyName}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {ROLE_SHORT[party.role]}
            </div>
            {party.ratingAvg !== null && (
              <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-steel px-2.5 py-1 text-[11px] font-semibold">
                <Star className="size-3.5 fill-signal text-signal" /> {party.ratingAvg} (
                {party.ratingCount})
              </div>
            )}
            <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-left text-xs">
              <div className="flex items-center gap-2">
                <Mail className="size-3.5 text-muted-foreground" /> {party.email}
              </div>
              <div className="flex items-center gap-2 font-mono">
                <Phone className="size-3.5 text-muted-foreground" /> {party.phone}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {party.province} · member since{" "}
                {new Date(party.createdAt).toLocaleDateString("en-ZA", {
                  month: "short",
                  year: "numeric",
                })}
              </div>
            </div>
          </div>

          <Panel title="Verification">
            <div className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Current status
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${VERIFY_TONE[party.verification]}`}
                >
                  <BadgeCheck className="size-3.5" /> {party.verification}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {VERIFICATION_STATUSES.map((s) => {
                  const active = party.verification === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      disabled={active || verify.isPending}
                      className={`rounded-md border px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors disabled:cursor-not-allowed ${
                        active
                          ? `${VERIFY_TONE[s]} border-transparent`
                          : "border-border bg-graphite text-foreground hover:border-signal/60 hover:bg-steel/40"
                      }`}
                    >
                      {active ? `✓ ${s}` : s}
                    </button>
                  );
                })}
              </div>
            </div>
          </Panel>

          {onboarding && (
            <Panel title="Application">
              <div className="space-y-2.5 p-4 text-xs">
                <AppRow label="Applied as" value={USER_TYPE_LABEL[onboarding.userType]} />

                {onboarding.driver && (
                  <>
                    <div>
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Drives
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {onboarding.driver.vehicleClasses.map((c) => (
                          <span
                            key={c}
                            className="rounded bg-steel px-1.5 py-0.5 text-[10px] font-semibold text-foreground"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                    <AppRow label="Licence" value={`Code ${onboarding.driver.licenceCode}`} />
                    <AppRow
                      label="PrDP"
                      value={onboarding.driver.prdp ? "Held" : "Not declared"}
                      danger={!onboarding.driver.prdp}
                    />
                    <AppRow
                      label="Works as"
                      value={
                        onboarding.driver.workType === "OWNER" ? "Owner-operator" : "Fleet driver"
                      }
                    />
                    {onboarding.driver.truck && (
                      <AppRow
                        label="Vehicle"
                        value={`${onboarding.driver.truck.registration} · ${onboarding.driver.truck.bodyType} · ${onboarding.driver.truck.capacityT}t`}
                      />
                    )}
                    {onboarding.driver.fleetName && (
                      <AppRow label="Fleet" value={onboarding.driver.fleetName} />
                    )}
                  </>
                )}

                {onboarding.business && (
                  <>
                    <AppRow label="Company" value={onboarding.business.companyName} />
                    <AppRow label="Reg no." value={onboarding.business.registrationNumber || "—"} />
                    <AppRow label="Type" value={onboarding.business.businessType} />
                    <AppRow label="VAT" value={onboarding.business.vat || "—"} />
                  </>
                )}

                {onboarding.documents && onboarding.documents.length > 0 && (
                  <div>
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      Documents ({onboarding.documents.length})
                    </div>
                    <ul className="space-y-1">
                      {onboarding.documents.map((d) => (
                        <li key={d} className="flex items-center gap-1.5 text-foreground">
                          <FileText className="size-3.5 shrink-0 text-muted-foreground" /> {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {party.kycDocument && (
            <Panel title="KYC document">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-1.5">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm text-foreground">{party.kycDocument.name}</span>
                </div>
                {party.kycDocument.url && (
                  <a
                    href={party.kycDocument.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-steel/40"
                  >
                    View
                  </a>
                )}
              </div>
            </Panel>
          )}
        </div>

        {/* Related entities + activity */}
        <div className="space-y-6">
          {ownedLoads.length > 0 && (
            <Panel title={`Loads posted (${ownedLoads.length})`}>
              <div className="divide-y divide-border">
                {ownedLoads.map((l) => (
                  <div key={l.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-sm font-bold uppercase leading-tight">
                        {l.origin.label} → {l.destination.label}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        #{l.id} · {l.targetRate ? formatMoney(l.targetRate) : "—"}
                      </div>
                    </div>
                    <StatusChip status={displayStatusForLoad(l, matches, trips, disputes)} />
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {ownedTrucks.length > 0 && (
            <Panel title={`Trucks (${ownedTrucks.length})`}>
              <div className="divide-y divide-border">
                {ownedTrucks.map((t) => (
                  <Link
                    key={t.id}
                    to="/trucks/$truckId"
                    params={{ truckId: t.id }}
                    className="flex items-center justify-between px-4 py-3 hover:bg-steel/30"
                  >
                    <div>
                      <div className="text-sm font-semibold">{t.registration}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {t.bodyType} · {(t.payloadCapacityKg / 1000).toFixed(0)}t ·{" "}
                        {t.currentLocation.label}
                      </div>
                    </div>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                        t.status === "AVAILABLE"
                          ? "bg-positive/15 text-positive"
                          : "bg-steel text-foreground"
                      }`}
                    >
                      {t.status.replaceAll("_", " ")}
                    </span>
                  </Link>
                ))}
              </div>
            </Panel>
          )}

          {drivenTrucks.length > 0 && (
            <Panel title={`Drives (${drivenTrucks.length})`}>
              <div className="divide-y divide-border">
                {drivenTrucks.map((t) => (
                  <Link
                    key={t.id}
                    to="/trucks/$truckId"
                    params={{ truckId: t.id }}
                    className="flex items-center justify-between px-4 py-3 hover:bg-steel/30"
                  >
                    <span className="text-sm font-semibold">{t.registration}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {t.bodyType} · {t.currentLocation.label}
                    </span>
                  </Link>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Recent activity">
            <ol className="divide-y divide-border">
              {activity.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No recorded activity.
                </p>
              )}
              {activity.map((e) => (
                <li key={e.id} className="px-4 py-3">
                  <div className="text-xs font-medium">{e.summary}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {e.eventId} ·{" "}
                    {new Date(e.at).toLocaleString("en-ZA", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function AppRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`text-right font-medium ${danger ? "text-danger" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

export default PartyDetail;
