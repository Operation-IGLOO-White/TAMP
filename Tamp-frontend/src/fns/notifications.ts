// Client wrappers over the server-side notification store.
import { trpc } from "@/lib/trpc";
import type { ClientNotification } from "@/server/routers/notifications";

export type { ClientNotification };

export const fetchNotifications = (limit = 50): Promise<ClientNotification[]> =>
  trpc.notifications.list.query({ limit });

export const notificationsUnread = (): Promise<number> =>
  trpc.notifications.unreadCount.query();

export const markNotificationsRead = (ids?: string[]): Promise<{ updated: number }> =>
  trpc.notifications.markRead.mutate(ids ? { ids } : {});
