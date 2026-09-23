"use client";

import { useParams } from "next/navigation";


import { CheckCircle2, Circle, PackageCheck, Truck } from "lucide-react";
import { LaneRail } from "@/components/tamp/LaneRail";
import { estimateEta } from "@/lib/tamp-dashboard";
import { activeMatchForLoad, tripForMatch } from "@/lib/tamp-selectors";
import { useTamp } from "@/lib/tamp-store";
import type { Load, Trip, TripStatus } from "@/lib/tamp-types";

// Public, unauthenticated tracking page — the link a cargo owner shares with
// the consignee. No account, no commercials (no rates), no app chrome.
const STEPS: { status: TripStatus; label: string }[] = [
  { status: "SCHEDULED", label: "Scheduled" },
  { status: "AT_PICKUP", label: "At pickup" },
  { status: "LOADED", label: "Loaded" },
  { status: "IN_TRANSIT", label: "In transit" },
  { status: "AT_DROPOFF", label: "At drop-off" },
  { status: "DELIVERED", label: "Delivered" },
];

const STATUS_HEADLINE: Record<string, string> = {
  SCHEDULED: "Pickup scheduled",
  AT_PICKUP: "At the pickup point",
  LOADED: "Cargo loaded",
  IN_TRANSIT: "On the way to you",
  AT_DROPOFF: "Arriving now",
  DELIVERED: "Delivered",
  COMPLETED: "Delivered",
};

function TrackPage() {
  const { loadId } = useParams<{ loadId: string }>();
  const { loads, trucks, parties, matches, trips } = useTamp();

  const load = loads.find((l) => l.id === loadId || l.reference === loadId);
  const match = load ? activeMatchForLoad(load.id, matches) : undefined;
  const trip = tripForMatch(match?.id, trips);
  const truck = trucks.find((t) => t.id === match?.truckPostingId);
  const operator = truck ? parties.find((p) => p.id === truck.transporterId) : undefined;

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-graphite">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-5 py-4">
          <span className="grid size-7 place-items-center rounded-md bg-signal font-extrabold text-signal-foreground">
            T
          </span>
          <span className="text-lg font-extrabold tracking-tight">TAMP</span>
          <span className="ml-auto text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Delivery tracking
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-5 py-8">
        {!load ? (
          <EmptyState
            title="Tracking link not found"
            body="This tracking link is invalid or has expired. Check the link and try again."
          />
        ) : !trip ? (
          <>
            <ShipmentHeader load={load} />
            <EmptyState
              title="Not yet dispatched"
              body="Your delivery is being arranged. This page will update as soon as a truck is on the way."
            />
          </>
        ) : (
          <>
            <ShipmentHeader load={load} />

            {/* Live status */}
            <div className="mt-6 rounded-xl border border-border bg-graphite p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-signal/15 text-signal-foreground">
                  {trip.status === "DELIVERED" || trip.status === "COMPLETED" ? (
                    <PackageCheck className="size-5" />
                  ) : (
                    <Truck className="size-5" />
                  )}
                </span>
                <div>
                  <div className="text-lg font-bold leading-tight">
                    {STATUS_HEADLINE[trip.status] ?? "In progress"}
                  </div>
                  {trip.status !== "DELIVERED" && trip.status !== "COMPLETED" && (
                    <div className="text-xs text-muted-foreground">
                      ETA{" "}
                      {estimateEta(load, trip).toLocaleString("en-ZA", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · simulated
                    </div>
                  )}
                </div>
                <span className="ml-auto font-mono text-2xl font-black text-signal">
                  {trip.progressPct}%
                </span>
              </div>

              <div className="mt-5">
                <LaneRail
                  origin={load.origin}
                  destination={load.destination}
                  distanceKm={load.distanceKm}
                  progressPct={trip.progressPct}
                  simulated
                />
              </div>
            </div>

            {/* Milestones */}
            <div className="mt-6 rounded-xl border border-border bg-graphite p-5">
              <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Journey
              </h2>
              <Timeline trip={trip} />
            </div>

            {/* Carrier (no commercials) */}
            <div className="mt-6 grid grid-cols-2 gap-4">
              <Fact label="Carrier" value={operator?.companyName ?? "—"} />
              <Fact label="Vehicle" value={truck ? truck.registration : "—"} />
            </div>
          </>
        )}

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          Live tracking powered by TAMP · you don't need an account to view this page.
        </p>
      </div>
    </main>
  );
}

function ShipmentHeader({ load }: { load: Load }) {
  return (
    <div className="rounded-xl border border-border bg-graphite p-5">
      <div className="font-mono text-[11px] text-muted-foreground">Shipment #{load.id}</div>
      <div className="mt-1 text-xl font-bold uppercase leading-tight">
        {load.origin.label} → {load.destination.label}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {(load.weightKg / 1000).toFixed(1)}t · {load.cargoType.replaceAll("_", " ")} · deliver by{" "}
        {new Date(load.deliveryBy).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })}
      </div>
    </div>
  );
}

function Timeline({ trip }: { trip: Trip }) {
  const currentIdx = STEPS.findIndex((s) => s.status === trip.status);
  const doneIdx = trip.status === "COMPLETED" ? STEPS.length - 1 : currentIdx;
  const at = (status: TripStatus) => trip.events.find((e) => e.status === status)?.at;

  return (
    <ol>
      {STEPS.map((step, i) => {
        const done = i < doneIdx;
        const active = i === doneIdx;
        const when = at(step.status);
        return (
          <li key={step.status} className="flex gap-3">
            <div className="flex flex-col items-center">
              {active ? (
                <Circle className="size-4 shrink-0 fill-signal text-signal" />
              ) : done ? (
                <CheckCircle2 className="size-4 shrink-0 text-positive" />
              ) : (
                <Circle className="size-4 shrink-0 text-border" />
              )}
              {i < STEPS.length - 1 && (
                <span className={`w-px flex-1 min-h-7 ${done ? "bg-positive/40" : "bg-border"}`} />
              )}
            </div>
            <div className="pb-5 -mt-0.5">
              <div
                className={`text-sm font-semibold ${done || active ? "text-foreground" : "text-muted-foreground"}`}
              >
                {step.label}
              </div>
              {when && (
                <div className="font-mono text-[11px] text-muted-foreground">
                  {new Date(when).toLocaleString("en-ZA", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-graphite p-4">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-border p-8 text-center">
      <Truck className="mx-auto mb-3 size-8 text-muted-foreground" />
      <h2 className="text-base font-bold">{title}</h2>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default TrackPage;
