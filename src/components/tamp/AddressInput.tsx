// Address field backed by Photon/OpenStreetMap through the backend. Type any South African address; the
// dropdown shows live predictions, and picking one resolves to a Place with
// accurate coordinates + province used by matching, pricing and the map.


import { Loader2, MapPin, SearchX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { geocodeAutocomplete, geocodeDetails, type Prediction } from "@/fns/geocode";
import type { Place } from "@/types/domain";

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
  const [searched, setSearched] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  // Keep the input text in sync when the selected value changes externally.
  useEffect(() => {
    setQuery(value?.label ?? "");
  }, [value?.label]);

  // Debounced predictions from the server geocoder.
  useEffect(() => {
    if (query.trim().length < 2 || query === value?.label) {
      setResults([]);
      setLoading(false);
      setSearched(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const preds = await geocodeAutocomplete(query);
        if (cancelled) return;
        setResults(preds);
        setOpen(true);
        setSearched(true);
        setActiveIndex(-1);
      } catch {
        if (!cancelled) {
          setResults([]);
          setSearched(true);
          setOpen(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, value?.label]);

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
      const place = p.place ?? (await geocodeDetails(p.id));
      onSelect(place);
      setQuery(place.label);
    } catch {
      /* leave the typed text if details fail */
    } finally {
      setLoading(false);
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
          onKeyDown={(event) => {
            if (!open || results.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => Math.min(results.length - 1, index + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(0, index - 1));
            } else if (event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault();
              void pick(results[activeIndex]!);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={hint}
          className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-8 text-sm text-foreground outline-none focus:border-signal"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && (results.length > 0 || (searched && !loading)) && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-background py-1 shadow-xl">
          {results.length === 0 && (
            <li className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <SearchX className="size-4" /> No South African address found. Try a street and suburb.
            </li>
          )}
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => pick(p)}
                onMouseEnter={() => setActiveIndex(results.indexOf(p))}
                className={`flex w-full items-start gap-2 px-3 py-2.5 text-left ${activeIndex === results.indexOf(p) ? "bg-signal/10" : "hover:bg-steel/40"}`}
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-signal" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold leading-snug">{p.primary}</span>
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
