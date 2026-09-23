"use client";

import { Link, useNavigate } from "@/lib/nav";
import {
  Bell,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  LogOut,
  Moon,
  Sun,
  UserRound,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  fetchNotifications,
  markNotificationsRead as markServerRead,
} from "@/fns/notifications";
import { HOME_BY_ROLE, PROFILE_BY_ROLE, ROLE_SHORT } from "@/lib/role-routes";
import {
  licenceAlerts,
  maintenanceAlerts,
  type Notification,
  notificationTarget,
  toClientTone,
} from "@/lib/tamp-selectors";
import { useTamp } from "@/lib/tamp-store";
import { Avatar } from "./Avatar";

// Owner-driver merge: DRIVER folds into TRANSPORTER, so it isn't a separate
// switchable workspace.

function useClickAway(onAway: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onAway();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onAway();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onAway]);
  return ref;
}

export function TopNav() {
  const { role, authParty } = useTamp();

  // No chrome until an account is signed in.
  if (!authParty) return null;

  return (
    <nav className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-graphite px-4">
      <Link to={HOME_BY_ROLE[role]} className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-md bg-signal font-extrabold text-signal-foreground">
          T
        </span>
        <span className="text-lg font-extrabold tracking-tight">TAMP</span>
      </Link>

      <div className="flex items-center gap-1.5">
        <NotificationsMenu />
        <ProfileMenu />
      </div>
    </nav>
  );
}

function NotificationsMenu() {
  const {
    role,
    matches,
    trips,
    disputes,
    trucks,
    maintenance,
    notificationsReadAt,
    markNotificationsRead,
  } = useTamp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useClickAway(() => setOpen(false));

  // Poll the server notification store so the bell reflects domain events the
  // scheduler or other users trigger, not just this session's actions.
  const { data: server = [] } = useQuery({
    queryKey: ["notifications", role],
    queryFn: () => fetchNotifications(30),
    refetchInterval: 30_000,
  });
  const serverNotifs: Notification[] = server.map((n) => ({
    id: n.id,
    title: n.title,
    detail: n.detail,
    at: n.at,
    unread: n.unread,
    tone: toClientTone(n.tone),
    subjectType: (n.subjectType ?? "LOAD") as Notification["subjectType"],
    subjectId: n.subjectId ?? "",
  }));
  const notifications = [
    ...licenceAlerts(trucks, notificationsReadAt[role]),
    ...maintenanceAlerts(maintenance, trucks, notificationsReadAt[role]),
    ...serverNotifs,
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const unread = notifications.filter((n) => n.unread).length;

  const markAll = () => {
    markNotificationsRead();
    void markServerRead().then(() =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    );
  };

  const go = (n: (typeof notifications)[number]) => {
    const target = notificationTarget(role, n, { matches, trips, disputes });
    setOpen(false);
    if (target.kind === "load")
      navigate({ to: "/owner/loads/$loadId", params: { loadId: target.loadId } });
    else navigate({ to: target.to });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-steel/50 hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-signal px-1 text-[9px] font-bold text-signal-foreground">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-graphite shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Notifications
            </span>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-signal hover:underline"
              >
                <CheckCheck className="size-3.5" /> Mark all read
              </button>
            )}
          </div>
          <ol className="max-h-96 divide-y divide-border overflow-y-auto">
            {notifications.length === 0 && (
              <li className="px-4 py-6 text-center text-xs text-muted-foreground">Nothing yet.</li>
            )}
            {notifications.slice(0, 8).map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => go(n)}
                  className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-steel/40 ${
                    n.unread ? "bg-signal/5" : ""
                  }`}
                >
                  <span
                    className={`mt-1 size-2 shrink-0 rounded-full ${
                      n.tone === "success"
                        ? "bg-positive"
                        : n.tone === "warning"
                          ? "bg-danger"
                          : n.unread
                            ? "bg-signal"
                            : "bg-border"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">{n.title}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{n.detail}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {new Date(n.at).toLocaleString("en-ZA", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ol>
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide text-signal hover:bg-steel/30"
          >
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const { me, role, logout } = useTamp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useClickAway(() => setOpen(false));
  const [dark, setDark] = useTheme();

  const signOut = async () => {
    setOpen(false);
    await logout();
    navigate({ to: "/" });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-steel/50"
      >
        <Avatar party={me} size="sm" />
        <span className="hidden text-left sm:block">
          <span className="block text-xs font-bold leading-tight">{me.contactName}</span>
          <span className="block text-[10px] leading-tight text-muted-foreground">
            {ROLE_SHORT[role]}
          </span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-lg border border-border bg-graphite shadow-xl">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Avatar party={me} size="md" />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{me.contactName}</div>
              <div className="truncate text-[11px] text-muted-foreground">{me.companyName}</div>
            </div>
          </div>

          <div className="p-1.5">
            <Link
              to={PROFILE_BY_ROLE[role]}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium hover:bg-steel/50"
            >
              <UserRound className="size-4 text-muted-foreground" /> View profile
            </Link>
            <button
              onClick={() => setDark(!dark)}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium hover:bg-steel/50"
            >
              {dark ? (
                <Sun className="size-4 text-muted-foreground" />
              ) : (
                <Moon className="size-4 text-muted-foreground" />
              )}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>

          <div className="border-t border-border p-1.5">
            <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px]">
              <span className="font-semibold text-muted-foreground">{ROLE_SHORT[role]}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                  me.verification === "VERIFIED"
                    ? "bg-positive/15 text-positive"
                    : "bg-steel text-muted-foreground"
                }`}
              >
                {me.verification}
              </span>
            </div>
            <button
              onClick={signOut}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-danger hover:bg-danger/10"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Light is the default; the toggle flips a `dark` class on <html> and persists.
function useTheme(): [boolean, (v: boolean) => void] {
  const [dark, setDarkState] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("tamp-theme");
    const isDark = stored === "dark";
    setDarkState(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const setDark = (v: boolean) => {
    setDarkState(v);
    document.documentElement.classList.toggle("dark", v);
    localStorage.setItem("tamp-theme", v ? "dark" : "light");
  };

  return [dark, setDark];
}
