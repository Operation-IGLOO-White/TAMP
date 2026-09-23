// Geocoding proxy — keeps the Google Places API key server-side. Uses the
// Places API (New): Autocomplete for predictions, Place Details to resolve a
// pick into coordinates + province. Falls back to OpenStreetMap Nominatim when
// no GOOGLE_MAPS_API_KEY is configured, so the address fields always work.
import { z } from "zod";
import type { Place } from "@/lib/tamp-types";
import { publicProcedure, router } from "../trpc";

const PROVINCE_CODE: Record<string, string> = {
  Gauteng: "GP",
  "KwaZulu-Natal": "KZN",
  "Western Cape": "WC",
  "Eastern Cape": "EC",
  "Free State": "FS",
  "North West": "NW",
  Limpopo: "LP",
  Mpumalanga: "MP",
  "Northern Cape": "NC",
};

const provinceCode = (state?: string) => (state ? (PROVINCE_CODE[state] ?? "") : "");

export interface Prediction {
  id: string; // Google placeId, or a Nominatim-encoded id
  primary: string; // main line (e.g. street / place name)
  secondary: string; // context line (e.g. suburb, city, province)
  place: Place | null; // pre-resolved (Nominatim); null for Google → needs details()
}

const KEY = () => process.env["GOOGLE_MAPS_API_KEY"];

// ---- Google Places (New) ---------------------------------------------------

interface GAutocomplete {
  suggestions?: {
    placePrediction?: {
      placeId: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }[];
}

interface GDetails {
  location?: { latitude: number; longitude: number };
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: { longText?: string; types?: string[] }[];
}

async function googleAutocomplete(query: string, sessionToken?: string): Promise<Prediction[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY()!,
    },
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ["za"],
      ...(sessionToken ? { sessionToken } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Places autocomplete ${res.status}`);
  const data = (await res.json()) as GAutocomplete;
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      id: p.placeId,
      primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondary: p.structuredFormat?.secondaryText?.text ?? "",
      place: null,
    }));
}

async function googleDetails(placeId: string, sessionToken?: string): Promise<Place> {
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": KEY()!,
      "X-Goog-FieldMask": "location,displayName,formattedAddress,addressComponents",
    },
  });
  if (!res.ok) throw new Error(`Place details ${res.status}`);
  const d = (await res.json()) as GDetails;
  const state = d.addressComponents?.find((c) =>
    c.types?.includes("administrative_area_level_1"),
  )?.longText;
  return {
    label: d.displayName?.text ?? d.formattedAddress?.split(",")[0] ?? "",
    province: provinceCode(state),
    lat: d.location?.latitude ?? 0,
    lng: d.location?.longitude ?? 0,
  };
}

// ---- Nominatim fallback ----------------------------------------------------

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: { state?: string; city?: string; town?: string; village?: string; suburb?: string };
}

async function nominatimAutocomplete(query: string): Promise<Prediction[]> {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=za&limit=6&q=" +
    encodeURIComponent(query);
  const res = await fetch(url, { headers: { "User-Agent": "TAMP/1.0 (demo)" } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = (await res.json()) as NominatimResult[];
  return data.map((r, i) => {
    const a = r.address ?? {};
    const label = a.city ?? a.town ?? a.village ?? a.suburb ?? r.display_name.split(",")[0]!;
    return {
      id: `osm:${i}`,
      primary: label,
      secondary: r.display_name,
      place: {
        label,
        province: provinceCode(a.state),
        lat: Number(r.lat),
        lng: Number(r.lon),
      },
    };
  });
}

// ---- Router ----------------------------------------------------------------

export const geocodeRouter = router({
  autocomplete: publicProcedure
    .input(z.object({ query: z.string().min(1), sessionToken: z.string().optional() }))
    .query(async ({ input }): Promise<Prediction[]> => {
      if (input.query.trim().length < 3) return [];
      if (KEY()) return googleAutocomplete(input.query, input.sessionToken);
      return nominatimAutocomplete(input.query);
    }),

  details: publicProcedure
    .input(z.object({ placeId: z.string().min(1), sessionToken: z.string().optional() }))
    .query(async ({ input }): Promise<Place> => {
      if (!KEY()) throw new Error("no geocoding key");
      return googleDetails(input.placeId, input.sessionToken);
    }),
});
