import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

/**
 * Standard role-page layout: collapsible left rail + a scrollable content
 * column. Pages provide their own sticky header and body inside `children`.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <Sidebar />
      <section className="flex-1 min-w-0 overflow-y-auto">{children}</section>
    </div>
  );
}

/** Sticky page header used across role pages. */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background/90 px-6 py-4 backdrop-blur-md">
      <h1 className="text-base font-bold tracking-tight">{title}</h1>
      {actions}
    </div>
  );
}
