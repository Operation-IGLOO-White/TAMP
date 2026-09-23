import { useEffect, useState, type ReactNode } from "react";
import { ChartSkeleton } from "./Skeleton";

/**
 * Renders children only after mount — for DOM-measuring libs like recharts.
 * Until then it shows a chart skeleton (override via `fallback`), so panels
 * never flash empty on first paint or slow hydration.
 */
export function ClientOnly({
  children,
  fallback = <ChartSkeleton />,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback}</>;
}

// Shared chart palette — CSS vars keep charts theme-aware in light and dark.
export const CHART = {
  signal: "var(--signal)",
  steel: "var(--steel)",
  positive: "var(--positive)",
  danger: "var(--danger)",
  muted: "var(--muted-foreground)",
  foreground: "var(--foreground)",
  border: "var(--border)",
};

export const chartTooltipStyle = {
  background: "var(--graphite)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)",
};
