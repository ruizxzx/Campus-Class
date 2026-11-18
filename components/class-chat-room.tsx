"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { useRouter } from "next/navigation";
import {
  Check,
  FileText,
  LoaderCircle,
  MessageCircle,
  Paperclip,
  Pin,
  Pencil,
  Reply,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { ClassMessage, ClassMessageReaction } from "@/types/database";

const reactions = ["👍", "❤️", "🎉", "😄", "👀"] as const;
type Reaction = (typeof reactions)[number];
const subscribeToHydration = () => () => {};
const getHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export type ChatMessage = Pick<ClassMessage,
  "id" | "body" | "sender_id" | "created_at" | "edited_at" | "deleted_at"
  | "parent_id" | "pinned_at" | "attachment_name"
> & {
  profiles: { full_name: string } | null;
};

type MessageReaction = Pick<ClassMessageReaction, "message_id" | "user_id" | "reaction">;

type Props = {
  classId: string;
  collegeId: string;
  className: string;
  section: string;
  subjectName: string;
  currentUserId: string;
  currentUserName: string;
  canModerate: boolean;
  initialMessages: ChatMessage[];
  initialReactions: MessageReaction[];
};

function responseError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return fallback;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return typeof message.id === "string"
    && typeof message.body === "string"
    && typeof message.sender_id === "string"
    && typeof message.created_at === "string"
    && ["edited_at", "deleted_at", "parent_id", "pinned_at", "attachment_name"]
      .every((key) => typeof message[key] === "string" || message[key] === null)
    && (message.profiles === null || (
      typeof message.profiles === "object"
      && message.profiles !== null
      && "full_name" in message.profiles
      && typeof message.profiles.full_name === "string"
    ));
}

