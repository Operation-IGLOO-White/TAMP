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
  WalletCards,
  Send,
  MessageCircle,
  Building2,
  ChevronDown,
  CircleGauge,
  Fuel,
  Activity,
  UserRoundCog,
  PackageOpen,
  RadioTower,
  CalendarDays,
  Repeat2,
  Boxes,
  Store,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useTamp } from "@/context/TampContext";
import { playNotificationSound } from "@/lib/notification-sound";
import type { Role } from "@/types/domain";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
  children?: NavItem[];
};

// Navigation only — analytics live on the dashboards, not the rail.
const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  FREIGHT_OWNER: [
    { to: "/owner", label: "Dashboard", icon: LayoutDashboard, exact: true },
    {
      to: "/owner/shipments",
      label: "Shipments",
      icon: Boxes,
      children: [
        { to: "/owner/shipments", label: "All Shipments", icon: PackageOpen, exact: true },
        { to: "/owner/shipments?view=active", label: "Active Shipments", icon: Activity },
        { to: "/owner/shipments?view=scheduled", label: "Scheduled", icon: CalendarDays },
        { to: "/owner/shipments?view=recurring", label: "Recurring Schedules", icon: Repeat2 },
      ],
    },
    {
      to: "/owner/board",
      label: "Marketplace",
      icon: Store,
      children: [
        { to: "/owner/board", label: "Freight Board", icon: ClipboardList, exact: true },
        { to: "/owner/board?status=POSTED", label: "Matches & Offers", icon: RouteIcon },
      ],
    },
    {
      to: "/owner/control-tower",
      label: "Operations",
      icon: RadioTower,
      children: [
        { to: "/owner/control-tower", label: "Live Control Tower", icon: RadioTower, exact: true },
        { to: "/owner/history", label: "Delivery History", icon: History },
      ],
    },
    { to: "/owner/billing", label: "Billing", icon: WalletCards },
    { to: "/messages", label: "Messages", icon: MessageCircle },
    { to: "/organisation", label: "Organisation", icon: Building2 },
    { to: "/owner/profile", label: "Profile", icon: User },
  ],
  TRANSPORTER: [
    { to: "/transporter", label: "Dashboard", icon: LayoutDashboard, exact: true },
    {
      to: "/transporter/fleet",
      label: "Fleet Management",
      icon: Truck,
      children: [
        { to: "/transporter/fleet", label: "All Vehicles", icon: Truck, exact: true },
        { to: "/transporter/fleet?status=active", label: "Active Vehicles", icon: Activity },
        { to: "/transporter/fleet-ops?tab=compliance", label: "Compliance", icon: ShieldCheck },
        { to: "/transporter/fleet-ops?tab=maintenance", label: "Maintenance & Repairs", icon: Wrench },
        { to: "/transporter/fleet-ops?tab=fuel", label: "Fuel & Telematics", icon: Fuel },
        { to: "/transporter/fleet-ops?tab=costs", label: "Costs & Analytics", icon: CircleGauge },
        { to: "/transporter/drivers", label: "Drivers Directory", icon: UserRoundCog },
      ],
    },
    { to: "/transporter/engagements", label: "Engagements", icon: RouteIcon },
    { to: "/transporter/dispatch", label: "Dispatch", icon: Send },
    { to: "/driver", label: "My Jobs", icon: PackageCheck },
    { to: "/transporter/history", label: "History", icon: History },
    { to: "/transporter/earnings", label: "Earnings", icon: WalletCards },
    { to: "/messages", label: "Messages", icon: MessageCircle },
    { to: "/organisation", label: "Organisation", icon: Building2 },
    { to: "/transporter/profile", label: "Profile", icon: User },
  ],
  // Owner-driver merge: DRIVER is no longer a separate workspace; its job
  // screen is reachable from the Truck Owner rail above.
  DRIVER: [
    { to: "/driver", label: "My Jobs", icon: PackageCheck, exact: true },
    { to: "/driver/profile", label: "Profile", icon: User },
  ],
  ADMIN: [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/admin/users", label: "Users", icon: Users },
    { to: "/admin/trucks", label: "Trucks", icon: Truck },
    { to: "/admin/oversight", label: "Oversight", icon: ShieldCheck },
    { to: "/admin/finance", label: "Finance", icon: WalletCards },
    { to: "/admin/logs", label: "System Logs", icon: ScrollText },
    { to: "/messages", label: "Messages", icon: MessageCircle },
    { to: "/organisation", label: "Organisations", icon: Building2 },
    { to: "/admin/profile", label: "Profile", icon: User },
  ],
};

