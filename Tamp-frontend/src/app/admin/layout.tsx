import type { ReactNode } from "react";
import { RequireRole } from "@/components/tamp/RequireRole";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <RequireRole role="ADMIN">{children}</RequireRole>;
}
