// Client wrapper over the tRPC `routes` router (server-side Google Routes API).
import { trpc } from "@/lib/trpc";
import type { RouteResult } from "@/types/api";
import type { Place } from "@/types/domain";

export type { RouteResult };

export const computeRoute = (
  origin: Pick<Place, "lat" | "lng">,
  destination: Pick<Place, "lat" | "lng">,
): Promise<RouteResult | null> =>
  trpc.query("routes.compute", {
    origin: { lat: origin.lat, lng: origin.lng },
    destination: { lat: destination.lat, lng: destination.lng },
  });
