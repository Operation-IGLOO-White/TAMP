import { trpc } from "@/lib/trpc";
import type { TripConversation, TripMessage } from "@/types/domain";

export const listConversations = () => trpc.query<TripConversation[]>("messages.conversations");
export const listMessages = (conversationId: string) => trpc.query<TripMessage[]>("messages.list", { conversationId });
export const sendMessage = (conversationId: string, text: string, attachment?: { url: string; name: string }) => trpc.mutation<TripMessage>("messages.send", { conversationId, text, ...(attachment ? { attachmentUrl: attachment.url, attachmentName: attachment.name } : {}) });
export const markConversationRead = (conversationId: string) => trpc.mutation<{ updated: number }>("messages.markRead", { conversationId });

export function messageSocket(conversationId: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const apiPath = (import.meta.env["VITE_API_URL"] || "/api/v1").replace(/\/$/, "");
  return new WebSocket(
    `${protocol}//${window.location.host}${apiPath}/messages/conversations/${encodeURIComponent(conversationId)}/live`,
  );
}
