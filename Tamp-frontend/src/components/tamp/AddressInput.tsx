// Address field backed by a real map API (Google Places, proxied server-side
// so the key never reaches the browser). Type any South African address; the
// dropdown shows live predictions, and picking one resolves to a Place with
// accurate coordinates + province used by matching, pricing and the map.

"use client";

import { Loader2, MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { geocodeAutocomplete, geocodeDetails, type Prediction } from "@/fns/geocode";
import type { Place } from "@/lib/tamp-types";

export function AddressInput({
  value,
  onSelect,
  placeholder,
}: {
  value: Place | null;
  onSelect: (place: Place) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [results, setResults] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Google bills autocomplete + details as one session when they share a token.
  const [sessionToken, setSessionToken] = useState(() => crypto.randomUUID());

  // Keep the input text in sync when the selected value changes externally.
  useEffect(() => {
    setQuery(value?.label ?? "");
  }, [value?.label]);

  // Debounced predictions from the server geocoder.
  useEffect(() => {
    if (query.trim().length < 3 || query === value?.label) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const preds = await geocodeAutocomplete(query, sessionToken);
        if (cancelled) return;
        setResults(preds);
        setOpen(true);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, value?.label, sessionToken]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = async (p: Prediction) => {
    setOpen(false);
    setQuery(p.primary);
    try {
      // Nominatim predictions already carry the resolved place; Google needs a
      // details lookup keyed by placeId (same session token to close billing).
      const place = p.place ?? (await geocodeDetails(p.id, sessionToken));
      onSelect(place);
      setQuery(place.label);
    } catch {
      /* leave the typed text if details fail */
    } finally {
      // A pick ends the Google session — rotate the token for the next one.
      setSessionToken(crypto.randomUUID());
    }
  };

  const hint = useMemo(() => placeholder ?? "Start typing an address…", [placeholder]);

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={hint}
          className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-8 text-sm text-foreground outline-none focus:border-signal"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-graphite shadow-lg">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => pick(p)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-steel/40"
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-signal" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">{p.primary}</span>
                  {p.secondary && (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {p.secondary}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
