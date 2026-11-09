import { Download, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaManager() {
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onOnline = () => { setOnline(true); toast.success("Connection restored"); };
    const onOffline = () => setOnline(false);
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onInstall);

    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      void navigator.serviceWorker.register("/sw.js").then((registration) => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              toast("A TAMP update is ready", {
                action: { label: "Update", onClick: () => { worker.postMessage({ type: "SKIP_WAITING" }); window.location.reload(); } },
                duration: 20_000,
              });
            }
          });
        });
      });
    }
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, []);

  return <>
    {!online && <div role="status" className="fixed inset-x-3 top-20 z-[1200] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-signal/40 bg-background/95 px-4 py-3 shadow-2xl backdrop-blur"><WifiOff className="size-5 shrink-0 text-signal" /><div><div className="text-xs font-black">Offline mode</div><div className="text-[10px] text-muted-foreground">You can review cached information. Reconnect before saving changes.</div></div></div>}
    {installPrompt && !dismissed && online && <div className="fixed bottom-4 left-4 z-[1100] flex max-w-sm items-center gap-3 rounded-2xl border border-border bg-background/95 p-3 shadow-2xl backdrop-blur"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-signal text-signal-foreground"><Download className="size-5" /></span><div className="min-w-0 flex-1"><div className="text-xs font-black">Install TAMP</div><div className="text-[10px] text-muted-foreground">Faster access and an app-like workspace.</div></div><button onClick={() => { void installPrompt.prompt().then(() => installPrompt.userChoice).then(() => setInstallPrompt(null)); }} className="rounded-lg bg-signal px-3 py-2 text-[10px] font-black text-signal-foreground">Install</button><button onClick={() => setDismissed(true)} aria-label="Dismiss install prompt" className="p-1 text-muted-foreground"><X className="size-4" /></button></div>}
  </>;
}
