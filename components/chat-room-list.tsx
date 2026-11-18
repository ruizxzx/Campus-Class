"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { MessageCircle, Search } from "lucide-react";

export type ChatRoom = {
  id: string;
  displayName: string;
  section: string;
  subjectName: string;
  subjectCode: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

export function ChatRoomList({ rooms }: { rooms: ChatRoom[] }) {
  const [query, setQuery] = useState("");
  const visibleRooms = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    if (!value) return rooms;
    return rooms.filter((room) => [
      room.displayName,
      room.section,
      room.subjectName,
      room.subjectCode,
      room.lastMessage ?? "",
    ].some((part) => part.toLocaleLowerCase().includes(value)));
  }, [query, rooms]);

  return (
    <div className="space-y-4">
      <label className="relative block max-w-md">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search classes and recent messages"
          aria-label="Search class chats"
          className="input-base !pl-10"
        />
      </label>

      {visibleRooms.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {visibleRooms.map((room) => (
            <Link
              key={room.id}
              href={`/chat/${room.id}`}
              className="surface-flat group flex min-w-0 items-center gap-4 p-4 transition-colors hover:border-[var(--green)]"
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--green-soft)] text-[var(--green)]">
                <MessageCircle size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm font-semibold">{room.displayName}</div>
                  {room.lastMessageAt && (
                    <time className="shrink-0 text-[10px] text-[var(--muted)]" dateTime={room.lastMessageAt}>
                      {formatDistanceToNowStrict(new Date(room.lastMessageAt), { addSuffix: true })}
                    </time>
                  )}
                </div>
                <div className="mt-1 truncate text-xs text-[var(--muted)]">
                  {room.subjectName} <span aria-hidden="true">·</span> Section {room.section}
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="truncate text-xs text-[var(--muted)]">{room.lastMessage || "Start a conversation with your class"}</p>
                  {room.unreadCount > 0 && (
                    <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--green)] px-1.5 text-[10px] font-bold text-white" aria-label={`${room.unreadCount} unread messages`}>
                      {room.unreadCount > 99 ? "99+" : room.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="surface-flat px-6 py-12 text-center">
          <div className="text-sm font-semibold">{query ? "No chats match that search" : "No active classrooms"}</div>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
            {query ? "Try another class name, subject, or message." : "Join or get assigned to an active class section to use its group chat."}
          </p>
        </div>
      )}
    </div>
  );
}
