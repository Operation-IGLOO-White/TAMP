type BrandLogoProps = {
  className?: string;
  compact?: boolean;
  priority?: boolean;
  darkSurface?: boolean;
};

/** Primary TAMP brand lockup. */
export function BrandLogo({
  className = "",
  compact = false,
  priority = false,
  darkSurface = false,
}: BrandLogoProps) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center ${
        compact ? "size-11 justify-center overflow-hidden" : "h-12"
      } ${darkSurface ? "brand-logo-dark-surface" : ""} ${className}`}
    >
      <img
        src="/tamp-logo.png"
        alt="TAMP ON"
        className={`brand-logo-base block max-w-none object-contain ${compact ? "h-10 w-[88px] object-right" : "h-full w-auto"}`}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
      <img
        src="/tamp-logo.png"
        alt=""
        aria-hidden
        className={`brand-logo-color pointer-events-none absolute inset-0 max-w-none object-contain ${compact ? "h-10 w-[88px] object-right" : "h-full w-auto"}`}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
    </span>
  );
}
