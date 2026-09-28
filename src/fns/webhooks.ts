// Client wrappers over the webhooks router.
import { trpc } from "@/lib/trpc";

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  secretHint: string;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  event: string;
  status: string;
  attempts: number;
  responseCode: number | null;
  lastError: string | null;
  createdAt: string;
}

export const listWebhooks = (): Promise<WebhookEndpoint[]> => trpc.query("webhooks.list");

export const createWebhook = (
  url: string,
  events: string[],
): Promise<{ id: string; url: string; events: string[]; secret: string }> =>
  trpc.mutation("webhooks.create", { url, events: events as never });

export const setWebhookActive = (id: string, active: boolean): Promise<{ ok: true }> =>
  trpc.mutation("webhooks.setActive", { id, active });

export const deleteWebhook = (id: string): Promise<{ ok: true }> =>
  trpc.mutation("webhooks.delete", { id });

export const listWebhookDeliveries = (limit = 30): Promise<WebhookDelivery[]> =>
  trpc.query("webhooks.deliveries", { limit });
