/** Pulsing placeholder block. Use while content is being prepared. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-skeleton rounded bg-steel/50 ${className}`} aria-hidden="true" />;
}

/** Fills a chart panel with a faint bar-chart silhouette while it mounts. */
export function ChartSkeleton() {
  const bars = [55, 80, 40, 70, 60];
  return (
    <div className="flex h-full w-full items-end gap-3 px-2 pb-6" aria-hidden="true">
      {bars.map((h, i) => (
        <div
          key={i}
          className="animate-skeleton flex-1 rounded-t bg-steel/50"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}
