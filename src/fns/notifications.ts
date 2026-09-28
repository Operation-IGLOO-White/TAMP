// Client wrappers over the server-side notification store.
import { trpc } from "@/lib/trpc";
import type { ClientNotification } from "@/types/api";

export type { ClientNotification };

export const fetchNotifications = (limit = 50): Promise<ClientNotification[]> =>
  trpc.query("notifications.list", { limit });

export const notificationsUnread = (): Promise<number> =>
  trpc.query("notifications.unreadCount");

export const markNotificationsRead = (ids?: string[]): Promise<{ updated: number }> =>
  trpc.mutation("notifications.markRead", ids ? { ids } : {});
