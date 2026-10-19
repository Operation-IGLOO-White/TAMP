import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppToaster } from "@/components/tamp/AppToaster";
import { TopNav } from "@/components/tamp/TopNav";
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
        {children}
        <AppToaster />
      </TampProvider>
    </QueryClientProvider>
  );
}
