// In-app turn-by-stop navigation view. Uses MapLibre GL (free OpenFreeMap
// vector tiles, no key) so the camera can TILT: it opens in a top-down
// bird's-eye view, then automatically eases into a pitched, heading-up "road
// view" that looks down the route the way a satnav does. Leaflet (used for the
// flat overview map) is 2D only and can't do this.

import { Navigation } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, Marker as MlMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { computeRoute } from "@/fns/routes";
import { geoJsonLineToLatLng, pointAlong, type LatLng } from "@/lib/polyline";
import type { Load, Trip } from "@/types/domain";
import { useLiveTripPosition } from "@/hooks/useLiveTracking";

const STYLE =
  import.meta.env["VITE_MAP_STYLE_URL"] || "https://tiles.openfreemap.org/styles/liberty";

// Forward bearing (degrees) from a → b, for pointing the camera down the road.
function bearing(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(a[0]);
  const φ2 = toRad(b[0]);
  const Δλ = toRad(b[1] - a[1]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function nextStopFor(load: Load, trip: Trip) {
  const stops = load.stops;
  if (stops?.length) {
    const stop = stops[Math.min(trip.currentStopIndex ?? 0, stops.length - 1)]!;
    return {
      pos: [stop.place.lat, stop.place.lng] as LatLng,
      label: stop.place.label,
      toPickup: stop.kind === "PICKUP",
    };
  }
  const toPickup = ["SCHEDULED", "EN_ROUTE_PICKUP", "AT_PICKUP"].includes(trip.status);
  return toPickup
    ? { pos: [load.origin.lat, load.origin.lng] as LatLng, label: load.origin.label, toPickup }
    : {
        pos: [load.destination.lat, load.destination.lng] as LatLng,
        label: load.destination.label,
        toPickup,
      };
}

export function NavMap({ load, trip, className }: { load: Load; trip: Trip; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<MlMarker[]>([]);
  const flownRef = useRef(false);
  const [route, setRoute] = useState<LatLng[] | null>(null);
  const [info, setInfo] = useState<{ km: number; min: number } | null>(null);
  const livePosition = useLiveTripPosition(trip.id);
  const trackedPosition = livePosition ?? trip.livePosition ?? trip.simulatedPosition;
  const activeStop = nextStopFor(load, trip);
  const stopLat = activeStop.pos[0];
  const stopLng = activeStop.pos[1];
  const trackedLat = trackedPosition?.lat;
  const trackedLng = trackedPosition?.lng;

  useEffect(() => {
    let cancelled = false;
    setRoute(null);
    setInfo(null);

    // Navigation always routes the active leg: the driver's latest position
    // to the current operational stop. Before the first GPS fix, use the last
    // trip position; as a final fallback show the load route.
    const origin =
      trackedLat != null && trackedLng != null ? { lat: trackedLat, lng: trackedLng } : load.origin;
    computeRoute(origin, { lat: stopLat, lng: stopLng })
      .then((leg) => {
        if (cancelled || !leg) return;
        setRoute(geoJsonLineToLatLng(leg.geometry.coordinates));
        setInfo({ km: leg.distanceKm, min: leg.durationMin });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [load, stopLat, stopLng, trackedLat, trackedLng]);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const o: LatLng = [load.origin.lat, load.origin.lng];
      const d: LatLng = [load.destination.lat, load.destination.lng];

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE,
        center: [o[1], o[0]],
        zoom: 6,
        pitch: 0,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");

      map.on("load", () => {
        if (cancelled) return;
        map.resize();
        drawAndFly(maplibregl, map);
      });

      // GL canvas mis-sizes when the container animates in (modal). Remeasure a
      // few times and whenever it resizes.
      let n = 0;
      const sizer = window.setInterval(() => {
        map.resize();
        if (++n >= 6) window.clearInterval(sizer);
      }, 200);
      const ro =
        typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => map.resize()) : null;
      if (ro && containerRef.current) ro.observe(containerRef.current);

      cleanup = () => {
        window.clearInterval(sizer);
        ro?.disconnect();
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];
        map.remove();
        mapRef.current = null;
      };
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
    // Re-init only when the trip identity changes (a new job).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  // (Re)draw route + markers and run the camera when the route resolves or the
  // truck moves. Runs against the already-created map.
  useEffect(() => {
    (async () => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;
      const maplibregl = (await import("maplibre-gl")).default;
      drawAndFly(maplibregl, map);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, trip.progressPct, trip.status, livePosition]);

  // Draw the route line + pick-up/drop-off/truck markers, then sweep the camera
  // from the flat overview into the tilted road view.
  function drawAndFly(maplibregl: typeof import("maplibre-gl"), map: MlMap) {
    const o: LatLng = [load.origin.lat, load.origin.lng];
    const d: LatLng = [load.destination.lat, load.destination.lng];
    const currentPosition = livePosition ?? trip.livePosition ?? trip.simulatedPosition;
    const truckFallback: LatLng = currentPosition
      ? [currentPosition.lat, currentPosition.lng]
      : activeStop.toPickup
        ? o
        : d;
    const line: LatLng[] = route && route.length > 1 ? route : [truckFallback, activeStop.pos];
    const coords = line.map(([lat, lng]) => [lng, lat] as [number, number]);

    const geojson = {
      type: "Feature" as const,
      geometry: { type: "LineString" as const, coordinates: coords },
      properties: {},
    };
    const src = map.getSource("route") as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(geojson);
    } else {
      map.addSource("route", { type: "geojson", data: geojson });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#1e3a8a", "line-width": 10, "line-opacity": 0.6 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#3b82f6", "line-width": 6 },
      });
    }

    // Truck position: use the latest real GPS fix. The route itself begins at
    // this point, so the blue line and camera move with the driver.
    const pct = Math.min(100, Math.max(0, trip.progressPct));
    const truck: LatLng = currentPosition
      ? [currentPosition.lat, currentPosition.lng]
      : route && route.length > 1
        ? route[0]!
        : truckFallback;

    // Heading = direction of travel (truck → a point just ahead on the road).
    const ahead: LatLng = route && route.length > 1 ? pointAlong(route, 0.04) : activeStop.pos;
    const heading = bearing(truck, ahead);

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const addMarker = (pos: LatLng, color: string, el?: HTMLElement) => {
      const m = el ? new maplibregl.Marker({ element: el }) : new maplibregl.Marker({ color });
      m.setLngLat([pos[1], pos[0]]).addTo(map);
      markersRef.current.push(m);
    };
    addMarker(activeStop.pos, activeStop.toPickup ? "#16a34a" : "#dc2626");
    // Truck marker — a heading arrow chip.
    const truckEl = document.createElement("div");
    truckEl.style.cssText =
      "width:30px;height:30px;border-radius:50%;background:#e0a800;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:grid;place-items:center;color:#111;font-weight:800;font-size:14px;";
    truckEl.textContent = "▲";
    truckEl.style.transform = `rotate(${heading}deg)`;
    addMarker(truck, "#e0a800", truckEl);

    // Camera: the road view — pitched, heading-up, zoomed to the truck.
    const flyToRoadView = () =>
      mapRef.current?.easeTo({
        center: [truck[1], truck[0]],
        zoom: 15.4,
        pitch: 60,
        bearing: heading,
        duration: flownRef.current ? 800 : 2400,
      });

    if (!flownRef.current) {
      flownRef.current = true;
      // Start in a flat, top-down bird's-eye view, then automatically swoop into
      // the tilted road view — the "2D → navigation" transition.
      map.jumpTo({ center: [truck[1], truck[0]], zoom: 6, pitch: 0, bearing: 0 });
      window.setTimeout(flyToRoadView, 900);
    } else {
      flyToRoadView();
    }
  }

  const stop = activeStop;
  const remKm = info ? Math.max(0, Math.round(info.km)) : null;
  const remMin = info ? Math.max(0, Math.round(info.min)) : null;

  return (
    <div className={`flex flex-col overflow-hidden ${className ?? ""}`}>
      <div className="flex items-center gap-2.5 border-b border-border bg-signal/10 px-4 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-signal text-signal-foreground">
          <Navigation className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold uppercase tracking-wide">
            {stop.toPickup ? "Head to pick-up" : "En route to drop-off"} · {stop.label}
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">
            {remKm != null
              ? `${remKm} km left · ~${Math.floor((remMin ?? 0) / 60)}h ${(remMin ?? 0) % 60}m to go`
              : trackedPosition
                ? "Calculating route from your location…"
                : "Waiting for your GPS location…"}
          </div>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  );
}
