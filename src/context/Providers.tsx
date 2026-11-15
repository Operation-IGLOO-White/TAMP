import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppToaster } from "@/components/tamp/AppToaster";
import { TopNav } from "@/components/tamp/TopNav";
import { PwaManager } from "@/components/tamp/PwaManager";
import { TampProvider } from "@/context/TampContext";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const onError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      if (message) toast.error("Changes were not saved", { description: message });
    };
    window.addEventListener("tamp:save-error", onError);
    return () => window.removeEventListener("tamp:save-error", onError);
  }, []);
  const [queryClient] = useState(() => new QueryClient());
  const { pathname } = useLocation();
  const showNav = pathname !== "/" && pathname !== "/403" && !pathname.startsWith("/track");

  return (
    <QueryClientProvider client={queryClient}>
      <TampProvider>
        {showNav && <TopNav />}
        <RouteChangeIndicator />
        {children}
        <PwaManager />
        <AppToaster />
      </TampProvider>
    </QueryClientProvider>
  );
}

/** Gives every navigation immediate feedback, including already-cached routes. */
function RouteChangeIndicator() {
  const { pathname, search } = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 420);
    return () => window.clearTimeout(timer);
  }, [pathname, search]);

  return (
    <div
      aria-hidden="true"
      className={`route-change-indicator ${visible ? "route-change-indicator--visible" : ""}`}
    >
      <span />
    </div>
  );
}
