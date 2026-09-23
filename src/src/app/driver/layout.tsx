import type { ReactNode } from "react";
import { RequireRole } from "@/components/tamp/RequireRole";

export default function DriverLayout({ children }: { children: ReactNode }) {
  // Owner-drivers (TRANSPORTER) reach My Jobs from their fleet; individual
  // drivers (DRIVER) sign in straight to this, their whole workspace.
  return <RequireRole role={["TRANSPORTER", "DRIVER"]}>{children}</RequireRole>;
}
