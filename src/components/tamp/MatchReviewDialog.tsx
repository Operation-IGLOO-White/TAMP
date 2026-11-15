import { AlertTriangle, Loader2, MapPin, RefreshCw, Truck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, Marker as MlMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { computeRoute } from "@/fns/routes";
import { prepareOfferCmd, type OfferProof } from "@/fns/commands";
import { formatMoney } from "@/lib/tamp-data";
import type { MatchOffer, RouteSnapshot } from "@/types/api";
import type { Load, TruckPosting } from "@/types/domain";

const STYLE =
  import.meta.env["VITE_MAP_STYLE_URL"] || "https://tiles.openfreemap.org/styles/liberty";

type RouteState = {
  deadhead: RouteSnapshot | null;
  journey: RouteSnapshot;
};

export function MatchReviewDialog({
  load,
  truck,
  actionLabel,
  onClose,
  onConfirm,
}: {
  load: Load;
  truck: TruckPosting;
  actionLabel: string;
  onClose: () => void;
  onConfirm: (proof: OfferProof) => Promise<void> | void;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<MlMarker[]>([]);
  const [routes, setRoutes] = useState<RouteState | null>(null);
  const [offer, setOffer] = useState<MatchOffer | null>(null);
  const [error, setError] = useState("");
  const [termsError, setTermsError] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [routeAttempt, setRouteAttempt] = useState(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setRoutes(null);
    setOffer(null);
    setAgreed(false);
    setError("");
    setTermsError("");
    Promise.all([
      computeRoute(truck.currentLocation, load.origin),
      computeRoute(
        load.origin,
        load.destination,
        load.stops?.slice(1, -1).map((stop) => stop.place) ?? [],
      ),
    ])
      .then(async ([deadhead, journey]) => {
        if (cancelled) return;
        if (!journey) throw new Error("No freight route was returned");
        // Render the computed route immediately. Preparing the bilateral offer
        // is a separate authorised operation and must not make a valid map
        // disappear when the match/account needs attention.
        setRoutes({ deadhead, journey });
        let prepared: MatchOffer;
        try {
          prepared = await prepareOfferCmd(
            load.id,
            truck.id,
            journey.routeToken,
            deadhead?.routeToken,
          );
        } catch (cause) {
          if (!cancelled) {
            const message = cause instanceof Error ? cause.message : "The match terms could not be prepared.";
            setTermsError(message);
            console.error("Match terms preparation failed", cause);
          }
          return;
        }
        if (cancelled) return;
        setOffer(prepared);
        setRoutes({
          deadhead: prepared.routeQuote.deadhead,
          journey: prepared.routeQuote.journey,
        });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        console.error("Match route calculation failed", cause);
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : "The route service did not respond. Retry the calculation or contact support if it continues.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [load, truck, routeAttempt]);

  const estimatedRoute = routes?.journey.provider === "estimated";

  useEffect(() => {
    if (!routes || !mapContainer.current) return;
    let disposed = false;
    let map: MlMap | null = null;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (disposed || !mapContainer.current) return;
      map = new maplibregl.Map({
        container: mapContainer.current,
        style: STYLE,
        center: [load.origin.lng, load.origin.lat],
        zoom: 6,
        attributionControl: {},
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.on("load", () => {
        if (!map || disposed) return;
        const addLine = (id: string, route: RouteSnapshot, color: string, dash?: number[]) => {
          map!.addSource(id, { type: "geojson", data: route.geometry });
          map!.addLayer({
            id,
            type: "line",
            source: id,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": color,
              "line-width": id === "journey" ? 6 : 4,
              "line-opacity": 0.9,
              ...(dash ? { "line-dasharray": dash } : {}),
            },
          });
        };
        if (routes.deadhead) addLine("deadhead", routes.deadhead, "#94a3b8", [2, 2]);
        addLine("journey", routes.journey, "#e0a800");

        const points: [number, number][] = [
          [truck.currentLocation.lng, truck.currentLocation.lat],
          [load.origin.lng, load.origin.lat],
          [load.destination.lng, load.destination.lat],
        ];
        const colors = ["#64748b", "#16a34a", "#dc2626"];
        points.forEach((point, index) => {
          const marker = new maplibregl.Marker({ color: colors[index]! })
            .setLngLat(point)
            .addTo(map!);
          markersRef.current.push(marker);
        });
        const bounds = new maplibregl.LngLatBounds(points[0], points[0]);
        routes.journey.geometry.coordinates.forEach((point) => bounds.extend(point));
        routes.deadhead?.geometry.coordinates.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds, { padding: 55, maxZoom: 12, duration: 0 });
      });
    })();
    return () => {
      disposed = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map?.remove();
      mapRef.current = null;
    };
  }, [routes, load, truck]);

  const confirm = async () => {
    if (!routes || !offer || !agreed || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm({ offerId: offer.id, revision: offer.revision, termsHash: offer.termsHash });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The offer could not be accepted.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-review-title"
        className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <h2 id="match-review-title" className="text-base font-black uppercase tracking-wide">
              Review route and terms
            </h2>
            <p className="text-xs text-muted-foreground">
              Both parties must agree to this load, truck, route and rate.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-steel/40">
            <X className="size-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[1.45fr_1fr]">
          <div className="relative min-h-[340px] border-b border-border lg:border-b-0 lg:border-r">
            {!routes && !error && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-graphite/80">
                <span className="flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" /> Calculating truck route…
                </span>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-graphite p-8 text-center">
                <div>
                  <AlertTriangle className="mx-auto mb-2 size-7 text-danger" />
                  <p className="text-sm font-semibold">{error}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    No acceptance has been recorded. You can safely retry.
                  </p>
                  <button
                    type="button"
                    onClick={() => setRouteAttempt((attempt) => attempt + 1)}
                    className="mx-auto mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-signal px-4 text-xs font-black uppercase text-signal-foreground hover:brightness-105"
                  >
                    <RefreshCw className="size-4" /> Retry route
                  </button>
                </div>
              </div>
            )}
            <div ref={mapContainer} className="h-full min-h-[340px] w-full" />
          </div>

          <div className="space-y-4 p-4">
            <div className="space-y-2 text-xs">
              <RouteRow label="Truck" value={truck.currentLocation.label} icon={<Truck />} />
              <RouteRow label="Pickup" value={load.origin.label} icon={<MapPin />} />
              <RouteRow label="Destination" value={load.destination.label} icon={<MapPin />} />
              {load.stops && load.stops.length > 2 && (
                <RouteRow
                  label="Stops"
                  value={`${load.stops.length} total · ${load.stops
                    .slice(1, -1)
                    .map((stop) => stop.place.label)
                    .join(" · ")}`}
                  icon={<MapPin />}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Metric
                label="Truck to pickup"
                value={routes?.deadhead ? `${routes.deadhead.distanceKm} km` : "—"}
              />
              <Metric
                label="Freight distance"
                value={routes ? `${routes.journey.distanceKm} km` : "—"}
              />
              <Metric
                label="Estimated duration"
                value={routes ? formatDuration(routes.journey.durationMin) : "—"}
              />
              <Metric
                label="Rate"
                value={load.targetRate ? formatMoney(load.targetRate) : "On file"}
              />
            </div>

            {offer && (
              <div className="flex justify-between rounded-lg border border-border px-3 py-2 font-mono text-[10px] text-muted-foreground">
                <span>Offer revision {offer.revision}</span>
                <span>Expires {new Date(offer.expiresAt).toLocaleTimeString("en-ZA")}</span>
              </div>
            )}

            {termsError && (
              <div className="rounded-lg border border-danger/35 bg-danger/10 p-3 text-xs">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-foreground">The route is ready, but acceptance is unavailable</div>
                    <p className="mt-1 text-muted-foreground">{termsError}</p>
                    <button
                      type="button"
                      onClick={() => setRouteAttempt((attempt) => attempt + 1)}
                      className="mt-2 inline-flex items-center gap-1.5 font-bold uppercase text-signal"
                    >
                      <RefreshCw className="size-3.5" /> Retry terms
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border bg-graphite/60 p-3 text-xs">
              <div className="font-bold">
                {truck.bodyType} · {truck.registration}
              </div>
              <div className="mt-1 text-muted-foreground">
                {(truck.payloadCapacityKg / 1000).toFixed(1)}t capacity ·{" "}
                {(load.weightKg / 1000).toFixed(1)}t load
              </div>
              <div className="mt-1 text-muted-foreground">
                Pickup {new Date(load.pickupWindow.from).toLocaleString("en-ZA")}
              </div>
            </div>

            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-[11px] leading-relaxed text-muted-foreground">
              {estimatedRoute ? (
                <>
                  <strong className="text-foreground">Estimated route:</strong> the live road-routing
                  service is temporarily unavailable. Distance and duration use a conservative
                  straight-line road estimate. Confirm the operational route before dispatch.
                </>
              ) : (
                <>
                  OpenStreetMap restrictions are used where available. The driver remains responsible
                  for road signs, clearances, weight limits and safe operation.
                </>
              )}
            </div>

            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
                className="mt-0.5 size-4 accent-[var(--signal)]"
              />
              <span>
                I agree to the displayed {estimatedRoute ? "estimated " : ""}route, vehicle, cargo,
                pickup window and rate.
              </span>
            </label>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-xs font-bold uppercase"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!routes || !offer || !agreed || submitting}
            className="inline-flex items-center gap-2 rounded-md bg-signal px-5 py-2 text-xs font-black uppercase text-signal-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            {actionLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

function RouteRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactElement;
}) {
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 text-signal [&>svg]:size-3.5">{icon}</span>
      <div>
        <span className="font-bold">{label}:</span>{" "}
        <span className="text-muted-foreground">{value}</span>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-bold">{value}</div>
    </div>
  );
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}
