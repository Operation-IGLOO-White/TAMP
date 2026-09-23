"use client";

// In-app route map for a single trip (Uber/Bolt style): draws the real driving
// route from the Google Routes API on a Leaflet/OpenStreetMap canvas, with
// pickup, drop-off and a live truck marker. No hand-off to an external maps app.

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import { computeRoute } from "@/fns/routes";
import { decodePolyline, pointAlong, type LatLng } from "@/lib/polyline";
import type { Load, Trip } from "@/lib/tamp-types";

export function TripRouteMap({
  load,
  trip,
  className,
  zoomable = true,
}: {
  load: Load;
  trip: Trip;
  className?: string;
  zoomable?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const boundsRef = useRef<LatLng[] | null>(null);
  const [route, setRoute] = useState<LatLng[] | null>(null);
  const [info, setInfo] = useState<{ km: number; min: number } | null>(null);

  // Fetch the real road geometry once.
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

      // Truck: live GPS fix, else interpolated along the real road by progress.
      const pct = Math.min(100, Math.max(0, trip.progressPct));
      const truckPos: LatLng = trip.simulatedPosition
        ? [trip.simulatedPosition.lat, trip.simulatedPosition.lng]
        : route && route.length > 1
          ? pointAlong(route, pct / 100)
          : [o[0] + (d[0] - o[0]) * (pct / 100), o[1] + (d[1] - o[1]) * (pct / 100)];
      dot(truckPos, "#e0a800", `${trip.id} · ${pct}%`).openPopup();

      const bounds = route && route.length > 1 ? route : [o, d];
      boundsRef.current = bounds;
      requestAnimationFrame(() =>
        mapRef.current?.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [route, load, trip.id, trip.progressPct, trip.simulatedPosition]);

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

  return (
    <div className={`flex flex-col overflow-hidden ${className ?? ""}`}>
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
          {info ? `${info.km} km · ${Math.floor(info.min / 60)}h ${info.min % 60}m` : "Routing…"}
        </span>
      </div>
    </div>
  );
}
