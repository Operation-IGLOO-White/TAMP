import { BriefcaseBusiness, Home, MessageCircle, Navigation, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTamp } from "@/context/TampContext";
import { listConversations } from "@/fns/messages";
import { Link } from "@/lib/nav";
import { isActiveTrip } from "@/lib/tamp-dashboard";

type NavKey = "home" | "jobs" | "navigate" | "messages" | "profile";

export function DriverBottomNav() {
  const { pathname, search } = useLocation();
  const { me, trips, dispatches } = useTamp();
  const [unreadMessages, setUnreadMessages] = useState(0);

  const latestDispatch = useMemo(() => {
    const latest = new Map<string, (typeof dispatches)[number]>();
    for (const assignment of dispatches) {
      const current = latest.get(assignment.tripId);
      if (!current || new Date(assignment.offeredAt) > new Date(current.offeredAt)) {
        latest.set(assignment.tripId, assignment);
      }
    }
    return latest;
  }, [dispatches]);

  const pendingJobs = useMemo(
    () =>
      [...latestDispatch.values()].filter(
        (assignment) => assignment.driverId === me.id && assignment.status === "OFFERED",
      ).length,
    [latestDispatch, me.id],
  );
  const hasActiveTrip = trips.some(
    (trip) => trip.assignedDriverId === me.id && isActiveTrip(trip.status),
  );

  useEffect(() => {
    let active = true;
    const refresh = () =>
      void listConversations()
        .then((items) => {
          if (active) setUnreadMessages(items.reduce((sum, item) => sum + item.unreadCount, 0));
        })
        .catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const params = new URLSearchParams(search);
  const active: NavKey =
    pathname === "/driver/home"
      ? "home"
      : pathname === "/messages"
        ? "messages"
        : pathname === "/driver/profile"
          ? "profile"
          : pathname === "/driver" && params.get("navigate") === "1"
            ? "navigate"
            : "jobs";

  const items: {
    key: NavKey;
    label: string;
    to: string;
    icon: typeof Home;
    badge?: number;
    prominent?: boolean;
  }[] = [
    { key: "home", label: "Home", to: "/driver/home", icon: Home },
    { key: "jobs", label: "Jobs", to: "/driver", icon: BriefcaseBusiness, badge: pendingJobs },
    { key: "navigate", label: "Navigate", to: "/driver?navigate=1", icon: Navigation, prominent: true },
    { key: "messages", label: "Messages", to: "/messages", icon: MessageCircle, badge: unreadMessages },
    { key: "profile", label: "Profile", to: "/driver/profile", icon: UserRound },
  ];

  return (
    <nav
      aria-label="Driver navigation"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-[430px] md:hidden"
    >
      <div className="grid h-[4.65rem] grid-cols-5 items-end rounded-[1.6rem] border border-border/80 bg-background/95 px-2 pb-2 shadow-[0_18px_50px_rgba(0,0,0,0.22)] backdrop-blur-xl">
        {items.map(({ key, label, to, icon: Icon, badge, prominent }) => {
          const selected = active === key;
          const disabled = prominent && !hasActiveTrip;
          return (
            <Link
              key={key}
              to={disabled ? "/driver" : to}
              aria-current={selected ? "page" : undefined}
              aria-disabled={disabled || undefined}
              title={disabled ? "Navigation becomes available when you have an active trip" : label}
              className={`group relative flex min-w-0 flex-col items-center justify-end gap-1 rounded-2xl pb-0.5 text-[9px] font-bold transition-all duration-300 ${
                selected ? "text-foreground" : "text-muted-foreground"
              } ${disabled ? "opacity-45" : ""}`}
            >
              <span
                className={`relative grid place-items-center transition-all duration-300 ease-out ${
                  selected
                    ? "-translate-y-3 size-12 rounded-full border-4 border-background bg-signal text-signal-foreground shadow-[0_10px_24px_rgba(238,177,0,0.34)]"
                    : prominent
                      ? "size-10 rounded-full bg-steel/50"
                      : "size-8 rounded-xl group-active:scale-90"
                }`}
              >
                <Icon className={`transition-transform duration-300 ${selected ? "size-5 scale-110" : "size-[18px]"}`} />
                {!!badge && (
                  <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[8px] font-black leading-4 text-white ring-2 ring-background">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
                {prominent && hasActiveTrip && !selected && (
                  <span className="absolute right-0 top-0 size-2.5 rounded-full border-2 border-background bg-positive" />
                )}
              </span>
              <span className={`max-w-full truncate transition-transform duration-300 ${selected ? "-translate-y-2 text-signal" : ""}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
