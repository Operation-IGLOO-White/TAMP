import { useEffect, useRef, useState } from "react";
import { latestPosition, publishPosition, trackingSocketUrl, type VehiclePosition } from "@/fns/tracking";

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
          const message = JSON.parse(event.data as string) as { type?: string; position?: VehiclePosition };
          if (active && message.type === "position" && message.position) setPosition(message.position);
        } catch {
          // Ignore malformed messages and keep the stream connected.
        }
      };
      socket.onopen = () => {
        keepalive = window.setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send("ping"), 25000);
      };
      socket.onclose = () => {
        if (keepalive) window.clearInterval(keepalive);
        if (active) reconnect = window.setTimeout(connect, 3000);
      };
    };

    latestPosition(tripId).then((value) => active && value && setPosition(value)).catch(() => {});
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

export type LocationSharingState = "idle" | "requesting" | "sharing" | "denied" | "unavailable" | "error";

export function useDriverLocationSharing(tripIds: string[]) {
  const [state, setState] = useState<LocationSharingState>(tripIds.length ? "requesting" : "idle");
  const lastSent = useRef(0);
  const stableIds = tripIds.slice().sort().join("|");

  useEffect(() => {
    if (!stableIds) {
      setState("idle");
      return;
    }
    if (!("geolocation" in navigator)) {
      setState("unavailable");
      return;
    }
    const ids = stableIds.split("|");
    setState("requesting");
    const watchId = navigator.geolocation.watchPosition(
      (fix) => {
        const current = Date.now();
        if (current - lastSent.current < 5000) return;
        lastSent.current = current;
        const input = {
          lat: fix.coords.latitude,
          lng: fix.coords.longitude,
          accuracyM: fix.coords.accuracy,
          speedKph: fix.coords.speed == null ? null : fix.coords.speed * 3.6,
          heading: fix.coords.heading,
          recordedAt: new Date(fix.timestamp).toISOString(),
        };
        void Promise.all(ids.map((tripId) => publishPosition(tripId, input)))
          .then(() => setState("sharing"))
          .catch(() => setState("error"));
      },
      (error) => setState(error.code === error.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [stableIds]);

  return state;
}

