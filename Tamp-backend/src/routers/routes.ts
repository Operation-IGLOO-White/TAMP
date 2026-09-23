// Routing proxy — Google Routes API (computeRoutes), key kept server-side.
// Returns the real driving polyline + road distance + duration for a lane.
// Results are cached in-memory by coordinate pair (lanes are stable, so this
// avoids repeat billing). Returns null when no key is set or the call fails, so
// callers fall back to the straight-line estimate.
import { z } from "zod";
import { publicProcedure, router } from "../trpc";

export interface RouteResult {
  encodedPolyline: string; // Google-encoded road geometry
  distanceKm: number; // real driving distance
  durationMin: number; // real driving time
}

const KEY = () => process.env["GOOGLE_MAPS_API_KEY"];
const cache = new Map<string, RouteResult | null>();

const coord = z.object({ lat: z.number(), lng: z.number() });

async function computeRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<RouteResult | null> {
  const key = `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}|${destination.lat.toFixed(
    5,
  )},${destination.lng.toFixed(5)}`;
  if (cache.has(key)) return cache.get(key)!;
  if (!KEY()) {
    cache.set(key, null);
    return null;
  }

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
    if (!res.ok) throw new Error(`Routes ${res.status}`);
    const data = (await res.json()) as {
      routes?: {
        distanceMeters?: number;
        duration?: string;
        polyline?: { encodedPolyline?: string };
      }[];
    };
    const r = data.routes?.[0];
    if (!r?.polyline?.encodedPolyline || r.distanceMeters == null) {
      cache.set(key, null);
      return null;
    }
    const result: RouteResult = {
      encodedPolyline: r.polyline.encodedPolyline,
      distanceKm: Math.round(r.distanceMeters / 1000),
      durationMin: Math.round(parseInt(r.duration ?? "0", 10) / 60),
    };
    cache.set(key, result);
    return result;
  } catch {
    cache.set(key, null);
    return null;
  }
}

export const routesRouter = router({
  compute: publicProcedure
    .input(z.object({ origin: coord, destination: coord }))
    .query(({ input }): Promise<RouteResult | null> => computeRoute(input.origin, input.destination)),
});
