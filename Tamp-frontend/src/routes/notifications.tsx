"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@/lib/nav";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import {
  fetchNotifications,
  markNotificationsRead as markServerRead,
} from "@/fns/notifications";
import {
  licenceAlerts,
  maintenanceAlerts,
  type Notification,
  notificationTarget,
  toClientTone,
} from "@/lib/tamp-selectors";
import { useTamp } from "@/lib/tamp-store";

const toneDot: Record<Notification["tone"], string> = {
  success: "bg-positive",
  warning: "bg-danger",
  info: "bg-signal",
};

function NotificationsPage() {
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

  // Server-side notification store (written on domain events).
  const { data: server = [] } = useQuery({
    queryKey: ["notifications", role],
    queryFn: () => fetchNotifications(50),
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

  // Licence + maintenance reminders stay client-derived — they're proactive
  // schedule alerts, not domain events, so they aren't in the server store.
  const derived = [
    ...licenceAlerts(trucks, notificationsReadAt[role]),
    ...maintenanceAlerts(maintenance, trucks, notificationsReadAt[role]),
  ];
  const notifications = [...derived, ...serverNotifs].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
  const unread = notifications.filter((n) => n.unread).length;

  const markAll = useMutation({
    mutationFn: () => markServerRead(),
    onSuccess: () => {
      markNotificationsRead(); // clear the derived-alert read timestamp too
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const go = (n: Notification) => {
    const target = notificationTarget(role, n, { matches, trips, disputes });
    if (target.kind === "load")
      navigate({ to: "/owner/loads/$loadId", params: { loadId: target.loadId } });
    else navigate({ to: target.to });
  };

  return (
    <AppShell>
      <PageHeader
        title="Notifications"
        actions={
          unread > 0 ? (
            <button
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          ) : undefined
        }
      />

      <div className="mx-auto max-w-3xl p-6">
        {unread > 0 && (
          <div className="mb-3 text-xs font-semibold text-muted-foreground">
            {unread} unread notification{unread === 1 ? "" : "s"}
          </div>
        )}

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-12 text-center">
            <Bell className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          </div>
        ) : (
          <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-graphite">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => go(n)}
                  className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-steel/40 ${
                    n.unread ? "bg-signal/5" : ""
                  }`}
                >
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${toneDot[n.tone]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{n.title}</span>
                      {n.unread && (
                        <span className="rounded-full bg-signal/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-signal-foreground">
                          New
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{n.detail}</div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {new Date(n.at).toLocaleString("en-ZA", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </AppShell>
  );
}

export default NotificationsPage;
