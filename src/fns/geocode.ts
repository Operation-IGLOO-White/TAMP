// Client wrappers over the tRPC geocode router (server-side Photon/OpenStreetMap).
import { trpc } from "@/lib/trpc";
import type { Prediction } from "@/types/api";
import type { Place } from "@/types/domain";

export type { Prediction };

export const geocodeAutocomplete = (query: string, sessionToken?: string): Promise<Prediction[]> =>
  trpc.query("geocode.autocomplete", { query, ...(sessionToken ? { sessionToken } : {}) });

export const geocodeDetails = (placeId: string, sessionToken?: string): Promise<Place> =>
  trpc.query("geocode.details", { placeId, ...(sessionToken ? { sessionToken } : {}) });
