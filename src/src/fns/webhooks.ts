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

export const listWebhooks = (): Promise<WebhookEndpoint[]> => trpc.webhooks.list.query();

export const createWebhook = (
  url: string,
  events: string[],
): Promise<{ id: string; url: string; events: string[]; secret: string }> =>
  trpc.webhooks.create.mutate({ url, events: events as never });

export const setWebhookActive = (id: string, active: boolean): Promise<{ ok: true }> =>
  trpc.webhooks.setActive.mutate({ id, active });

export const deleteWebhook = (id: string): Promise<{ ok: true }> =>
  trpc.webhooks.delete.mutate({ id });

export const listWebhookDeliveries = (limit = 30): Promise<WebhookDelivery[]> =>
  trpc.webhooks.deliveries.query({ limit });
