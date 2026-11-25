import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTamp } from "@/context/TampContext";
import { hasPermission } from "@/lib/access";
import { activeCharterLeg, charterJobsKey, CharterLocationContext,
  type CharterDriverJob, type SharingTarget } from "@/lib/charter-location";
import { trpc } from "@/lib/trpc";

export function CharterLocationProvider({ children }: { children: ReactNode }) {
  const { authParty, role } = useTamp();
  const enabled = role === "DRIVER" && Boolean(authParty?.id) && hasPermission(authParty, "trips.read");
  const jobs = useQuery({
    queryKey: charterJobsKey(authParty),
    queryFn: () => trpc.query<CharterDriverJob[]>("charter.driverJobs"),
    enabled,
    refetchInterval: (query) => query.state.data?.some(activeCharterLeg) ? 10_000 : 30_000,
  });
  const targets = enabled ? (jobs.data ?? []).flatMap((job) => {
    const leg = activeCharterLeg(job);
    return leg ? [{ bookingId: job.bookingId, vehicleId: job.vehicle.id, leg }] : [];
  }) : [];
  const targetKey = JSON.stringify(targets);
  const active = targets.length > 0;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string; attempt: number; state: "sharing" | "error"; message: string;
  } | null>(null);

  useEffect(() => {
    const activeTargets = JSON.parse(targetKey) as SharingTarget[];
    if (!activeTargets.length) return;
    let open = true;
    let sending = false;
    let lastSent = 0;
    const update = (state: "sharing" | "error", message = "") => {
      if (open) setResult({ key: targetKey, attempt, state, message });
    };
    if (!navigator.geolocation) {
      queueMicrotask(() => update("error", "This browser cannot access GPS."));
      return () => { open = false; };
    }

    function share(fix: GeolocationPosition) {
      if (!open || sending || Date.now() - lastSent < 10_000) return;
      lastSent = Date.now();
      if (!navigator.onLine) {
        update("error", "You’re offline. GPS updates will resume when you reconnect.");
        return;
      }
      sending = true;
      void Promise.allSettled(activeTargets.map((target) => trpc.mutation("charter.publishPosition", {
        ...target, lat: fix.coords.latitude, lng: fix.coords.longitude,
        accuracyM: fix.coords.accuracy, recordedAt: new Date(fix.timestamp).toISOString(),
      }))).then((updates) => {
        sending = false;
        if (updates.every((status) => status.status === "fulfilled")) update("sharing");
        else update("error", "GPS updates could not be shared. Keep TAMP open and check your connection.");
      });
    }

    const fail = (error: GeolocationPositionError) => update("error", error.code === error.PERMISSION_DENIED
      ? "Location access is blocked. Allow precise location for TAMP, then retry."
      : "Waiting for a GPS fix. Move into an open area or retry.");
    const options = { enableHighAccuracy: true, maximumAge: 4_000, timeout: 20_000 };
    const watch = navigator.geolocation.watchPosition(share, fail, options);
    // Keep a fresh update when the vehicle is stationary.
    const heartbeat = window.setInterval(() => navigator.geolocation.getCurrentPosition(share, fail, options), 30_000);
    return () => {
      open = false;
      navigator.geolocation.clearWatch(watch);
      window.clearInterval(heartbeat);
    };
  }, [targetKey, attempt]);

  const current = result?.key === targetKey && result.attempt === attempt ? result : null;
  return <CharterLocationContext.Provider value={{
    active, state: current?.state ?? "requesting", message: current?.message ?? "",
    retry: () => setAttempt((value) => value + 1),
  }}>{children}</CharterLocationContext.Provider>;
}
