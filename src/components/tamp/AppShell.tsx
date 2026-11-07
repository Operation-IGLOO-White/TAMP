import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

/**
 * Standard role-page layout: collapsible left rail + a scrollable content
 * column. Pages provide their own sticky header and body inside `children`.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background">
      <Sidebar />
      <section className="flex-1 min-w-0 overflow-y-auto">{children}</section>
    </div>
  );
}

/** Sticky page header used across role pages. */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md sm:gap-4 sm:px-6 sm:py-4">
      <h1 className="min-w-0 text-sm font-bold leading-tight tracking-tight sm:text-base">{title}</h1>
      <div className="shrink-0">{actions}</div>
    </div>
  );
}
