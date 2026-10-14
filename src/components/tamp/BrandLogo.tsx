type BrandLogoProps = {
  className?: string;
  compact?: boolean;
  priority?: boolean;
};

/** Primary TAMP brand lockup. The white plate preserves contrast in both themes. */
export function BrandLogo({ className = "", compact = false, priority = false }: BrandLogoProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center overflow-hidden bg-white shadow-[0_1px_0_rgba(255,255,255,.18),0_8px_24px_rgba(0,0,0,.12)] ${
        compact ? "size-9 justify-center rounded-xl p-1" : "h-10 rounded-xl px-2.5 py-1.5"
      } ${className}`}
    >
      <img
        src="/tamp-logo.png"
        alt="TAMP ON"
        className={`block max-w-none object-contain ${compact ? "h-7 w-[68px] object-right" : "h-full w-auto"}`}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
    </span>
  );
}
