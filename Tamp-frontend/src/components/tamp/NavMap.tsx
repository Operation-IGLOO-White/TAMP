"use client";

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
import { decodePolyline, pointAlong, type LatLng } from "@/lib/polyline";
import type { Load, Trip } from "tamp-backend/src/types";

const STYLE = "https://tiles.openfreemap.org/styles/liberty";

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
  const toPickup = trip.status === "SCHEDULED" || trip.status === "AT_PICKUP";
  return toPickup
    ? { pos: [load.origin.lat, load.origin.lng] as LatLng, label: load.origin.label, toPickup }
    : { pos: [load.destination.lat, load.destination.lng] as LatLng, label: load.destination.label, toPickup };
}

export function NavMap({ load, trip, className }: { load: Load; trip: Trip; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<MlMarker[]>([]);
  const flownRef = useRef(false);
  const [route, setRoute] = useState<LatLng[] | null>(null);
  const [info, setInfo] = useState<{ km: number; min: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    computeRoute(load.origin, load.destination)
      .then((r) => {
        if (cancelled || !r) return;
        setRoute(decodePolyline(r.encodedPolyline));
        setInfo({ km: r.distanceKm, min: r.durationMin });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [load.origin, load.destination]);

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
        typeof ResizeObserver !== "undefined"
          ? new ResizeObserver(() => map.resize())
          : null;
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
  }, [route, trip.progressPct, trip.status]);

  // Draw the route line + pick-up/drop-off/truck markers, then sweep the camera
  // from the flat overview into the tilted road view.
  function drawAndFly(
    maplibregl: typeof import("maplibre-gl"),
    map: MlMap,
  ) {
    const o: LatLng = [load.origin.lat, load.origin.lng];
    const d: LatLng = [load.destination.lat, load.destination.lng];
    const line: LatLng[] = route && route.length > 1 ? route : [o, d];
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

    // Truck position: live GPS fix, else interpolated along the road by progress.
    const pct = Math.min(100, Math.max(0, trip.progressPct));
    const truck: LatLng = trip.simulatedPosition
      ? [trip.simulatedPosition.lat, trip.simulatedPosition.lng]
      : route && route.length > 1
        ? pointAlong(route, pct / 100)
        : [o[0] + (d[0] - o[0]) * (pct / 100), o[1] + (d[1] - o[1]) * (pct / 100)];

    // Heading = direction of travel (truck → a point just ahead on the road).
    const ahead: LatLng =
      route && route.length > 1 ? pointAlong(route, Math.min(1, pct / 100 + 0.04)) : d;
    const heading = bearing(truck, ahead);

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const addMarker = (pos: LatLng, color: string, el?: HTMLElement) => {
      const m = el
        ? new maplibregl.Marker({ element: el })
        : new maplibregl.Marker({ color });
      m.setLngLat([pos[1], pos[0]]).addTo(map);
      markersRef.current.push(m);
    };
    addMarker(o, "#16a34a");
    addMarker(d, "#dc2626");
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

  const stop = nextStopFor(load, trip);
  const pctDone = Math.min(100, Math.max(0, trip.progressPct));
  const remKm = info && !stop.toPickup ? Math.max(0, Math.round(info.km * (1 - pctDone / 100))) : null;
  const remMin = info && !stop.toPickup ? Math.max(0, Math.round(info.min * (1 - pctDone / 100))) : null;

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
            {stop.toPickup
              ? "Proceed to the collection point"
              : remKm != null
                ? `${remKm} km left · ~${Math.floor((remMin ?? 0) / 60)}h ${(remMin ?? 0) % 60}m to go`
                : "Calculating route…"}
          </div>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  );
}
