// In-app route map for a single trip (Uber/Bolt style): draws the real driving
// route from Valhalla on an OpenStreetMap canvas, with
// pickup, drop-off and a live truck marker. No hand-off to an external maps app.

import { Navigation } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import { computeRoute } from "@/fns/routes";
import { geoJsonLineToLatLng, pointAlong, type LatLng } from "@/lib/polyline";
import type { Load, Trip } from "@/types/domain";
import { useLiveTripPosition } from "@/hooks/useLiveTracking";

// Before the cargo is loaded the driver heads to the pick-up; after that, to
// the drop-off. Navigation targets whichever stop is next.
function nextStopFor(load: Load, trip: Trip) {
  const stops = load.stops;
  if (stops?.length) {
    const stop = stops[Math.min(trip.currentStopIndex ?? 0, stops.length - 1)]!;
    return {
      pos: [stop.place.lat, stop.place.lng] as LatLng,
      label: stop.place.label,
      kind: stop.kind === "PICKUP" ? "Pick-up" : "Drop-off",
      toPickup: stop.kind === "PICKUP",
    };
  }
  const toPickup = ["SCHEDULED", "EN_ROUTE_PICKUP", "AT_PICKUP"].includes(trip.status);
  return toPickup
    ? {
        pos: [load.origin.lat, load.origin.lng] as LatLng,
        label: load.origin.label,
        kind: "Pick-up",
        toPickup,
      }
    : {
        pos: [load.destination.lat, load.destination.lng] as LatLng,
        label: load.destination.label,
        kind: "Drop-off",
        toPickup,
      };
}

