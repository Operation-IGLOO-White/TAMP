import type { ReactNode } from "react";
import { RequireRole } from "@/components/tamp/RequireRole";

export default function OwnerLayout({ children }: { children: ReactNode }) {
  return <RequireRole role="FREIGHT_OWNER">{children}</RequireRole>;
}
