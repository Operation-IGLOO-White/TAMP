// Client wrapper over the tRPC `routes` router (server-side Google Routes API).
import { trpc } from "@/lib/trpc";
import type { RouteResult } from "tamp-backend/src/routers/routes";
import type { Place } from "tamp-backend/src/types";

export type { RouteResult };

export const computeRoute = (
  origin: Pick<Place, "lat" | "lng">,
  destination: Pick<Place, "lat" | "lng">,
): Promise<RouteResult | null> =>
  trpc.routes.compute.query({
    origin: { lat: origin.lat, lng: origin.lng },
    destination: { lat: destination.lat, lng: destination.lng },
  });
