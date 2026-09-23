// Routing proxy — real driving polyline + road distance + duration for a lane.
// Uses Google Routes API when a working key is configured, and falls back to
// the free OSRM public router whenever Google is unavailable (no key, billing
// disabled, error). Either way the caller gets a real road route, so it only
// drops to a straight-line estimate if BOTH providers fail. Successful results
// are cached in-memory by coordinate pair (lanes are stable).
import { z } from "zod";
import { publicProcedure, router } from "../trpc";

export interface RouteResult {
  encodedPolyline: string; // encoded road geometry (precision 5, Google-compatible)
  distanceKm: number; // real driving distance
  durationMin: number; // real driving time
}

const KEY = () => process.env["GOOGLE_MAPS_API_KEY"];
const cache = new Map<string, RouteResult>();

const coord = z.object({ lat: z.number(), lng: z.number() });

type LatLng = { lat: number; lng: number };

// Google Routes API (billed). Returns null on any failure so we can fall back.
async function googleRoute(origin: LatLng, destination: LatLng): Promise<RouteResult | null> {
  if (!KEY()) return null;
  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": KEY()!,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: {
          location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        polylineEncoding: "ENCODED_POLYLINE",
        units: "METRIC",
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[];
    };
    const r = data.routes?.[0];
    if (!r?.polyline?.encodedPolyline || r.distanceMeters == null) return null;
    return {
      encodedPolyline: r.polyline.encodedPolyline,
      distanceKm: Math.round(r.distanceMeters / 1000),
      durationMin: Math.round(parseInt(r.duration ?? "0", 10) / 60),
    };
  } catch {
    return null;
  }
}

// OSRM public demo router (free, no key). Its `polyline` geometry is precision-5
// encoded — the same format the client already decodes.
async function osrmRoute(origin: LatLng, destination: LatLng): Promise<RouteResult | null> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
      `?overview=full&geometries=polyline`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: { geometry?: string; distance?: number; duration?: number }[];
    };
    const r = data.routes?.[0];
    if (!r?.geometry || r.distance == null) return null;
    return {
      encodedPolyline: r.geometry,
      distanceKm: Math.round(r.distance / 1000),
      durationMin: Math.round((r.duration ?? 0) / 60),
    };
  } catch {
    return null;
  }
}

async function computeRoute(origin: LatLng, destination: LatLng): Promise<RouteResult | null> {
  const key = `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}|${destination.lat.toFixed(
    5,
  )},${destination.lng.toFixed(5)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  // Prefer Google when it's actually working; otherwise use free OSRM so routes
  // still draw. Only cache real results (a transient failure should retry).
  const result = (await googleRoute(origin, destination)) ?? (await osrmRoute(origin, destination));
  if (result) cache.set(key, result);
  return result;
}

export const routesRouter = router({
  compute: publicProcedure
    .input(z.object({ origin: coord, destination: coord }))
    .query(({ input }): Promise<RouteResult | null> => computeRoute(input.origin, input.destination)),
});
