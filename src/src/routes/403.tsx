"use client";

import { Link } from "@/lib/nav";
import { HOME_BY_ROLE, ROLE_LABEL } from "@/lib/role-routes";
import { useTamp } from "@/lib/tamp-store";

function NoAccess() {
  const { role } = useTamp();

  return (
    <main className="h-[calc(100vh-3.5rem)] flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-4">
        <div className="text-6xl font-black text-signal">403</div>
        <h1 className="text-sm font-bold uppercase tracking-widest">No access</h1>
        <p className="text-xs text-muted-foreground leading-relaxed">
          This page isn't available to the{" "}
          <span className="font-bold text-foreground">{ROLE_LABEL[role]}</span> role you're
          currently viewing as.
        </p>
        <Link
          to={HOME_BY_ROLE[role]}
          className="inline-block bg-signal text-signal-foreground px-4 py-2 text-xs font-bold uppercase tracking-widest hover:brightness-110"
        >
          Go to my dashboard
        </Link>
      </div>
    </main>
  );
}

export default NoAccess;
