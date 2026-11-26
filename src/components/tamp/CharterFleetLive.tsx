import { LoadingIndicator } from "@/components/tamp/LoadingIndicator";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BusFront, Map, Radio } from "lucide-react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTamp } from "@/context/TampContext";
import { charterAssignmentLabel, charterStageLabel, charterVehicleComplete,
  type CharterLegKey, type CharterVehicleProgress } from "@/lib/charter-assignment";
import type { CharterPosition } from "@/lib/charter-location";
import { trpc } from "@/lib/trpc";
import type { Place } from "@/types/domain";

type TrackedVehicle = CharterVehicleProgress & {
  bookingId: string;
  supplier: string;
  activeLeg: CharterLegKey | null;
  position: CharterPosition | null;
  eta?: { checkpoint: string; label: string; arrivalAt: string; deadline: string | null; atRisk: boolean; positionAt: string } | null;
};

const button = "min-h-10 rounded-lg border border-border px-3 py-2 text-sm font-semibold";
const timeFormat = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Africa/Johannesburg",
});
const isStale = (position: CharterPosition, clock: number) => clock - Date.parse(position.recordedAt) >= 90_000;

export function CharterFleetLive({ bookingId, origin }: { bookingId: string; origin: Place }) {
  const [open, setOpen] = useState(false);
  return <section className="grid gap-3 rounded-xl border border-border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Radio className="size-4 text-signal" /> Live vehicle locations</h3>
      <button className={button} type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Map className="mr-1 inline size-4" /> {open ? "Hide live map" : "Show live map"}
      </button>
    </div>
    {open && <LiveMap bookingId={bookingId} origin={origin} />}
  </section>;
}

function LiveMap({ bookingId, origin }: { bookingId: string; origin: Place }) {
  const { authParty } = useTamp();
  const live = useQuery({
    queryKey: ["charter-live", authParty?.id, authParty?.activeOrganisationId, bookingId],
    queryFn: () => trpc.query<TrackedVehicle[]>("charter.live", { bookingId }),
    refetchInterval: 10_000,
    retry: false,
  });
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  const vehicles = live.data ?? [];
  return <>
    {live.isPending && <LoadingIndicator />}
    {live.isError && <p role="alert" className="text-sm text-muted-foreground">
      Live tracking could not refresh. {live.data && "Shown locations are from the last successful update."}
      <button type="button" className={button + " ml-2"} onClick={() => void live.refetch()}>Retry</button>
    </p>}
    {live.data && <FleetMap origin={origin} vehicles={vehicles} clock={clock} />}
    <ul className="grid gap-2 sm:grid-cols-2">
      {vehicles.map((vehicle) => {
        const { activeLeg, position, eta } = vehicle;
        const fresh = position && !isStale(position, clock);
        const currentEta = fresh && eta && clock - Date.parse(eta.positionAt) < 90_000 ? eta : null;
        return <li key={vehicle.bookingId + ":" + vehicle.vehicleId} className="min-w-0 rounded-lg border border-border p-2 text-sm">
          <p className="flex items-start gap-2 font-semibold"><BusFront className="mt-0.5 size-4 shrink-0" /> {vehicle.registration} · {vehicle.supplier}</p>
          <p className="text-muted-foreground">{activeLeg
            ? `${activeLeg === "outbound" ? "Outbound" : "Return"} · ${charterStageLabel[vehicle.legs[activeLeg]!.stage]}`
            : charterVehicleComplete(vehicle) ? "Completed" : vehicle.status === "ACCEPTED" ? "No active leg" : charterAssignmentLabel[vehicle.status]}</p>
          {position ? <p className={fresh ? "text-positive" : "text-muted-foreground"}>
            {fresh ? "Live" : "Stale location"} · Last GPS {timeFormat.format(new Date(position.recordedAt))} SAST
          </p> : <p className="text-muted-foreground">{activeLeg ? "Waiting for the first GPS update" : "GPS sharing off"}</p>}
          {activeLeg && (currentEta ? <div className="mt-2 border-t border-border pt-2">
            <p className="break-words font-medium">{currentEta.checkpoint} · {currentEta.label}</p>
            <p>ETA {timeFormat.format(new Date(currentEta.arrivalAt))} SAST</p>
            {currentEta.deadline && <p className="text-muted-foreground">
              Scheduled by {timeFormat.format(new Date(currentEta.deadline))} SAST
            </p>}
            {currentEta.atRisk && <p className="font-semibold text-destructive">Delay expected</p>}
          </div> : <p className="mt-1 text-muted-foreground">ETA unavailable</p>)}
        </li>;
      })}
    </ul>
  </>;
}

function FleetMap({ origin, vehicles, clock }: { origin: Place; vehicles: TrackedVehicle[]; clock: number }) {
  const element = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [error, setError] = useState(false);
  const [fit, setFit] = useState(0);
  const fitted = useRef<number | null>(null);
  const originLat = origin.lat;
  const originLng = origin.lng;
  const hasPositions = vehicles.some((vehicle) => vehicle.position);

  useEffect(() => {
    let open = true;
    let instance: LeafletMap | undefined;
    void import("leaflet").then(({ default: L }) => {
      if (!open || !element.current) return;
      instance = L.map(element.current, { scrollWheelZoom: false }).setView([originLat, originLng], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).on("tileerror", () => { if (open) setError(true); }).addTo(instance);
      setMap(instance);
    }).catch(() => { if (open) setError(true); });
    return () => { open = false; instance?.remove(); };
  }, [originLat, originLng]);

  useEffect(() => {
    if (!map) return;
    let open = true;
    let markers: import("leaflet").LayerGroup | undefined;
    void import("leaflet").then(({ default: L }) => {
      if (!open) return;
      markers = L.layerGroup().addTo(map);
      const points: [number, number][] = [];
      for (const vehicle of vehicles) {
        const { position } = vehicle;
        if (!position) continue;
        const point: [number, number] = [position.lat, position.lng];
        points.push(point);
        const label = document.createElement("span");
        label.textContent = `${vehicle.registration} · ${vehicle.supplier}`;
        L.circleMarker(point, {
          radius: 8, color: "#171717", weight: 2, fillOpacity: 1,
          fillColor: isStale(position, clock) ? "#a1a1aa" : "#efb200",
        }).bindTooltip(label).addTo(markers);
      }
      if (points.length && fitted.current !== fit) {
        map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 15 });
        fitted.current = fit;
      }
    }).catch(() => { if (open) setError(true); });
    return () => { open = false; markers?.remove(); };
  }, [map, vehicles, clock, fit]);

  return <div className="grid gap-2">
    {hasPositions && <button type="button" className={button + " justify-self-start"} onClick={() => setFit(fit + 1)}>Fit all vehicles</button>}
    <div ref={element} className="isolate h-64 rounded-lg bg-muted sm:h-80" aria-label="Charter fleet map" />
    {error && <p className="text-sm text-muted-foreground">Some map tiles could not load. Vehicle updates are listed below.</p>}
    {!hasPositions && <p className="text-sm text-muted-foreground">Vehicle markers appear when drivers share GPS during a leg.</p>}
  </div>;
}
