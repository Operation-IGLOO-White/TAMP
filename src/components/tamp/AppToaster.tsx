import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      closeButton
      duration={4500}
      visibleToasts={4}
      toastOptions={{
        classNames: {
          toast: "!border-border !bg-background !text-foreground !shadow-xl",
          title: "!text-sm !font-bold",
          description: "!text-xs !text-muted-foreground",
          success: "!border-l-4 !border-l-positive",
          error: "!border-l-4 !border-l-danger",
          warning: "!border-l-4 !border-l-signal",
          info: "!border-l-4 !border-l-signal",
          actionButton: "!bg-signal !text-signal-foreground !font-bold",
          cancelButton: "!bg-steel !text-foreground",
          closeButton: "!border-border !bg-background !text-foreground",
        },
      }}
    />
  );
}
