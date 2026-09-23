"use client";

// Client providers + app chrome. Mirrors the old TanStack __root: React Query,
// the in-memory Tamp store, and the TopNav shown on every page except the
// public landing / access / tracking screens.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { TopNav } from "@/components/tamp/TopNav";
import { TampProvider } from "@/lib/tamp-store";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const pathname = usePathname();
  const showNav = pathname !== "/" && pathname !== "/403" && !pathname.startsWith("/track");

  // TAMP is a client-driven SPA: its state comes from localStorage and its
  // views depend on the current time (live ETAs, "x days ago"), so the markup
  // is only stable once mounted in the browser. Render a neutral shell during
  // SSR / the first client paint so hydration matches, then reveal the app.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="min-h-screen bg-background" aria-hidden suppressHydrationWarning />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TampProvider>
        {showNav && <TopNav />}
        {children}
      </TampProvider>
    </QueryClientProvider>
  );
}
