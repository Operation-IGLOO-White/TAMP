import { useCallback, useEffect, useRef, useState } from "react";
import {
  latestPosition,
  publishPosition,
  trackingSocketUrl,
  type VehiclePosition,
} from "@/fns/tracking";

export function useLiveTripPosition(tripId: string) {
  const [position, setPosition] = useState<VehiclePosition | null>(null);

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let reconnect: number | undefined;
    let keepalive: number | undefined;

    const connect = () => {
      if (!active) return;
      socket = new WebSocket(trackingSocketUrl(tripId));
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as {
            type?: string;
            position?: VehiclePosition;
          };
          if (active && message.type === "position" && message.position)
            setPosition(message.position);
        } catch {
          // Ignore malformed messages and keep the stream connected.
        }
      };
      socket.onopen = () => {
        keepalive = window.setInterval(
          () => socket?.readyState === WebSocket.OPEN && socket.send("ping"),
          25000,
        );
      };
      socket.onclose = () => {
        if (keepalive) window.clearInterval(keepalive);
        if (active) reconnect = window.setTimeout(connect, 3000);
      };
    };

    latestPosition(tripId)
      .then((value) => active && value && setPosition(value))
      .catch(() => {});
    connect();
    return () => {
      active = false;
      if (reconnect) window.clearTimeout(reconnect);
      if (keepalive) window.clearInterval(keepalive);
      socket?.close();
    };
  }, [tripId]);

  return position;
}

export type LocationSharingState =
  "idle" | "requesting" | "sharing" | "denied" | "unavailable" | "offline" | "error";

const GPS_PREFERENCE = "tamp:driver-gps-enabled";

export function useDriverLocationSharing(tripIds: string[]) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(GPS_PREFERENCE) === "true");
  const [state, setState] = useState<LocationSharingState>("idle");
  const [error, setError] = useState("");
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const lastSent = useRef(0);
  const stableIds = tripIds.slice().sort().join("|");

  const start = useCallback(() => {
    localStorage.setItem(GPS_PREFERENCE, "true");
    setError("");
    setEnabled(true);
  }, []);

  const stop = useCallback(() => {
    localStorage.setItem(GPS_PREFERENCE, "false");
    setEnabled(false);
    setState("idle");
  }, []);

  useEffect(() => {
    if (!stableIds || !enabled) {
      setState("idle");
      return;
    }
    if (!("geolocation" in navigator)) {
      setState("unavailable");
      return;
    }
    const ids = stableIds.split("|");
    setState("requesting");
    setError("");
    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 20_000,
    };
    const report = (fix: GeolocationPosition) => {
      const current = Date.now();
      if (current - lastSent.current < 8_000) return;
      lastSent.current = current;
      setAccuracyM(fix.coords.accuracy);
      if (!navigator.onLine) {
        setState("offline");
        setError("The device is offline. Tracking will resume when the connection returns.");
        return;
      }
      const input = {
        lat: fix.coords.latitude,
        lng: fix.coords.longitude,
        accuracyM: fix.coords.accuracy,
        speedKph: fix.coords.speed == null ? null : fix.coords.speed * 3.6,
        heading: fix.coords.heading,
        recordedAt: new Date(fix.timestamp).toISOString(),
      };
      void Promise.all(ids.map((tripId) => publishPosition(tripId, input)))
        .then(() => {
          setLastSentAt(input.recordedAt);
          setError("");
          setState("sharing");
        })
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : "The GPS update could not be sent.");
          setState(navigator.onLine ? "error" : "offline");
        });
    };
    const failed = (reason: GeolocationPositionError) => {
      if (reason.code === reason.PERMISSION_DENIED) {
        setState("denied");
        setError(
          "Location access is blocked. Allow precise location for this site, then try again.",
        );
      } else {
        setState("error");
        setError(
          reason.code === reason.TIMEOUT
            ? "A GPS fix took too long. Move into an open area and try again."
            : "The device could not determine its location.",
        );
      }
    };
    const watchId = navigator.geolocation.watchPosition(report, failed, options);
    // Some devices do not emit watch updates while stationary. Requesting a
    // fresh fix provides a heartbeat without fabricating a GPS timestamp.
    const heartbeat = window.setInterval(
      () => navigator.geolocation.getCurrentPosition(report, failed, options),
      30_000,
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(heartbeat);
    };
  }, [enabled, stableIds]);

  return { state, enabled, start, stop, error, lastSentAt, accuracyM };
}
