"use client";

// CMP-14 Fleet Map — live truck positions on a Leaflet / OpenStreetMap viewer
// (OR007). Trucks sit at their simulated GPS fix, or are interpolated along the
// load lane by the trip's live progress. Leaflet is dynamically imported so it
// never runs during SSR, and markers are drawn as vector circles to avoid the
// classic bundler broken-marker-icon issue.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import { computeRoute } from "@/fns/routes";
import { isActiveTrip } from "@/lib/tamp-dashboard";
import { decodePolyline, pointAlong, type LatLng } from "@/lib/polyline";
import { useTamp } from "@/lib/tamp-store";
import type { Load, Trip } from "@/lib/tamp-types";

// Truck status → colour + label.
function toneFor(trip: Trip): { color: string; label: string } {
  if (trip.disputed) return { color: "#dc2626", label: "Issue reported" };
  switch (trip.status) {
    case "IN_TRANSIT":
    case "LOADED":
      return { color: "#e0a800", label: "In transit" };
    case "AT_DROPOFF":
      return { color: "#16a34a", label: "At drop-off" };
    default:
      return { color: "#6b7280", label: "At pickup" };
  }
}

interface Marker {
  trip: Trip;
  load: Load;
  lat: number;
  lng: number;
  color: string;
  label: string;
  pct: number;
}

export function FleetMap({
  transporterId,
  loadIds,
  className,
}: {
  transporterId?: string;
  loadIds?: string[];
  className?: string;
}) {
  const { trips, matches, loads, trucks } = useTamp();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);

  const loadFilter = loadIds ? loadIds.join(",") : "";
  const markers = useMemo<Marker[]>(() => {
    const only = loadFilter ? new Set(loadFilter.split(",")) : null;
    return trips
      .filter((t) => isActiveTrip(t.status))
      .map((trip): Marker | null => {
        const match = matches.find((m) => m.id === trip.matchId);
        const truck = trucks.find((tk) => tk.id === match?.truckPostingId);
        if (!truck) return null;
        if (transporterId && truck.transporterId !== transporterId) return null;
        const load = loads.find((l) => l.id === match?.loadId);
        if (!load) return null;
        if (only && !only.has(load.id)) return null;
        const pct = Math.min(100, Math.max(0, trip.progressPct));
        const pos = trip.simulatedPosition ?? {
          lng: load.origin.lng + (load.destination.lng - load.origin.lng) * (pct / 100),
          lat: load.origin.lat + (load.destination.lat - load.origin.lat) * (pct / 100),
        };
        const tone = toneFor(trip);
        return {
          trip,
          load,
          lat: pos.lat,
          lng: pos.lng,
          color: tone.color,
          label: tone.label,
          pct,
        };
      })
      .filter((m): m is Marker => m !== null);
  }, [trips, matches, loads, trucks, transporterId, loadFilter]);

  // Fetch the real road geometry per lane (server-cached) and decode it once.
  const [routeMap, setRouteMap] = useState<Record<string, LatLng[]>>({});
  const attempted = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Dedupe by lane; store the result regardless of this effect run's lifetime
    // so React's strict-mode double-mount doesn't drop the fetched route.
    for (const m of markers) {
      const id = m.load.id;
      if (attempted.current.has(id)) continue;
      attempted.current.add(id);
      computeRoute(m.load.origin, m.load.destination)
        .then((r) => {
          if (r) setRouteMap((prev) => ({ ...prev, [id]: decodePolyline(r.encodedPolyline) }));
        })
        .catch(() => attempted.current.delete(id));
    }
  }, [markers]);

  // Re-key the draw effect only when the drawn state actually changes.
  const drawKey =
    markers.map((m) => `${m.trip.id}:${m.pct}:${m.color}`).join("|") +
    "|" +
    Object.keys(routeMap).length;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        const map = L.map(containerRef.current, { attributionControl: true }).setView([-29, 25], 5);
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

      const bounds: [number, number][] = [];
      for (const m of markers) {
        const pts = routeMap[m.load.id];
        const hasRoute = !!pts && pts.length > 1;

        if (hasRoute) {
          // Real road geometry.
          L.polyline(pts, { color: "#3b82f6", weight: 3.5, opacity: 0.8 }).addTo(layer);
        } else {
          // Straight-line fallback until (or without) a route.
          L.polyline(
            [
              [m.load.origin.lat, m.load.origin.lng],
              [m.load.destination.lat, m.load.destination.lng],
            ],
            { color: "#9ca3af", weight: 1.5, dashArray: "5 5", opacity: 0.55 },
          ).addTo(layer);
        }

        // Truck position: live GPS fix if present, else along the real road, else
        // the straight-line interpolation already computed in `markers`.
        const pos: [number, number] =
          hasRoute && !m.trip.simulatedPosition ? pointAlong(pts, m.pct / 100) : [m.lat, m.lng];

        L.circleMarker(pos, {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: m.color,
          fillOpacity: 1,
        })
          .addTo(layer)
          .bindPopup(
            `<strong>${m.trip.id}</strong><br>${m.load.origin.label} &rarr; ${m.load.destination.label}<br>${m.label} &middot; ${m.pct}%`,
          );

        if (hasRoute) for (const p of pts) bounds.push(p);
        else bounds.push(pos);
      }

      // Leaflet mis-measures when the container (72vh) sizes after init, so
      // re-measure across a few frames, then fit the markers once settled.
      if (bounds.length > 0) {
        requestAnimationFrame(() =>
          mapRef.current?.fitBounds(bounds, { padding: [40, 40], maxZoom: 7 }),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [drawKey, markers, routeMap]);

  // The container is 72vh and settles after mount; Leaflet can latch a stale,
  // too-small size and paint only a strip of tiles. Nudge it back to full size
  // a few times over the first ~2s (reading the live map each tick, so it works
  // through React's dev double-mount), then stop.
  useEffect(() => {
    let n = 0;
    const id = window.setInterval(() => {
      mapRef.current?.invalidateSize();
      window.dispatchEvent(new Event("resize"));
      if (++n >= 8) window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  // Tear the map down on unmount.
  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  return (
    <div
      className={`overflow-hidden rounded-lg border border-border bg-graphite ${className ?? ""}`}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Live fleet
          </span>
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-positive opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-positive" />
          </span>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">
          {markers.length} on the road
        </span>
      </div>

      <div ref={containerRef} className="h-[48vh] min-h-[340px] w-full" />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2">
        {[
          { c: "#e0a800", l: "In transit" },
          { c: "#16a34a", l: "At drop-off" },
          { c: "#6b7280", l: "At pickup" },
          { c: "#dc2626", l: "Issue" },
        ].map((x) => (
          <span key={x.l} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="size-2 rounded-full" style={{ backgroundColor: x.c }} />
            {x.l}
          </span>
        ))}
      </div>
    </div>
  );
}
