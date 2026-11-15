export type NavigationProvider = "waze" | "google";
export type NavigationPoint = { lat: number; lng: number };

const coordinate = ({ lat, lng }: NavigationPoint) => `${lat},${lng}`;

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

function navigationUrl(
  provider: NavigationProvider,
  destination: NavigationPoint,
  origin?: NavigationPoint | null,
) {
  const destinationValue = coordinate(destination);

  if (provider === "waze") {
    const fallback = `https://www.waze.com/ul?ll=${encodeURIComponent(destinationValue)}&navigate=yes&utm_source=tamp`;
    if (!isAndroid()) return fallback;
    return `intent://www.waze.com/ul?ll=${encodeURIComponent(destinationValue)}&navigate=yes&utm_source=tamp#Intent;scheme=https;package=com.waze;S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
  }

  const params = new URLSearchParams({
    api: "1",
    destination: destinationValue,
    travelmode: "driving",
    dir_action: "navigate",
    utm_source: "tamp",
    utm_campaign: "driver_navigation",
  });
  if (origin) params.set("origin", coordinate(origin));
  const fallback = `https://www.google.com/maps/dir/?${params.toString()}`;
  if (!isAndroid()) return fallback;
  return `intent://maps.google.com/maps/dir/?${params.toString()}#Intent;scheme=https;package=com.google.android.apps.maps;S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}

/**
 * Opens the installed navigation app where the OS supports it and falls back
 * to the provider's mobile website. TAMP tracking remains in the original PWA
 * window so returning to it does not interrupt the active trip.
 */
export function openExternalNavigation(
  provider: NavigationProvider,
  destination: NavigationPoint,
  origin?: NavigationPoint | null,
) {
  const url = navigationUrl(provider, destination, origin);
  sessionStorage.setItem(
    "tamp.external-navigation",
    JSON.stringify({ provider, openedAt: Date.now() }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function consumeExternalNavigationReturn(): NavigationProvider | null {
  const stored = sessionStorage.getItem("tamp.external-navigation");
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as { provider?: NavigationProvider; openedAt?: number };
    if (!value.provider || !value.openedAt || Date.now() - value.openedAt > 12 * 60 * 60_000) {
      sessionStorage.removeItem("tamp.external-navigation");
      return null;
    }
    sessionStorage.removeItem("tamp.external-navigation");
    return value.provider;
  } catch {
    sessionStorage.removeItem("tamp.external-navigation");
    return null;
  }
}
