
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
  Sparkles,
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

const ROLE_LABEL: Record<Role, string> = {
  FREIGHT_OWNER: "Freight owner",
  TRANSPORTER: "Fleet operator",
  DRIVER: "Driver workspace",
  ADMIN: "Platform control",
};

export function Sidebar() {
  const { role, sidebarCollapsed, toggleSidebar, me } = useTamp();
  const nav = NAV_BY_ROLE[role];
  const roleLabel = ROLE_LABEL[role];

  return (
    <aside
      className={`relative hidden shrink-0 flex-col overflow-hidden border-r border-white/10 bg-[#11120f] text-white shadow-[12px_0_40px_rgba(0,0,0,.08)] transition-[width] duration-300 md:flex ${
        sidebarCollapsed ? "w-[76px]" : "w-[272px]"
      }`}
    >
      <div className="pointer-events-none absolute -right-20 top-0 size-48 rounded-full bg-signal/10 blur-3xl" />

      <div className={`relative border-b border-white/10 ${sidebarCollapsed ? "px-3 py-5" : "px-5 py-5"}`}>
        <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3"}`}>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-signal/30 bg-signal/10 text-signal">
            <Sparkles className="size-4" />
          </span>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-signal">Workspace</div>
              <div className="mt-0.5 truncate text-sm font-semibold text-white">{roleLabel}</div>
            </div>
          )}
        </div>
      </div>

      <nav className="relative flex-1 space-y-1 overflow-y-auto px-3 py-5">
        {!sidebarCollapsed && (
          <div className="mb-3 px-3 text-[9px] font-bold uppercase tracking-[0.24em] text-white/35">
            Navigation
          </div>
        )}
        {nav.map(({ to, label, icon: Icon, exact }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: exact ?? false }}
            title={sidebarCollapsed ? label : undefined}
            className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-white/55 transition-all duration-200 hover:bg-white/[.07] hover:text-white ${
              sidebarCollapsed ? "justify-center" : ""
            }`}
            activeProps={{
              className: "!bg-signal !text-[#15140f] shadow-[0_10px_24px_rgba(229,168,46,.18)]",
            }}
          >
            <Icon className="size-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" />
            {!sidebarCollapsed && <span className="truncate">{label}</span>}
          </Link>
        ))}
      </nav>

      {!sidebarCollapsed && (
        <div className="relative mx-3 mb-3 rounded-2xl border border-white/10 bg-white/[.045] p-3.5">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">Signed in as</div>
          <div className="mt-1 truncate text-sm font-semibold text-white">{me.contactName}</div>
          <div className="mt-0.5 truncate text-[11px] text-white/45">{me.companyName || roleLabel}</div>
          <span className="absolute right-3 top-3 size-2 rounded-full bg-positive shadow-[0_0_10px_currentColor]" />
        </div>
      )}

      <button
        onClick={toggleSidebar}
        title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={`relative flex min-h-14 items-center gap-3 border-t border-white/10 px-5 text-xs font-semibold text-white/45 transition-colors hover:bg-white/[.05] hover:text-white ${
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
  const { role, me } = useTamp();
  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-40 md:hidden">
      <button className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} aria-label="Close menu" />
      <aside className="relative flex h-full w-[min(86vw,320px)] flex-col bg-[#11120f] p-4 text-white shadow-2xl animate-in slide-in-from-left duration-300">
        <div className="mb-5 rounded-2xl border border-white/10 bg-white/[.05] p-4">
          <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-signal">{ROLE_LABEL[role]}</div>
          <div className="mt-1 truncate text-base font-semibold">{me.contactName}</div>
          <div className="truncate text-xs text-white/45">{me.companyName}</div>
        </div>
        <nav className="space-y-1">
          {NAV_BY_ROLE[role].map(({ to, label, icon: Icon, exact }) => (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              activeOptions={{ exact: exact ?? false }}
              className="flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-semibold text-white/60 transition-colors hover:bg-white/[.07] hover:text-white"
              activeProps={{ className: "!bg-signal !text-[#15140f]" }}
            >
              <Icon className="size-[18px]" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-xl border border-white/10 px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-white/35">
          TAMP secure workspace
        </div>
      </aside>
    </div>
  );
}
