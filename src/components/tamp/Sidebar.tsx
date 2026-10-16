
import { Link } from "@/lib/nav";
import {
  ClipboardList,
  History,
  LayoutDashboard,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Route as RouteIcon,
  ScrollText,
  ShieldCheck,
  Truck,
  User,
  Users,
  Wrench,
} from "lucide-react";
import type { ComponentType } from "react";
import { useTamp } from "@/context/TampContext";
import type { Role } from "@/types/domain";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
};

// Navigation only — analytics live on the dashboards, not the rail.
const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  FREIGHT_OWNER: [
    { to: "/owner", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/owner/board", label: "Freight Board", icon: ClipboardList },
    { to: "/owner/history", label: "History", icon: History },
    { to: "/owner/profile", label: "Profile", icon: User },
  ],
  TRANSPORTER: [
    { to: "/transporter", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/transporter/fleet", label: "Fleet Register", icon: Truck },
    { to: "/transporter/fleet-ops", label: "Fleet Costs", icon: Wrench },
    { to: "/transporter/engagements", label: "Engagements", icon: RouteIcon },
    { to: "/driver", label: "My Jobs", icon: PackageCheck },
    { to: "/transporter/history", label: "History", icon: History },
    { to: "/transporter/profile", label: "Profile", icon: User },
  ],
  // Owner-driver merge: DRIVER is no longer a separate workspace; its job
  // screen is reachable from the Truck Owner rail above.
  DRIVER: [
    { to: "/driver/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/driver", label: "My Jobs", icon: PackageCheck, exact: true },
    { to: "/driver/fleet", label: "My Trucks", icon: Truck },
    { to: "/driver/fleet-ops", label: "Fleet Costs", icon: Wrench },
    { to: "/driver/engagements", label: "Engagements", icon: RouteIcon },
    { to: "/driver/history", label: "History", icon: History },
    { to: "/driver/profile", label: "Profile", icon: User },
  ],
  ADMIN: [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/admin/users", label: "Users", icon: Users },
    { to: "/admin/trucks", label: "Trucks", icon: Truck },
    { to: "/admin/oversight", label: "Oversight", icon: ShieldCheck },
    { to: "/admin/logs", label: "System Logs", icon: ScrollText },
    { to: "/admin/profile", label: "Profile", icon: User },
  ],
};

export function Sidebar() {
  const { role, sidebarCollapsed, toggleSidebar } = useTamp();
  const nav = NAV_BY_ROLE[role];

  return (
    <aside
      className={`hidden shrink-0 flex-col border-r border-border bg-white transition-[width] duration-200 md:flex ${
        sidebarCollapsed ? "w-16" : "w-60"
      }`}
    >
      <nav className="flex-1 space-y-0.5 p-2">
        {nav.map(({ to, label, icon: Icon, exact }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: exact ?? false }}
            title={sidebarCollapsed ? label : undefined}
            className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-steel/50 hover:text-foreground ${
              sidebarCollapsed ? "justify-center" : ""
            }`}
            activeProps={{
              className: "!bg-steel !text-foreground",
            }}
          >
            <Icon className="size-[18px] shrink-0" />
            {!sidebarCollapsed && <span className="truncate">{label}</span>}
          </Link>
        ))}
      </nav>

      <button
        onClick={toggleSidebar}
        title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={`flex items-center gap-3 border-t border-border p-3 text-xs font-semibold text-muted-foreground hover:bg-steel/40 hover:text-foreground ${
          sidebarCollapsed ? "justify-center" : ""
        }`}
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="size-[18px]" />
        ) : (
          <>
            <PanelLeftClose className="size-[18px]" />
            <span>Collapse</span>
          </>
        )}
      </button>
    </aside>
  );
}

export function MobileNavigation({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role } = useTamp();
  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-40 md:hidden">
      <button className="absolute inset-0 bg-black/30" onClick={onClose} aria-label="Close menu" />
      <aside className="relative flex h-full w-[min(86vw,320px)] flex-col border-r border-border bg-white p-3 text-foreground shadow-2xl animate-in slide-in-from-left duration-200">
        <nav className="space-y-0.5">
          {NAV_BY_ROLE[role].map(({ to, label, icon: Icon, exact }) => (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              activeOptions={{ exact: exact ?? false }}
              className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-steel/50 hover:text-foreground"
              activeProps={{ className: "!bg-steel !text-foreground" }}
            >
              <Icon className="size-[18px]" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>
    </div>
  );
}
