import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigation, X } from "lucide-react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { computeRoute } from "@/fns/routes";
import { openExternalNavigation, type NavigationPoint } from "@/lib/external-navigation";
import type { Place } from "@/types/domain";

const button = "min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-semibold";

export function CharterLegMap({ target, onClose }: { target: Place; onClose: () => void }) {
  const element = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [position, setPosition] = useState<NavigationPoint | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [locating, setLocating] = useState(true);
  const [request, setRequest] = useState(0);
  const [tileError, setTileError] = useState(false);
  const { lat: targetLat, lng: targetLng } = target;

  useEffect(() => {
    let active = true;
    if (navigator.geolocation) {
      const watch = navigator.geolocation.watchPosition(({ coords }) => {
        if (!active) return;
        setLocating(false);
        setLocationError(false);
        setPosition({ lat: coords.latitude, lng: coords.longitude });
      }, () => {
        if (!active) return;
        setLocating(false);
        setLocationError(true);
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
      return () => { active = false; navigator.geolocation.clearWatch(watch); };
    } else {
      queueMicrotask(() => {
        if (active) { setLocationError(true); setLocating(false); }
      });
    }
    return () => { active = false; };
  }, [request]);

  const route = useQuery({
    queryKey: ["charter-navigation", position ? Math.round(position.lat * 1000) : null, position ? Math.round(position.lng * 1000) : null, targetLat, targetLng],
    queryFn: () => computeRoute(position!, { lat: targetLat, lng: targetLng }),
    enabled: Boolean(position),
    retry: false,
    staleTime: 60_000,
  });
  const road = route.data?.provider === "estimated" ? null : route.data;
  useEffect(() => {
    let active = true;
    let instance: LeafletMap | undefined;
    void import("leaflet").then(({ default: L }) => {
      if (!active || !element.current) return;
      instance = L.map(element.current, { scrollWheelZoom: false }).setView([targetLat, targetLng], 14);
      L.tileLayer("https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors © CARTO",
      }).on("tileerror", () => {
        if (active) setTileError(true);
      }).addTo(instance);
      setMap(instance);
    }).catch(() => { if (active) setTileError(true); });
    return () => {
      active = false;
      instance?.remove();
    };
  }, [targetLat, targetLng]);

  useEffect(() => {
    if (!map) return;
    let active = true;
    let layer: import("leaflet").LayerGroup | undefined;
    void import("leaflet").then(({ default: L }) => {
      if (!active) return;
      layer = L.layerGroup().addTo(map);
      const destination: [number, number] = [targetLat, targetLng];
      L.circleMarker(destination, { radius: 8, color: "#252525", fillColor: "#efb200", fillOpacity: 1 }).addTo(layer);
      if (position) {
        const origin: [number, number] = [position.lat, position.lng];
        L.circleMarker(origin, { radius: 7, color: "#fff", fillColor: "#2563eb", fillOpacity: 1 }).addTo(layer);
        if (road?.geometry.coordinates.length) {
          const line = L.polyline(road.geometry.coordinates.map(([lng, lat]) => [lat, lng]), {
            color: "#efb200", weight: 5,
          }).addTo(layer);
          map.fitBounds(line.getBounds().extend(origin).extend(destination), { padding: [24, 24], maxZoom: 16 });
        } else {
          map.fitBounds(L.latLngBounds(origin, destination), { padding: [24, 24], maxZoom: 16 });
        }
      }
    }).catch(() => { if (active) setTileError(true); });
    return () => { active = false; layer?.remove(); };
  }, [map, position, road, targetLat, targetLng]);

  return <section className="grid gap-2 rounded-xl border border-border p-2" aria-label="Charter navigation">
    <div className="flex items-start justify-between gap-2">
      <p className="flex gap-2 break-words text-sm font-semibold"><Navigation className="mt-0.5 size-4 shrink-0 text-signal" /> {target.label}</p>
      <button type="button" className={button} onClick={onClose} aria-label="Close route map"><X className="size-4" /></button>
    </div>
    <div ref={element} className="isolate h-[45svh] min-h-64 overflow-hidden rounded-lg bg-muted" aria-label="Map to the next checkpoint" />
    <div className="text-sm text-muted-foreground" aria-live="polite">
      {locating ? "Finding your current position…" : locationError ? "Current position unavailable. Check your location permission or use a navigation app."
        : route.isFetching ? "Calculating road route…" : road ? `${road.distanceKm} km · about ${road.durationMin} min`
        : "Road directions are unavailable. Open a navigation app for directions."}
      {tileError && <p>Some map tiles could not be loaded.</p>}
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={locating} onClick={() => { setLocating(true); setRequest(request + 1); }}>Refresh location</button>
      <button type="button" className={button} onClick={() => openExternalNavigation("google", target, position)}>Google Maps</button>
      <button type="button" className={button} onClick={() => openExternalNavigation("waze", target)}>Waze</button>
    </div>
  </section>;
}
