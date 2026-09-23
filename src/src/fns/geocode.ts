// Client wrappers over the tRPC `geocode` router (server-side Google Places).
import { trpc } from "@/lib/trpc";
import type { Prediction } from "tamp-backend/src/routers/geocode";
import type { Place } from "tamp-backend/src/types";

export type { Prediction };

export const geocodeAutocomplete = (query: string, sessionToken?: string): Promise<Prediction[]> =>
  trpc.geocode.autocomplete.query({ query, ...(sessionToken ? { sessionToken } : {}) });

export const geocodeDetails = (placeId: string, sessionToken?: string): Promise<Place> =>
  trpc.geocode.details.query({ placeId, ...(sessionToken ? { sessionToken } : {}) });
