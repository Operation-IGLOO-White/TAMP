type BrandLogoProps = {
  className?: string;
  compact?: boolean;
  priority?: boolean;
};

/** Primary TAMP brand lockup. */
export function BrandLogo({ className = "", compact = false, priority = false }: BrandLogoProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center ${
        compact ? "size-11 justify-center overflow-hidden" : "h-12"
      } ${className}`}
    >
      <img
        src="/tamp-logo.png"
        alt="TAMP ON"
        className={`block max-w-none object-contain ${compact ? "h-10 w-[88px] object-right" : "h-full w-auto"}`}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
    </span>
  );
}
