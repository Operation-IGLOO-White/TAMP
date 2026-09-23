import type { ReactNode } from "react";
import { RequireRole } from "@/components/tamp/RequireRole";

export default function TransporterLayout({ children }: { children: ReactNode }) {
  return <RequireRole role="TRANSPORTER">{children}</RequireRole>;
}
