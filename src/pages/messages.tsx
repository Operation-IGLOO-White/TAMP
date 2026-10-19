import { Circle, FileText, MessageCircle, Paperclip, Send, Truck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { listConversations, listMessages, markConversationRead, messageSocket, sendMessage } from "@/fns/messages";
import { uploadFile } from "@/fns/upload";
import { useTamp } from "@/context/TampContext";
import type { TripConversation, TripMessage } from "@/types/domain";

export default function MessagesPage() {
  const { me, loads, parties } = useTamp();
  const [conversations, setConversations] = useState<TripConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TripMessage[]>([]);
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => void listConversations().then((items) => {
      if (!active) return;
      setConversations(items);
      setSelectedId((id) => id ?? items[0]?.id ?? null);
    }).catch(() => {});
    refresh();
    const interval = window.setInterval(refresh, 10_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;

    const mergeMessages = (current: TripMessage[], incoming: TripMessage[]) => {
      const byId = new Map(current.map((message) => [message.id, message]));
      incoming.forEach((message) => byId.set(message.id, message));
      return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    };
    const receive = (message: TripMessage) => {
      if (!active || message.conversationId !== selectedId) return;
      setMessages((items) => mergeMessages(items, [message]));
      setConversations((items) => items.map((item) => item.id === selectedId ? {
        ...item,
        lastMessage: message.text || message.attachmentName || "Attachment",
        lastMessageAt: message.createdAt,
        unreadCount: 0,
      } : item));
      if (message.senderId !== me.id) void markConversationRead(selectedId).catch(() => {});
    };
    const refreshMessages = () => void listMessages(selectedId)
      .then((items) => { if (active) setMessages((current) => mergeMessages(current, items)); })
      .catch(() => {});
    const connect = () => {
      if (!active) return;
      setConnection((status) => status === "connecting" ? status : "reconnecting");
      socket = messageSocket(selectedId);
      socket.onopen = () => { if (active) setConnection("live"); };
      socket.onmessage = (event) => {
        try {
          const incoming = JSON.parse(event.data as string) as { type?: string; message?: TripMessage };
          if (incoming.type === "message" && incoming.message) receive(incoming.message);
        } catch {
          // Ignore a malformed event without breaking subsequent live messages.
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (!active) return;
        setConnection("reconnecting");
        reconnectTimer = window.setTimeout(connect, 2_000);
      };
    };

    setMessages([]);
    setConnection("connecting");
    refreshMessages();
    void markConversationRead(selectedId)
      .then(() => setConversations((items) => items.map((item) => item.id === selectedId ? { ...item, unreadCount: 0 } : item)))
      .catch(() => {});
    connect();
    const fallback = window.setInterval(refreshMessages, 3_000);
    return () => {
      active = false;
      window.clearInterval(fallback);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [me.id, selectedId]);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [messages]);
  const selected = conversations.find((item) => item.id === selectedId);
  const load = loads.find((item) => item.id === selected?.loadId);
  const participantNames = useMemo(() => selected ? [selected.ownerId, selected.carrierId, selected.driverId].filter(Boolean).map((id) => parties.find((party) => party.id === id)?.contactName).filter(Boolean).join(", ") : "", [parties, selected]);
  const submit = async () => {
    if (!selectedId || (!text.trim() && !attachment) || busy) return;
    setBusy(true);
    try {
      const sent = await sendMessage(selectedId, text.trim(), attachment ?? undefined);
      setMessages((items) => items.some((item) => item.id === sent.id) ? items : [...items, sent]);
      setConversations((items) => items.map((item) => item.id === selectedId ? { ...item, lastMessage: sent.text || sent.attachmentName || "Attachment", lastMessageAt: sent.createdAt } : item));
      setText("");
      setAttachment(null);
    } finally {
      setBusy(false);
    }
  };

  return <AppShell><PageHeader title="Trip Messages" /><div className="grid h-[calc(100vh-8rem)] min-h-[650px] bg-white lg:grid-cols-[350px_1fr]">
    <aside className="border-b border-border lg:border-b-0 lg:border-r"><div className="border-b border-border p-4 text-xs text-muted-foreground">Secure conversations for confirmed deliveries</div><div className="divide-y divide-border">{conversations.map((conversation) => { const item = loads.find((load) => load.id === conversation.loadId); return <button key={conversation.id} onClick={() => setSelectedId(conversation.id)} className={`w-full p-4 text-left hover:bg-steel/20 ${selectedId === conversation.id ? "border-l-4 border-signal bg-signal/5" : ""}`}><div className="flex justify-between gap-2"><strong className="font-mono text-xs">{conversation.loadId}</strong>{conversation.unreadCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-signal text-[10px] font-black text-signal-foreground">{conversation.unreadCount}</span>}</div><div className="mt-1 truncate text-sm font-semibold">{item ? `${item.origin.label} → ${item.destination.label}` : conversation.tripId}</div><p className="mt-1 truncate text-xs text-muted-foreground">{conversation.lastMessage ?? "Conversation opened"}</p></button>})}{!conversations.length && <div className="p-10 text-center text-sm text-muted-foreground"><MessageCircle className="mx-auto mb-3 size-8" />Conversations appear after a match is confirmed.</div>}</div></aside>
    <section className="flex min-h-0 flex-col">{selected ? <><header className="border-b border-border p-4"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Truck className="size-4 shrink-0 text-signal" /><strong className="truncate">{load ? `${load.origin.label} → ${load.destination.label}` : selected.tripId}</strong></div><span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase text-muted-foreground"><Circle className={`size-2 fill-current ${connection === "live" ? "text-emerald-500" : "animate-pulse text-amber-500"}`} />{connection === "live" ? "Live" : connection === "connecting" ? "Connecting" : "Reconnecting"}</span></div><p className="mt-1 text-xs text-muted-foreground">{participantNames}</p></header><div className="flex-1 space-y-3 overflow-y-auto bg-[#f7f9fb] p-4">{messages.map((message) => message.kind === "SYSTEM" ? <div key={message.id} className="mx-auto max-w-md rounded-full bg-steel/60 px-4 py-1.5 text-center text-[10px] font-semibold text-muted-foreground">{message.text}</div> : <div key={message.id} className={`flex ${message.senderId === me.id ? "justify-end" : "justify-start"}`}><div className={`max-w-[78%] rounded-xl px-3 py-2 shadow-sm ${message.senderId === me.id ? "bg-signal text-signal-foreground" : "border border-border bg-white"}`}><div className="mb-1 text-[9px] font-bold uppercase opacity-70">{message.senderId === me.id ? "You" : parties.find((p) => p.id === message.senderId)?.contactName ?? message.senderRole}</div>{message.text && <p className="whitespace-pre-wrap text-sm">{message.text}</p>}{message.attachmentUrl && <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 rounded-md bg-black/10 px-2 py-1 text-xs font-bold underline"><FileText className="size-4" />{message.attachmentName ?? "Attachment"}</a>}<div className="mt-1 text-right text-[9px] opacity-60">{new Date(message.createdAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</div></div></div>)}<div ref={bottom} /></div><footer className="border-t border-border p-3">{attachment && <div className="mb-2 flex items-center justify-between rounded-md bg-steel/40 px-3 py-2 text-xs"><span>{attachment.name}</span><button onClick={() => setAttachment(null)}>Remove</button></div>}<div className="flex gap-2"><label className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-md border border-border"><Paperclip className="size-4" /><input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setBusy(true); try { const uploaded = await uploadFile(file, "MESSAGE"); setAttachment({ url: uploaded.url, name: uploaded.filename }); } finally { setBusy(false); event.target.value = ""; } }} /></label><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} rows={1} placeholder="Message this trip…" className="min-h-10 flex-1 resize-none rounded-md border border-border px-3 py-2 text-sm" /><button aria-label="Send message" disabled={busy || (!text.trim() && !attachment)} onClick={() => void submit()} className="grid size-10 place-items-center rounded-md bg-signal text-signal-foreground disabled:opacity-40"><Send className="size-4" /></button></div></footer></> : <div className="grid flex-1 place-items-center text-sm text-muted-foreground">Select a trip conversation.</div>}</section>
  </div></AppShell>;
}
