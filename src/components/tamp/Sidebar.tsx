import { displayStatusForLoad } from "@/lib/tamp-selectors";
import { Link, useNavigate } from "@/lib/nav";
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
  Forklift,
  BusFront,
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
  ContactRound,
  BarChart3,
  Store,
  ListChecks,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useLocation } from "react-router-dom";
import { useTamp } from "@/context/TampContext";
import { playNotificationSound } from "@/lib/notification-sound";
import { hasPermission, type PermissionCode } from "@/lib/access";
import type { Role } from "@/types/domain";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
  permission?: PermissionCode;
  children?: NavItem[];
};

// Navigation only — analytics live on the dashboards, not the rail.
const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  FREIGHT_OWNER: [
    { to: "/owner", label: "Dashboard", icon: LayoutDashboard, exact: true, permission: "loads.read" },
    { to: "/passenger-charter", label: "Passenger Charter", icon: BusFront, permission: "loads.read" },
    { to: "/asset-hire", label: "Asset Rental", icon: Forklift, permission: "loads.read" },
    {
      to: "/owner/shipments",
      label: "Shipments",
      icon: Boxes,
      children: [
        { to: "/owner/shipments", label: "All Shipments", icon: PackageOpen, exact: true, permission: "loads.read" },
        { to: "/owner/shipments?view=active", label: "Active Shipments", icon: Activity, permission: "loads.read" },
        { to: "/owner/shipments?view=scheduled", label: "Scheduled", icon: CalendarDays, permission: "loads.read" },
        { to: "/owner/shipments?view=recurring", label: "Recurring Schedules", icon: Repeat2, permission: "loads.read" },
      ],
    },
    {
      to: "/owner/directory",
      label: "Customers",
      icon: ContactRound,
      children: [
        { to: "/owner/directory", label: "Customer Directory", icon: Users, exact: true, permission: "loads.read" },
        { to: "/owner/directory?view=locations", label: "Saved Locations", icon: RouteIcon, permission: "loads.read" },
        { to: "/owner/directory?view=templates", label: "Load & Lane Templates", icon: Repeat2, permission: "loads.read" },
      ],
    },
    {
      to: "/owner/board",
      label: "Marketplace",
      icon: Store,
      children: [
        { to: "/owner/board", label: "Freight Board", icon: ClipboardList, exact: true, permission: "loads.read" },
        { to: "/owner/offers", label: "Matches & Offers", icon: RouteIcon, permission: "matches.read" },
      ],
    },
    {
      to: "/owner/control-tower",
      label: "Operations",
      icon: RadioTower,
      children: [
        { to: "/owner/control-tower", label: "Live Control Tower", icon: RadioTower, exact: true, permission: "tracking.read" },
        { to: "/owner/history", label: "Delivery History", icon: History, permission: "trips.read" },
      ],
    },
    { to: "/owner/billing", label: "Billing", icon: WalletCards, permission: "finance.read" },
    { to: "/owner/insights", label: "Rates & Reporting", icon: BarChart3, permission: "finance.read" },
    { to: "/messages", label: "Messages", icon: MessageCircle, permission: "messages.read" },
    { to: "/organisation", label: "Organisation", icon: Building2, permission: "organisations.read" },
    { to: "/owner/profile", label: "Profile", icon: User },
  ],
  TRANSPORTER: [
    { to: "/transporter", label: "Dashboard", icon: LayoutDashboard, exact: true, permission: "trucks.read" },
    { to: "/asset-hire", label: "Asset Rental", icon: Forklift, permission: "loads.read" },
    {
      to: "/transporter/fleet",
      label: "Fleet Management",
      icon: Truck,
      children: [
        { to: "/transporter/fleet", label: "All Vehicles", icon: Truck, exact: true, permission: "trucks.read" },
        { to: "/transporter/passenger-fleet", label: "Buses & Minibuses", icon: BusFront, permission: "trucks.read" },
        { to: "/transporter/fleet?status=active", label: "Active Vehicles", icon: Activity, permission: "trucks.read" },
        { to: "/transporter/fleet-ops?tab=availability", label: "Availability Calendar", icon: CalendarDays, permission: "trucks.manage" },
        { to: "/transporter/fleet-ops?tab=compliance", label: "Compliance", icon: ShieldCheck, permission: "trucks.read" },
        { to: "/transporter/fleet-ops?tab=inspections", label: "Inspections & Defects", icon: ListChecks, permission: "trucks.manage" },
        { to: "/transporter/fleet-ops?tab=maintenance", label: "Maintenance & Repairs", icon: Wrench, permission: "trucks.manage" },
        { to: "/transporter/fleet-ops?tab=fuel", label: "Fuel & Telematics", icon: Fuel, permission: "trucks.manage" },
        { to: "/transporter/fleet-ops?tab=costs", label: "Vehicle Profitability", icon: CircleGauge, permission: "finance.read" },
        { to: "/transporter/drivers", label: "Drivers Directory", icon: UserRoundCog, permission: "organisations.read" },
      ],
    },
    { to: "/transporter/engagements", label: "Engagements", icon: RouteIcon, permission: "matches.read" },
    { to: "/transporter/dispatch", label: "Dispatch", icon: Send, permission: "dispatch.manage" },
    { to: "/driver", label: "My Jobs", icon: PackageCheck, permission: "trips.read" },
    { to: "/transporter/history", label: "History", icon: History, permission: "trips.read" },
    { to: "/transporter/earnings", label: "Earnings", icon: WalletCards, permission: "finance.read" },
    { to: "/messages", label: "Messages", icon: MessageCircle, permission: "messages.read" },
    { to: "/organisation", label: "Organisation", icon: Building2, permission: "organisations.read" },
    { to: "/transporter/profile", label: "Profile", icon: User },
  ],
  // Owner-driver merge: DRIVER is no longer a separate workspace; its job
  // screen is reachable from the Truck Owner rail above.
  DRIVER: [
    { to: "/driver", label: "My Jobs", icon: PackageCheck, exact: true, permission: "trips.read" },
    { to: "/driver/profile", label: "Profile", icon: User },
  ],
  ADMIN: [
    {
      to: "/admin",
      label: "Platform",
      icon: LayoutDashboard,
      children: [
        { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true, permission: "platform.admin" },
        { to: "/admin/organisations", label: "Organisations", icon: Building2, permission: "organisations.read" },
        { to: "/admin/users", label: "Users", icon: Users, permission: "users.read" },
        { to: "/admin/access-control", label: "Access Control", icon: ShieldCheck, permission: "organisations.members.manage" },
      ],
    },
    {
      to: "/admin/verification",
      label: "Verification",
      icon: ListChecks,
      children: [
        { to: "/admin/verification", label: "Verification Inbox", icon: ListChecks, exact: true, permission: "users.verify" },
        { to: "/admin/verification?queue=trucks", label: "Truck Reviews", icon: Truck, permission: "trucks.read" },
        { to: "/admin/verification?queue=drivers", label: "Driver Reviews", icon: UserRoundCog, permission: "users.verify" },
        { to: "/admin/verification?queue=documents", label: "Compliance Documents", icon: ShieldCheck, permission: "users.verify" },
        { to: "/admin/verification?queue=passenger", label: "Passenger Vehicles", icon: BusFront, permission: "platform.admin" },
        { to: "/admin/trucks", label: "All Trucks", icon: Truck, permission: "trucks.read" },
      ],
    },
    {
      to: "/admin/oversight",
      label: "Operations",
      icon: RadioTower,
      children: [
        { to: "/admin/oversight", label: "Oversight", icon: ShieldCheck, permission: "incidents.manage" },
        { to: "/admin/matching", label: "Matching Engine", icon: SlidersHorizontal, permission: "platform.admin" },
        { to: "/messages", label: "Messages", icon: MessageCircle, permission: "messages.read" },
      ],
    },
    { to: "/admin/finance", label: "Finance", icon: WalletCards, permission: "finance.manage" },
    {
      to: "/admin/logs",
      label: "System",
      icon: Settings,
      children: [
        { to: "/admin/logs", label: "System Logs", icon: ScrollText, permission: "system.logs.read" },
        { to: "/admin/profile", label: "Profile", icon: User },
      ],
    },
  ],
};