export function TripRouteMap({
  load,
  trip,
  className,
  zoomable = true,
  nav = false,
}: {
  load: Load;
  trip: Trip;
  className?: string;
  zoomable?: boolean;
  // Navigation mode: zoom into the active leg (truck → next stop) and show a
  // turn-by-stop banner with the remaining distance / ETA.
  nav?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const boundsRef = useRef<LatLng[] | null>(null);
  const [route, setRoute] = useState<LatLng[] | null>(null);
  const [info, setInfo] = useState<{ km: number; min: number } | null>(null);
  const livePosition = useLiveTripPosition(trip.id);

  // Fetch the real road geometry once.
  useEffect(() => {
    let cancelled = false;
    const places = load.stops?.map((stop) => stop.place) ?? [load.origin, load.destination];
    Promise.all(places.slice(0, -1).map((place, index) => computeRoute(place, places[index + 1]!)))
      .then((legs) => {
        if (cancelled || legs.some((leg) => !leg)) return;
        setRoute(
          legs.flatMap((leg, index) =>
            geoJsonLineToLatLng(leg!.geometry.coordinates).slice(index ? 1 : 0),
          ),
        );
        setInfo({
          km: legs.reduce((sum, leg) => sum + leg!.distanceKm, 0),
          min: legs.reduce((sum, leg) => sum + leg!.durationMin, 0),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        const map = L.map(containerRef.current, {
          attributionControl: true,
          zoomControl: zoomable,
          scrollWheelZoom: zoomable,
          doubleClickZoom: zoomable,
          touchZoom: zoomable,
          boxZoom: zoomable,
          keyboard: zoomable,
        }).setView([-29, 25], 5);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
      }

      const layer = layerRef.current;
      if (!layer) return;
      layer.clearLayers();

      const o: LatLng = [load.origin.lat, load.origin.lng];
      const d: LatLng = [load.destination.lat, load.destination.lng];
      const line = route && route.length > 1 ? route : [o, d];

      L.polyline(line, {
        color: route ? "#3b82f6" : "#9ca3af",
        weight: route ? 4 : 2,
        opacity: 0.85,
        dashArray: route ? undefined : "6 6",
      }).addTo(layer);

      const dot = (pos: LatLng, color: string, label: string) =>
        L.circleMarker(pos, {
          radius: 8,
          color: "#ffffff",
          weight: 2,
          fillColor: color,
          fillOpacity: 1,
        })
          .addTo(layer)
          .bindPopup(label);

      dot(o, "#16a34a", `Pick-up · ${load.origin.label}`);
      dot(d, "#dc2626", `Drop-off · ${load.destination.label}`);
      load.stops
        ?.slice(1, -1)
        .forEach((stop) =>
          dot(
            [stop.place.lat, stop.place.lng],
            stop.kind === "PICKUP" ? "#16a34a" : "#dc2626",
            `${stop.sequence + 1}. ${stop.kind === "PICKUP" ? "Pick-up" : "Drop-off"} · ${stop.place.label}`,
          ),
        );

      // Truck: live GPS fix, else interpolated along the real road by progress.
      const pct = Math.min(100, Math.max(0, trip.progressPct));
      const currentPosition = livePosition ?? trip.simulatedPosition;
      const truckPos: LatLng = currentPosition
        ? [currentPosition.lat, currentPosition.lng]
        : route && route.length > 1
          ? pointAlong(route, pct / 100)
          : [o[0] + (d[0] - o[0]) * (pct / 100), o[1] + (d[1] - o[1]) * (pct / 100)];
      dot(truckPos, "#e0a800", `${trip.id} · ${pct}%`).openPopup();

      // Navigation mode zooms into the active leg (truck → next stop); the
      // overview mode fits the whole route.
      const bounds = nav
        ? [truckPos, nextStopFor(load, trip).pos]
        : route && route.length > 1
          ? route
          : [o, d];
      boundsRef.current = bounds;
      requestAnimationFrame(() =>
        mapRef.current?.fitBounds(bounds, { padding: [50, 50], maxZoom: nav ? 14 : 12 }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [
    route,
    load,
    trip.id,
    trip.status,
    trip.progressPct,
    trip.simulatedPosition,
    livePosition,
    nav,
  ]);

  // Leaflet mismeasures if its container is still sizing (flex/modal). Remeasure
  // and re-fit the route whenever the container resizes, plus a few times on mount.
  useEffect(() => {
    const refit = () => {
      const map = mapRef.current;
      if (!map) return;
      map.invalidateSize();
      if (boundsRef.current) map.fitBounds(boundsRef.current, { padding: [40, 40], maxZoom: 12 });
    };
    let n = 0;
    const id = window.setInterval(() => {
      refit();
      if (++n >= 6) window.clearInterval(id);
    }, 200);
    const ro =
      typeof ResizeObserver !== "undefined" && containerRef.current
        ? new ResizeObserver(() => refit())
        : null;
    if (ro && containerRef.current) ro.observe(containerRef.current);
    return () => {
      window.clearInterval(id);
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Navigation banner details (next stop + remaining distance/ETA).
  const stop = nextStopFor(load, trip);
  const pctDone = Math.min(100, Math.max(0, trip.progressPct));
  const remKm =
    info && !stop.toPickup ? Math.max(0, Math.round(info.km * (1 - pctDone / 100))) : null;
  const remMin =
    info && !stop.toPickup ? Math.max(0, Math.round(info.min * (1 - pctDone / 100))) : null;
  const liveAgeSeconds = livePosition
    ? Math.max(0, Math.round((Date.now() - new Date(livePosition.recordedAt).getTime()) / 1000))
    : null;

  return (
    <div className={`flex flex-col overflow-hidden ${className ?? ""}`}>
      {nav && (
        <div className="flex items-center gap-2.5 border-b border-border bg-signal/10 px-4 py-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-signal text-signal-foreground">
            <Navigation className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold uppercase tracking-wide">
              {stop.toPickup ? "Head to pick-up" : "En route to drop-off"} · {stop.label}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {stop.toPickup
                ? "Proceed to the collection point"
                : remKm != null
                  ? `${remKm} km left · ~${Math.floor((remMin ?? 0) / 60)}h ${(remMin ?? 0) % 60}m to go`
                  : "Calculating route…"}
            </div>
          </div>
        </div>
      )}
      <div ref={containerRef} className="min-h-0 flex-1" />
      <div className="flex items-center justify-between gap-3 border-t border-border bg-graphite px-4 py-2 text-[11px]">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-positive" /> Pick-up
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-danger" /> Drop-off
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-signal" /> Truck
          </span>
        </span>
        <span className="font-mono text-muted-foreground">
          {liveAgeSeconds != null
            ? liveAgeSeconds < 30
              ? `GPS live · ${liveAgeSeconds}s ago`
              : `GPS stale · ${Math.floor(liveAgeSeconds / 60)}m ago`
            : info
              ? `${info.km} km · ${Math.floor(info.min / 60)}h ${info.min % 60}m`
              : "Routing…"}
        </span>
      </div>
    </div>
  );
}
