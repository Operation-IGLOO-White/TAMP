import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { TopNav } from "@/components/tamp/TopNav";
import { TampProvider } from "@/context/TampContext";

export function Providers({ children }: { children: ReactNode }) {
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    const onError = (event: Event) => setSaveError((event as CustomEvent<string>).detail);
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
        {saveError && <div role="alert" className="border-b border-danger bg-background p-3 text-sm text-danger">Changes were not saved: {saveError}. <button onClick={() => window.location.reload()} className="underline">Reload server data</button></div>}
        {children}
      </TampProvider>
    </QueryClientProvider>
  );
}
