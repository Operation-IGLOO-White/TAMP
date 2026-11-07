import type { ComponentType, ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <div
      className={`app-surface p-4 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        accent ? "border-signal/40 bg-signal/10" : "border-border bg-graphite"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {Icon && <Icon className="size-4 text-muted-foreground" />}
      </div>
      <div className="mt-2 text-2xl font-bold font-mono tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`app-surface overflow-hidden ${className}`}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}
