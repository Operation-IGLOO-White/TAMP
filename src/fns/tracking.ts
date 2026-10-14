export interface VehiclePosition {
  tripId: string;
  truckId: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  speedKph: number | null;
  heading: number | null;
  recordedAt: string;
  receivedAt: string;
}

const apiRoot = (import.meta.env["VITE_API_URL"] || "/api/v1").replace(/\/$/, "");

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Tracking request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function publishPosition(
  tripId: string,
  input: Omit<VehiclePosition, "tripId" | "truckId" | "receivedAt">,
) {
  return fetch(`${apiRoot}/tracking/trips/${encodeURIComponent(tripId)}/positions`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-TAMP-Request": "1" },
    body: JSON.stringify(input),
  }).then(responseJson<VehiclePosition>);
}

export function latestPosition(tripId: string) {
  return fetch(`${apiRoot}/tracking/trips/${encodeURIComponent(tripId)}/positions/latest`, {
    credentials: "include",
    headers: { "X-TAMP-Request": "1" },
  }).then(responseJson<VehiclePosition | null>);
}

export function trackingSocketUrl(tripId: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${apiRoot}/tracking/trips/${encodeURIComponent(tripId)}/live`;
}

