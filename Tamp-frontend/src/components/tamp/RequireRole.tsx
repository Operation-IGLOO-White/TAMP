"use client";

import { useNavigate } from "@/lib/nav";
import { useEffect, type ReactNode } from "react";
import { HOME_BY_ROLE } from "@/lib/role-routes";
import { useTamp } from "@/lib/tamp-store";
import type { Role } from "@/lib/tamp-types";

// Route-level role guard — spec §3: a user must never reach a role's route
// while acting as another role.
//
// When the active role doesn't match, we send the user to *their own*
// dashboard rather than to a dead-end 403. This is also what makes the demo
// role switcher reliable: switching role from inside a guarded route fires
// `setRole` + a navigation together, and the still-mounted guard briefly sees
// a mismatch. Because the guard now redirects to the new role's home — the
// same place the switch was heading — the two navigations agree and the user
// always lands on the right dashboard instead of being stranded on 403.
export function RequireRole({ role, children }: { role: Role | Role[]; children: ReactNode }) {
  const { role: activeRole, authParty, authReady } = useTamp();
  const navigate = useNavigate();
  const allowed = Array.isArray(role) ? role : [role];
  const authorised = authParty != null && allowed.includes(activeRole);

  // A social-login account that hasn't finished onboarding is sent to /welcome.
  const needsOnboarding = authParty?.onboardingComplete === false;

  useEffect(() => {
    if (!authReady) return; // wait for the session check to resolve
    if (!authParty) navigate({ to: "/" }); // not signed in → login
    else if (needsOnboarding) navigate({ to: "/welcome" });
    else if (!allowed.includes(activeRole)) navigate({ to: HOME_BY_ROLE[activeRole] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, authParty, needsOnboarding, activeRole, navigate]);

  if (!authReady) return null;
  if (!authorised || needsOnboarding) return null;
  return <>{children}</>;
}