export function ClassChatRoom({
  classId,
  collegeId,
  className,
  section,
  subjectName,
  currentUserId,
  currentUserName,
  canModerate,
  initialMessages,
  initialReactions,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [messageReactions, setMessageReactions] = useState(initialReactions);
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [showJumpLatest, setShowJumpLatest] = useState(false);
  const [olderAvailable, setOlderAvailable] = useState(initialMessages.length === 50);
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainer = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);
  const messagesRef = useRef(messages);
  const searchResultsRef = useRef<ChatMessage[] | null>(null);
  const searchTermRef = useRef("");

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    searchResultsRef.current = searchResults;
  }, [searchResults]);
  useEffect(() => {
    searchTermRef.current = search.trim().toLocaleLowerCase();
  }, [search]);

  const refreshReactions = useCallback(async () => {
    const ids = [...new Set([
      ...messagesRef.current.map((message) => message.id),
      ...(searchResultsRef.current ?? []).map((message) => message.id),
    ])];
    if (!ids.length) {
      setMessageReactions([]);
      return;
    }
    const db = createClient();
    const { data, error } = await db.from("class_message_reactions")
      .select("message_id,user_id,reaction")
      .eq("college_id", collegeId)
      .eq("class_id", classId)
      .in("message_id", ids);
    if (error) {
      console.error("Unable to refresh chat reactions", { code: error.code, message: error.message });
      return;
    }
    setMessageReactions((data ?? []) as MessageReaction[]);
  }, [classId, collegeId]);

  const markRead = useCallback(async () => {
    try {
      const db = createClient();
      const { error } = await db.rpc("mark_class_chat_read", { _class_id: classId });
      if (error) {
        console.error("Unable to mark chat as read", { code: error.code, message: error.message, details: error.details });
      }
    } catch (error) {
      console.error("Unable to reach the class chat read-state endpoint", error);
    }
  }, [classId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [classId]);

  useEffect(() => {
    const query = search.trim();
    let cancelled = false;
    if (!query) {
      searchResultsRef.current = null;
      const clearTimer = setTimeout(() => {
        if (!cancelled) {
          setSearchResults(null);
          setSearchLoading(false);
        }
      }, 0);
      void refreshReactions();
      return () => {
        cancelled = true;
        clearTimeout(clearTimer);
      };
    }

    searchResultsRef.current = null;
    const loadingTimer = setTimeout(() => {
      if (!cancelled) {
        setSearchLoading(true);
        setSearchResults(null);
      }
    }, 0);
    const timeout = setTimeout(async () => {
      const db = createClient();
      const { data, error } = await db.from("class_messages")
        .select("id,body,sender_id,created_at,edited_at,deleted_at,parent_id,pinned_at,attachment_name,profiles!class_messages_college_id_sender_id_fkey(full_name)")
        .eq("college_id", collegeId)
        .eq("class_id", classId)
        .is("deleted_at", null)
        .ilike("body", `%${query}%`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) {
        console.error("Unable to search class chat history", { code: error.code, message: error.message });
        setSearchResults([]);
        searchResultsRef.current = [];
        setSearchLoading(false);
        toast.error("Could not search chat history.");
        return;
      }
      const results = ((data ?? []) as unknown as ChatMessage[]).reverse();
      searchResultsRef.current = results;
      setSearchResults(results);
      setSearchLoading(false);
      await refreshReactions();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(loadingTimer);
      clearTimeout(timeout);
    };
  }, [classId, collegeId, refreshReactions, search]);

  useEffect(() => {
    let removingChannel = false;
    void markRead();
    const db = createClient();
    const channel = db.channel(`class-chat-${classId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "class_messages",
        filter: `class_id=eq.${classId}`,
      }, async (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (payload.eventType === "INSERT") {
          if (typeof row.id !== "string" || typeof row.sender_id !== "string") return;
          const shouldFollow = shouldFollowRef.current;
          const { data: sender } = await db.from("profiles").select("full_name")
            .eq("college_id", collegeId)
            .eq("id", row.sender_id)
            .maybeSingle();
          const incoming: ChatMessage = {
            id: row.id,
            body: typeof row.body === "string" ? row.body : "",
            sender_id: row.sender_id,
            created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
            edited_at: null,
            deleted_at: null,
            parent_id: typeof row.parent_id === "string" ? row.parent_id : null,
            pinned_at: typeof row.pinned_at === "string" ? row.pinned_at : null,
            attachment_name: typeof row.attachment_name === "string" ? row.attachment_name : null,
            profiles: sender?.full_name ? { full_name: sender.full_name } : null,
          };
          setMessages((current) => current.some((message) => message.id === incoming.id)
            ? current
            : [...current, incoming].sort((a, b) => a.created_at.localeCompare(b.created_at)));
          if (searchResultsRef.current !== null && incoming.body.toLocaleLowerCase().includes(searchTermRef.current)) {
            setSearchResults((current) => current && current.some((message) => message.id === incoming.id)
              ? current
              : [...(current ?? []), incoming]);
          }
          if (shouldFollow) {
            requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" }));
          } else if (incoming.sender_id !== currentUserId) {
            setShowJumpLatest(true);
          }
          if (incoming.sender_id !== currentUserId) void markRead();
          void refreshReactions();
          return;
        }

        if (payload.eventType === "UPDATE" && typeof row.id === "string") {
          void refreshReactions();
          if (row.deleted_at) {
            setMessages((current) => current.filter((message) => message.id !== row.id));
            setSearchResults((current) => current?.filter((message) => message.id !== row.id) ?? null);
          } else {
            const existing = messagesRef.current.some((message) => message.id === row.id);
            if (existing) {
              setMessages((current) => current.map((message) => message.id !== row.id ? message : {
                ...message,
                body: typeof row.body === "string" ? row.body : message.body,
                edited_at: typeof row.edited_at === "string" ? row.edited_at : message.edited_at,
                pinned_at: typeof row.pinned_at === "string" ? row.pinned_at : null,
              }));
              setSearchResults((current) => current?.filter((message) => message.id !== row.id || (
                typeof row.body === "string" && row.body.toLocaleLowerCase().includes(searchTermRef.current)
              )).map((message) => message.id !== row.id ? message : {
                ...message,
                body: typeof row.body === "string" ? row.body : message.body,
                edited_at: typeof row.edited_at === "string" ? row.edited_at : message.edited_at,
                pinned_at: typeof row.pinned_at === "string" ? row.pinned_at : null,
              }) ?? null);
            } else {
              const { data: refreshed } = await db.from("class_messages")
                .select("id,body,sender_id,created_at,edited_at,deleted_at,parent_id,pinned_at,attachment_name,profiles!class_messages_college_id_sender_id_fkey(full_name)")
                .eq("college_id", collegeId)
                .eq("id", row.id)
                .maybeSingle();
              if (refreshed) {
                setMessages((current) => current.some((message) => message.id === row.id)
                  ? current
                  : [...current, refreshed as unknown as ChatMessage].sort((a, b) => a.created_at.localeCompare(b.created_at)));
                const searchMessage = refreshed as unknown as ChatMessage;
                if (searchResultsRef.current !== null && searchMessage.body.toLocaleLowerCase().includes(searchTermRef.current)) {
                  setSearchResults((current) => current && current.some((message) => message.id === searchMessage.id)
                    ? current
                    : [...(current ?? []), searchMessage]);
                }
              }
            }
          }
        }
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "class_message_reactions",
        filter: `class_id=eq.${classId}`,
      }, () => {
        void refreshReactions();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("live");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeStatus("offline");
          if (!(status === "CLOSED" && removingChannel)) {
            console.error("Class chat realtime connection failed", { status, classId });
          }
        }
      });

    return () => {
      removingChannel = true;
      void db.removeChannel(channel);
    };
  }, [classId, collegeId, currentUserId, markRead, refreshReactions]);

  const pinnedMessages = useMemo(() => messages.filter((message) => message.pinned_at), [messages]);
  const visibleMessages = useMemo(() => (search.trim() ? searchResults ?? [] : messages)
    .filter((message) => !pinnedOnly || Boolean(message.pinned_at)), [messages, pinnedOnly, search, searchResults]);

  async function loadOlder() {
    if (loadingOlder || !olderAvailable || !messages.length) return;
    setLoadingOlder(true);
    const oldest = messages[0];
    const db = createClient();
    let data: unknown[] | null;
    let error: { code: string; message: string } | null;
    try {
      const result = await db.from("class_messages")
        .select("id,body,sender_id,created_at,edited_at,deleted_at,parent_id,pinned_at,attachment_name,profiles!class_messages_college_id_sender_id_fkey(full_name)")
        .eq("college_id", collegeId)
        .eq("class_id", classId)
        .is("deleted_at", null)
        .lt("created_at", oldest.created_at)
        .order("created_at", { ascending: false })
        .limit(50);
      data = result.data;
      error = result.error;
    } catch (loadError) {
      console.error("Unable to reach the class chat history", loadError);
      toast.error("Could not load older messages.");
      setLoadingOlder(false);
      return;
    }
    if (error) {
      console.error("Unable to load older chat messages", { code: error.code, message: error.message });
      toast.error("Could not load older messages.");
      setLoadingOlder(false);
      return;
    }
    const older = ((data ?? []) as unknown as ChatMessage[]).reverse();
    setMessages((current) => [...older, ...current]);
    setOlderAvailable(older.length === 50);
    setLoadingOlder(false);
  }

  async function saveMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const text = body.trim();
    if (!text && !attachment) return;
    setSending(true);

    if (editing) {
      let response: Response;
      let payload: unknown;
      try {
        response = await fetch(`/api/chat/messages/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
        payload = await response.json().catch(() => null);
      } catch {
        toast.error("Network error. The message was not updated.");
        setSending(false);
        return;
      }
      if (!response.ok) {
        toast.error(responseError(payload, "Could not update this message."));
        setSending(false);
        return;
      }
      const editedAt = new Date().toISOString();
      setMessages((current) => current.map((message) => message.id === editing.id
        ? { ...message, body: text, edited_at: editedAt }
        : message));
      setSearchResults((current) => current
        ?.filter((message) => message.id !== editing.id || text.toLocaleLowerCase().includes(searchTermRef.current))
        .map((message) => message.id === editing.id
          ? { ...message, body: text, edited_at: editedAt }
          : message) ?? null);
      setEditing(null);
      setBody("");
      toast.success("Message updated.");
      setSending(false);
      return;
    }

    let created: ChatMessage | null = null;
    if (attachment) {
      const formData = new FormData();
      formData.set("class_id", classId);
      formData.set("body", text);
      if (replyTo) formData.set("parent_id", replyTo.id);
      formData.set("attachment", attachment);
      let response: Response;
      let payload: unknown;
      try {
        response = await fetch("/api/chat/messages", { method: "POST", body: formData });
        payload = await response.json().catch(() => null);
      } catch {
        toast.error("Network error. The message was not sent.");
        setSending(false);
        return;
      }
      if (!response.ok) {
        toast.error(responseError(payload, "Could not send this message."));
        setSending(false);
        return;
      }
      created = payload && typeof payload === "object" && "message" in payload && isChatMessage(payload.message)
        ? payload.message
        : null;
    } else {
      try {
        const db = createClient();
        const { data, error } = await db.rpc("send_class_chat_message", {
          _class_id: classId,
          _body: text,
          _parent_id: replyTo?.id ?? null,
        });
        if (error) {
          console.error("Unable to send class chat message", { code: error.code, message: error.message });
          toast.error(error.code === "42501"
            ? "You cannot post in this class chat."
            : error.code === "PGRST202"
              ? "Chat is not configured yet. Ask an administrator to apply the latest database migration."
              : "Could not send this message.");
          setSending(false);
          return;
        }
        created = isChatMessage(data) ? data : null;
      } catch {
        toast.error("Could not send this message. Check your connection and try again.");
        setSending(false);
        return;
      }
    }

    if (!created) {
      toast.error("The message was saved, but could not be displayed. Refresh the chat.");
      setSending(false);
      router.refresh();
      return;
    }
    setMessages((current) => current.some((message) => message.id === created.id)
      ? current
      : [...current, created].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    if (searchResultsRef.current !== null && created.body.toLocaleLowerCase().includes(searchTermRef.current)) {
      setSearchResults((current) => current && current.some((message) => message.id === created.id)
        ? current
        : [...(current ?? []), created]);
    }
    setBody("");
    setAttachment(null);
    setReplyTo(null);
    if (fileInput.current) fileInput.current.value = "";
    toast.success("Message sent.");
    setSending(false);
    void markRead();
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    router.refresh();
  }

  function beginEdit(message: ChatMessage) {
    setEditing(message);
    setReplyTo(null);
    setAttachment(null);
    setBody(message.body);
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }

  async function removeMessage(message: ChatMessage) {
    if (!window.confirm("Delete this message for everyone in the class chat?")) return;
    let response: Response;
    let payload: unknown;
    try {
      response = await fetch(`/api/chat/messages/${message.id}`, { method: "DELETE" });
      payload = await response.json().catch(() => null);
    } catch {
      toast.error("Network error. The message was not deleted.");
      return;
    }
    if (!response.ok) {
      toast.error(responseError(payload, "Could not delete this message."));
      return;
    }
    setMessages((current) => current.filter((item) => item.id !== message.id));
    setSearchResults((current) => current?.filter((item) => item.id !== message.id) ?? null);
    setMessageReactions((current) => current.filter((reaction) => reaction.message_id !== message.id));
    if (payload && typeof payload === "object" && "cleanup_pending" in payload && payload.cleanup_pending === true) {
      toast.warning("Message deleted; attachment cleanup is pending.");
    } else {
      toast.success("Message deleted.");
    }
  }

  async function toggleReaction(messageId: string, reaction: Reaction) {
    try {
      const db = createClient();
      const { error } = await db.rpc("toggle_class_message_reaction", {
        _message_id: messageId,
        _reaction: reaction,
      });
      if (error) {
        console.error("Unable to update class chat reaction", { code: error.code, message: error.message });
        toast.error(error.code === "42501"
          ? "You cannot react to this message."
          : error.code === "PGRST202"
            ? "Chat is not configured yet. Ask an administrator to apply the latest database migration."
            : "Could not update this reaction.");
        return;
      }
    } catch {
      toast.error("Could not update this reaction. Check your connection and try again.");
      return;
    }
    await refreshReactions();
  }

  async function togglePin(message: ChatMessage) {
    let response: Response;
    let payload: unknown;
    try {
      response = await fetch("/api/chat/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: message.id }),
      });
      payload = await response.json().catch(() => null);
    } catch {
      toast.error("Network error. The pin was not changed.");
      return;
    }
    if (!response.ok) {
      toast.error(responseError(payload, "Could not update this pin."));
      return;
    }
    const isPinned = payload && typeof payload === "object" && "pinned" in payload && payload.pinned === true;
    setMessages((current) => current.map((item) => item.id === message.id
      ? { ...item, pinned_at: isPinned ? new Date().toISOString() : null }
      : item));
    setSearchResults((current) => current?.map((item) => item.id === message.id
      ? { ...item, pinned_at: isPinned ? new Date().toISOString() : null }
      : item) ?? null);
  }

  return (
    <section className="surface overflow-hidden">
      <header className="flex flex-col gap-4 border-b border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <div className="eyebrow flex items-center gap-2"><MessageCircle size={13} /> Class section chat</div>
          <h1 className="mt-2 truncate text-xl font-semibold tracking-tight">{className}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--muted)]">
            <span>{subjectName} <span aria-hidden="true">·</span> Section {section}</span>
            <span aria-live="polite" className="inline-flex items-center gap-1.5 text-xs">
              <span className={`h-1.5 w-1.5 rounded-full ${realtimeStatus === "live" ? "bg-emerald-500" : realtimeStatus === "offline" ? "bg-amber-500" : "bg-[var(--muted)]"}`} />
              {realtimeStatus === "live" ? "Live" : realtimeStatus === "offline" ? "Live updates paused" : "Connecting"}
            </span>
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <label className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              aria-label="Search chat messages"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={100}
              placeholder="Search messages"
              className="input-base !py-2.5 !pl-9 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => setPinnedOnly((current) => !current)}
            aria-pressed={pinnedOnly}
            className={`btn-secondary !px-3 ${pinnedOnly ? "!border-[var(--green)] !bg-[var(--green-soft)]" : ""}`}
            title="Show pinned messages"
          >
            <Pin size={15} />
            <span className="hidden sm:inline">Pinned</span>
            {pinnedMessages.length > 0 && <span className="text-xs">{pinnedMessages.length}</span>}
          </button>
        </div>
      </header>

      {pinnedMessages.length > 0 && !pinnedOnly && (
        <div className="flex gap-3 border-b border-[var(--line)] bg-[var(--green-soft)] px-4 py-3 sm:px-6">
          <Pin size={15} className="mt-0.5 shrink-0 text-[var(--green)]" />
          <button
            type="button"
            onClick={() => document.getElementById(`chat-message-${pinnedMessages[0].id}`)?.scrollIntoView({ behavior: "auto", block: "center" })}
            className="min-w-0 text-left text-xs leading-5"
          >
            <span className="font-semibold">Pinned message</span>
            <span className="ml-2 text-[var(--muted)]">{pinnedMessages[0].body.slice(0, 120)}</span>
          </button>
        </div>
      )}

      {searchLoading && (
        <div className="px-5 py-2 text-xs text-[var(--muted)]" role="status">
          Searching all messages in this class…
        </div>
      )}
      <div
        ref={scrollContainer}
        onScroll={(event) => {
          const element = event.currentTarget;
          const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
          shouldFollowRef.current = isNearBottom;
          if (isNearBottom) setShowJumpLatest(false);
        }}
        className="relative max-h-[min(62vh,720px)] min-h-[330px] overflow-y-auto p-4 sm:p-6"
      >
        {olderAvailable && !search.trim() && (
          <div className="mb-5 text-center">
            <button type="button" className="btn-secondary !py-2 text-xs" onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}
        {visibleMessages.length ? (
          <div className="space-y-5">
            {visibleMessages.map((message) => {
              const own = message.sender_id === currentUserId;
              const canDelete = own || canModerate;
              const parent = message.parent_id ? messages.find((item) => item.id === message.parent_id) : null;
              const createdAt = new Date(message.created_at);
              const groupedReactions = reactions.map((reaction) => ({
                reaction,
                users: messageReactions.filter((item) => item.message_id === message.id && item.reaction === reaction),
              })).filter((item) => item.users.length > 0);

              return (
                <article key={message.id} id={`chat-message-${message.id}`} className="group flex gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--green-soft)] text-xs font-bold text-[var(--green-strong)]">
                    {(message.profiles?.full_name ?? "M").slice(0, 1).toLocaleUpperCase()}
                  </div>
                  <div className={`min-w-0 max-w-[min(100%,680px)] flex-1 ${own ? "ml-auto" : ""}`}>
                    {parent && (
                      <button
                        type="button"
                        onClick={() => document.getElementById(`chat-message-${parent.id}`)?.scrollIntoView({ behavior: "auto", block: "center" })}
                        className="mb-1 flex max-w-full items-center gap-1 truncate border-l-2 border-[var(--green)] pl-2 text-left text-xs text-[var(--muted)]"
                      >
                        <Reply size={12} /> {parent.profiles?.full_name ?? "Member"}: {parent.body}
                      </button>
                    )}
                    <div className={`rounded-2xl px-4 py-3 ${own ? "bg-[var(--green-soft)]" : "bg-[var(--surface-2)]"}`}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--muted)]">
                        <span className="font-semibold text-[var(--text)]">{own ? currentUserName : message.profiles?.full_name ?? "Class member"}</span>
                        <time dateTime={message.created_at} title={createdAt.toISOString()}>
                          {hasHydrated
                            ? formatDistanceToNowStrict(createdAt, { addSuffix: true })
                            : `${createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC`}
                        </time>
                        {message.edited_at && <span>edited</span>}
                        {message.pinned_at && <Pin size={12} aria-label="Pinned" />}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>
                      {message.attachment_name && (
                        <a
                          href={`/api/chat/attachments/${message.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 flex max-w-full items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-medium hover:border-[var(--green)]"
                        >
                          <FileText size={15} className="shrink-0 text-[var(--green)]" />
                          <span className="truncate">{message.attachment_name}</span>
                        </a>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {groupedReactions.map(({ reaction, users }) => {
                        const active = users.some((item) => item.user_id === currentUserId);
                        return (
                          <button
                            key={reaction}
                            type="button"
                            onClick={() => toggleReaction(message.id, reaction)}
                            aria-pressed={active}
                            className={`rounded-full border px-2 py-1 text-xs transition-colors ${active ? "border-[var(--green)] bg-[var(--green-soft)]" : "border-[var(--line)] bg-[var(--surface)]"}`}
                            title={`${users.length} reactions`}
                          >
                            {reaction} {users.length}
                          </button>
                        );
                      })}
                      <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        {reactions.map((reaction) => (
                          <button
                            key={reaction}
                            type="button"
                            aria-label={`React ${reaction}`}
                            onClick={() => toggleReaction(message.id, reaction)}
                            className="grid h-8 w-8 place-items-center rounded-full text-sm hover:bg-[var(--surface-2)] focus-visible:opacity-100"
                          >
                            {reaction}
                          </button>
                        ))}
                        <button
                          type="button"
                          aria-label="Reply to message"
                          onClick={() => { setReplyTo(message); setEditing(null); }}
                          className="grid h-8 w-8 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]"
                        >
                          <Reply size={15} />
                        </button>
                        {canModerate && (
                          <button
                            type="button"
                            aria-label={message.pinned_at ? "Unpin message" : "Pin message"}
                            onClick={() => togglePin(message)}
                            className="grid h-8 w-8 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]"
                          >
                            <Pin size={14} />
                          </button>
                        )}
                        {own && (
                          <button
                            type="button"
                            aria-label="Edit message"
                            onClick={() => beginEdit(message)}
                            className="grid h-8 w-8 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            aria-label="Delete message"
                            onClick={() => removeMessage(message)}
                            className="grid h-8 w-8 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid min-h-[270px] place-items-center">
            <div className="max-w-sm text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--green-soft)] text-[var(--green)]"><MessageCircle size={20} /></div>
              <h2 className="mt-4 text-sm font-semibold">
                {searchLoading ? "Searching messages…" : search || pinnedOnly ? "No matching messages" : "Start the conversation"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                {searchLoading
                  ? "Searching chat history…"
                  : search || pinnedOnly
                    ? "Try another search or show all messages."
                    : "Share a question, class reminder, or helpful resource with your section."}
              </p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
        {showJumpLatest && (
          <button
            type="button"
            onClick={() => {
              bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
              setShowJumpLatest(false);
            }}
            className="btn-secondary sticky bottom-1 z-10 mx-auto mt-4 block !py-2 text-xs shadow"
          >
            Jump to latest
          </button>
        )}
      </div>

      <form onSubmit={saveMessage} className="border-t border-[var(--line)] bg-[var(--surface)] p-3 sm:p-5">
        {(replyTo || editing || attachment) && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-xs">
            <div className="min-w-0 truncate text-[var(--muted)]">
              {editing ? <>Editing your message</> : replyTo ? <>Replying to <span className="font-semibold text-[var(--text)]">{replyTo.profiles?.full_name ?? "Class member"}</span>: {replyTo.body}</> : null}
              {attachment && <span className="ml-2 font-medium text-[var(--text)]">{attachment.name}</span>}
            </div>
            <button
              type="button"
              aria-label="Cancel reply or attachment"
              onClick={() => {
                setReplyTo(null);
                setEditing(null);
                setAttachment(null);
                setBody("");
                if (fileInput.current) fileInput.current.value = "";
              }}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg hover:bg-[var(--line)]"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="chat-message-input" className="sr-only">Write a message</label>
            <textarea
              id="chat-message-input"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={2}
              maxLength={5000}
              placeholder="Message your class…"
              className="input-base min-h-[48px] resize-y !py-3 text-sm"
            />
            <div className="mt-1 flex justify-between px-1 text-[10px] text-[var(--muted)]">
              <span>Enter to send · Shift + Enter for a new line</span>
              <span>{body.length}/5000</span>
            </div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.pptx"
            onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            aria-label="Attach a file"
            className="btn-secondary h-11 w-11 shrink-0 !p-0"
            disabled={sending || Boolean(editing)}
          >
            <Paperclip size={17} />
          </button>
          <button
            type="submit"
            disabled={sending || (!body.trim() && !attachment)}
            className="btn-primary h-11 w-11 shrink-0 !p-0"
            aria-label={editing ? "Save edit" : "Send message"}
            aria-busy={sending}
          >
            {sending ? <LoaderCircle size={17} className="animate-spin" /> : editing ? <Check size={17} /> : <Send size={16} />}
          </button>
        </div>
      </form>
    </section>
  );
}