export function Sidebar() {
  const { role, sidebarCollapsed, toggleSidebar } = useTamp();
  const nav = NAV_BY_ROLE[role];
  const counts = useSidebarCounts();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  return (
    <aside
      className={`hidden shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 md:flex ${
        sidebarCollapsed ? "w-16" : "w-60"
      }`}
    >
      <nav className="flex-1 space-y-0.5 p-2">
        {nav.map(({ to, label, icon: Icon, exact, children }) => children ? (
          <div key={to}>
            <button
              type="button"
              onClick={() => setOpenGroups((current) => ({ ...current, [to]: !(current[to] ?? true) }))}
              title={sidebarCollapsed ? label : undefined}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-steel/50 hover:text-foreground ${sidebarCollapsed ? "justify-center" : ""}`}
            >
              <Icon className="size-[18px] shrink-0" />
              {!sidebarCollapsed && <><span className="flex-1 text-left">{label}</span><ChevronDown className={`size-4 transition-transform duration-200 ${(openGroups[to] ?? true) ? "rotate-180" : ""}`} /></>}
            </button>
            {(openGroups[to] ?? true) && !sidebarCollapsed && (
              <div className="relative ml-5 space-y-0.5 border-l border-border py-1 pl-3">
                {children.map(({ to: childTo, label: childLabel, icon: ChildIcon, exact: childExact }) => (
                  <Link key={childTo} to={childTo} activeOptions={{ exact: childExact ?? false }} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-steel/40 hover:text-foreground" activeProps={{ className: "!text-foreground !bg-steel/60" }}>
                    <ChildIcon className="size-3.5" /><span className="truncate">{childLabel}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: exact ?? false }}
            title={sidebarCollapsed ? label : undefined}
            className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-steel/50 hover:text-foreground ${
              sidebarCollapsed ? "justify-center" : ""
            }`}
            activeProps={{
              className: "!bg-steel !text-foreground",
            }}
          >
            <Icon className="size-[18px] shrink-0" />
            {!sidebarCollapsed && <span className="truncate">{label}</span>}
            <NavCount count={counts[to] ?? 0} collapsed={sidebarCollapsed} />
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
  const counts = useSidebarCounts(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-[1000] isolate md:hidden">
      <button className="absolute inset-0 bg-black/30" onClick={onClose} aria-label="Close menu" />
      <aside className="relative z-10 flex h-full w-[min(86vw,320px)] flex-col overflow-y-auto border-r border-border bg-sidebar p-3 text-foreground shadow-2xl animate-in slide-in-from-left duration-200">
        <nav className="space-y-0.5 pb-6">
          {NAV_BY_ROLE[role].map(({ to, label, icon: Icon, exact, children }) => children ? (
            <div key={to}>
              <button type="button" onClick={() => setOpenGroups((current) => ({ ...current, [to]: !(current[to] ?? true) }))} className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold text-muted-foreground">
                <Icon className="size-[18px]" /><span className="flex-1 text-left">{label}</span><ChevronDown className={`size-4 transition-transform ${(openGroups[to] ?? true) ? "rotate-180" : ""}`} />
              </button>
              {(openGroups[to] ?? true) && <div className="ml-5 space-y-1 border-l border-border pl-3">{children.map(({ to: childTo, label: childLabel, icon: ChildIcon }) => (
                <Link key={childTo} to={childTo} onClick={onClose} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-steel/40"><ChildIcon className="size-4" />{childLabel}</Link>
              ))}</div>}
            </div>
          ) : (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              activeOptions={{ exact: exact ?? false }}
              className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-steel/50 hover:text-foreground"
              activeProps={{ className: "!bg-steel !text-foreground" }}
            >
              <Icon className="size-[18px]" />
              <span className="flex-1">{label}</span>
              <NavCount count={counts[to] ?? 0} collapsed={false} />
            </Link>
          ))}
        </nav>
      </aside>
    </div>
  );
}

function useSidebarCounts(playSound = true): Record<string, number> {
  const { role, me, matches, trips, dispatches } = useTamp();
  const counts = useMemo(() => {
    const latestDispatch = new Map<string, (typeof dispatches)[number]>();
    for (const assignment of dispatches) {
      const current = latestDispatch.get(assignment.tripId);
      if (!current || new Date(assignment.offeredAt).getTime() > new Date(current.offeredAt).getTime()) {
        latestDispatch.set(assignment.tripId, assignment);
      }
    }
    const activeTrips = trips.filter((trip) => !["COMPLETED", "CANCELLED"].includes(trip.status));
    if (role === "TRANSPORTER") {
      const engagementCount = matches.filter((match) =>
        ["SUGGESTED", "OFFERED", "ACCEPTED"].includes(match.status),
      ).length;
      const dispatchCount = trips.filter((trip) => {
        if (trip.status !== "SCHEDULED") return false;
        return latestDispatch.get(trip.id)?.status !== "ACCEPTED";
      }).length;
      return {
        "/transporter/engagements": engagementCount,
        "/transporter/dispatch": dispatchCount,
        "/driver": activeTrips.length,
      };
    }
    if (role === "DRIVER") {
      const relevantTripIds = new Set(
        [...latestDispatch.values()]
          .filter((assignment) => assignment.driverId === me.id && assignment.status === "OFFERED")
          .map((assignment) => assignment.tripId),
      );
      for (const trip of activeTrips) {
        if (trip.assignedDriverId === me.id) relevantTripIds.add(trip.id);
      }
      return { "/driver": relevantTripIds.size };
    }
    return {};
  }, [dispatches, matches, me.id, role, trips]);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const previous = useRef<number | null>(null);
  useEffect(() => {
    if (playSound && previous.current !== null && total > previous.current) playNotificationSound();
    previous.current = total;
  }, [playSound, total]);
  return counts;
}

function NavCount({ count, collapsed }: { count: number; collapsed: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={`grid min-w-5 place-items-center rounded-full bg-signal px-1.5 py-0.5 text-[10px] font-black leading-none text-signal-foreground ${
        collapsed ? "absolute right-0.5 top-0.5 min-w-4 px-1 text-[8px]" : "ml-auto"
      }`}
      aria-label={`${count} pending`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
