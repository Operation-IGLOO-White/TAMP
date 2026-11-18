import { APP_VERSION_LABEL } from "@/lib/version";

export function AppVersion({ dark = false }: { dark?: boolean }) {
  return (
    <span
      title={`TAMP ${APP_VERSION_LABEL}`}
      aria-label={`TAMP version ${APP_VERSION_LABEL}`}
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-1 font-mono text-[9px] font-bold tracking-wide ${
        dark
          ? "border-white/15 bg-white/[0.055] text-white/55"
          : "border-border bg-steel/30 text-muted-foreground"
      }`}
    >
      {APP_VERSION_LABEL}
    </span>
  );
}
