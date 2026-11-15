import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { DriverBottomNav } from "./DriverBottomNav";
import { useTamp } from "@/context/TampContext";

/**
 * Standard role-page layout: collapsible left rail + a scrollable content
 * column. Pages provide their own sticky header and body inside `children`.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const { role } = useTamp();
  const contentRef = useRef<HTMLElement>(null);

  // Each module starts at the top. Keeping the scroll inside the content rail
  // avoids the browser briefly restoring the previous module's scroll offset.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname, search]);

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background">
      <Sidebar />
      <section
        ref={contentRef}
        className={`min-w-0 flex-1 overflow-y-auto overscroll-contain ${role === "DRIVER" ? "pb-24 md:pb-0" : ""}`}
      >
        <div key={`${pathname}${search}`} className="route-page-enter min-h-full">
          {children}
        </div>
      </section>
      {role === "DRIVER" && <DriverBottomNav />}
    </div>
  );
}

/** Sticky page header used across role pages. */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-3 shadow-[0_1px_12px_rgb(10_12_18_/_0.04)] backdrop-blur-md sm:gap-4 sm:px-6 sm:py-4">
      <h1 className="min-w-0 text-sm font-bold leading-tight tracking-tight sm:text-base">{title}</h1>
      <div className="shrink-0">{actions}</div>
    </div>
  );
}