export function Sidebar() {
  const { role, authParty, sidebarCollapsed, toggleSidebar } = useTamp();
  const nav = permittedNavigation(NAV_BY_ROLE[role], authParty);
  const counts = useSidebarCounts();
  const navigate = useNavigate();
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    readOpenGroups(`tamp.sidebar.groups.desktop.${role}`),
  );

  const toggleGroup = (to: string, currentlyOpen: boolean) => {
    setOpenGroups((current) => {
      const next = { ...current, [to]: !currentlyOpen };
      saveOpenGroups(`tamp.sidebar.groups.desktop.${role}`, next);
      return next;
    });
  };

  return (
    <aside
      className={`hidden shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 md:flex ${
        sidebarCollapsed ? "w-16" : "w-60"
      }`}
    >
      <nav className="flex-1 space-y-0.5 p-2">
        {nav.map(({ to, label, icon: Icon, exact, children }) => children ? (
          <div key={to}>
            {(() => {
              const groupActive = children.some((child) => navItemActive(child, location.pathname, location.search));
              const groupOpen = openGroups[to] ?? true;
              return <>
            <button
              type="button"
              onClick={() => sidebarCollapsed
                ? navigate({ to })
                : toggleGroup(to, groupOpen)}
              title={sidebarCollapsed ? label : undefined}
              aria-expanded={!sidebarCollapsed ? groupOpen : undefined}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-[color,background-color,transform] duration-150 hover:bg-steel/50 hover:text-foreground active:scale-[0.99] ${groupActive ? "bg-steel/70 text-foreground" : "text-muted-foreground"} ${sidebarCollapsed ? "justify-center" : ""}`}
            >
              <Icon className="size-[18px] shrink-0" />
              {!sidebarCollapsed && <><span className="flex-1 text-left">{label}</span><NavCount count={counts[to] ?? 0} collapsed={false} /><ChevronDown className={`size-4 transition-transform duration-200 ${groupOpen ? "rotate-180" : ""}`} /></>}
            </button>
            {!sidebarCollapsed && <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${groupOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="min-h-0 overflow-hidden">
              <div className="relative ml-5 space-y-0.5 border-l border-border py-1 pl-3">
                {children.map(({ to: childTo, label: childLabel, icon: ChildIcon, exact: childExact }) => (
                  <Link key={childTo} to={childTo} activeOptions={{ exact: childExact ?? false }} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-steel/40 hover:text-foreground active:translate-x-0.5" activeProps={{ className: "!text-foreground !bg-steel/60" }}>
                    <ChildIcon className="size-3.5" /><span className="min-w-0 flex-1 truncate">{childLabel}</span><NavCount count={counts[childTo] ?? 0} collapsed={false} />
                  </Link>
                ))}
              </div>
              </div>
            </div>}
            </>;
            })()}
          </div>
        ) : (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: exact ?? false }}
            title={sidebarCollapsed ? label : undefined}
            className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-steel/50 hover:text-foreground active:scale-[0.99] ${
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
  const { role, authParty } = useTamp();
  const navigation = permittedNavigation(NAV_BY_ROLE[role], authParty);
  const counts = useSidebarCounts(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    readOpenGroups(`tamp.sidebar.groups.mobile.${role}`),
  );
  const location = useLocation();

  const toggleGroup = (to: string) => {
    setOpenGroups((current) => {
      const next = { ...current, [to]: !(current[to] ?? true) };
      saveOpenGroups(`tamp.sidebar.groups.mobile.${role}`, next);
      return next;
    });
  };

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
          {navigation.map(({ to, label, icon: Icon, exact, children }) => children ? (
            <div key={to}>
              <button type="button" onClick={() => toggleGroup(to)} className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors ${children.some((child) => navItemActive(child, location.pathname, location.search)) ? "bg-steel/70 text-foreground" : "text-muted-foreground"}`}>
                <Icon className="size-[18px]" /><span className="flex-1 text-left">{label}</span><NavCount count={counts[to] ?? 0} collapsed={false} /><ChevronDown className={`size-4 transition-transform duration-200 ${(openGroups[to] ?? true) ? "rotate-180" : ""}`} />
              </button>
              <div className={`grid transition-[grid-template-rows,opacity] duration-200 ${(openGroups[to] ?? true) ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}><div className="min-h-0 overflow-hidden"><div className="ml-5 space-y-1 border-l border-border pl-3">{children.map(({ to: childTo, label: childLabel, icon: ChildIcon, exact: childExact }) => (
                <Link key={childTo} to={childTo} onClick={onClose} activeOptions={{ exact: childExact ?? false }} activeProps={{ className: "!bg-steel/60 !text-foreground" }} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-steel/40"><ChildIcon className="size-4" /><span className="min-w-0 flex-1 truncate">{childLabel}</span><NavCount count={counts[childTo] ?? 0} collapsed={false} /></Link>
              ))}</div></div></div>
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

function permittedNavigation(items: NavItem[], party: ReturnType<typeof useTamp>["authParty"]): NavItem[] {
  return items.flatMap((item) => {
    if (!hasPermission(party, item.permission)) return [];
    if (!item.children) return [item];
    const children = permittedNavigation(item.children, party);
    return children.length ? [{ ...item, children }] : [];
  });
}

function readOpenGroups(key: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveOpenGroups(key: string, groups: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(groups));
  } catch {
    // Sidebar state persistence is optional when browser storage is unavailable.
  }
}

function navItemActive(item: NavItem, pathname: string, search: string) {
  const [targetPath, targetQuery = ""] = item.to.split("?");
  const pathMatches = item.exact
    ? pathname === targetPath
    : pathname === targetPath || pathname.startsWith(`${targetPath}/`);
  if (!pathMatches) return false;
  if (!targetQuery) return item.exact ? !search : true;
  const current = new URLSearchParams(search);
  return [...new URLSearchParams(targetQuery)].every(([key, value]) => current.get(key) === value);
}

function useSidebarCounts(playSound = true): Record<string, number> {
  const { role, me, matches, trips, dispatches, parties, trucks, vehicles, disputes, loads } = useTamp();
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
      const requestedLoadIds = new Set(matches.filter((match) => match.status === "OFFERED").map((match) => match.loadId));
      const engagementCount = matches.filter((match) => {
        const load = loads.find((item) => item.id === match.loadId);
        const truck = trucks.find((item) => item.id === match.truckPostingId);
        if (!load || !truck) return false;
        if (match.status === "OFFERED") return true;
        if (match.status === "ACCEPTED") return !["COMPLETED", "CLOSED"].includes(load.status);
        return match.status === "SUGGESTED" && truck.status === "AVAILABLE"
          && !requestedLoadIds.has(load.id)
          && displayStatusForLoad(load, matches, trips, disputes) === "POSTED";
      }).length;
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
    if (role === "FREIGHT_OWNER") {
      const pendingOffers = matches.filter((match) =>
        ["SUGGESTED", "OFFERED"].includes(match.status),
      ).length;
      return { "/owner/offers": pendingOffers };
    }
    if (role === "ADMIN") {
      const pendingUsers = parties.filter((party) => party.verification === "PENDING" || party.verification === "UNVERIFIED").length;
      const pendingTrucks = trucks.filter((truck) => {
        const vehicle = vehicles.find((item) => item.id === truck.vehicleId);
        return !vehicle || vehicle.verification === "PENDING" || vehicle.verification === "UNVERIFIED";
      }).length;
      const pendingDrivers = parties.filter((party) => party.role === "DRIVER" && party.verification !== "VERIFIED").length;
      const documentReviews = trucks.filter((truck) => !truck.licenceNumber || !truck.licenceExpiry || (truck.documents?.length ?? 0) < 3).length;
      const openOversight = disputes.filter((dispute) => dispute.status === "OPEN" || dispute.status === "UNDER_REVIEW").length;
      return {
        "/admin/verification": pendingUsers + pendingTrucks + documentReviews,
        "/admin/verification?queue=trucks": pendingTrucks,
        "/admin/verification?queue=drivers": pendingDrivers,
        "/admin/verification?queue=documents": documentReviews,
        "/admin/oversight": openOversight,
      };
    }
    return {};
  }, [dispatches, matches, me.id, role, trips, parties, trucks, vehicles, disputes, loads]);
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
