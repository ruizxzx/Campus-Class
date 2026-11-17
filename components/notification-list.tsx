"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Bell, CheckCheck } from "lucide-react";
import { EmptyState } from "@/components/ui";
export function NotificationList({ initial }: { initial: any[] }) {
  const [rows,setRows]=useState(initial);
  async function markRead(id:string){const {error}=await createClient().from("notifications").update({read_at:new Date().toISOString()}).eq("id",id);if(error){toast.error("Could not update notification.");return;}setRows(rs=>rs.map(r=>r.id===id?{...r,read_at:new Date().toISOString()}:r));}
  async function markAll(){const ids=rows.filter(r=>!r.read_at).map(r=>r.id);if(!ids.length)return;const {error}=await createClient().from("notifications").update({read_at:new Date().toISOString()}).in("id",ids);if(error)toast.error("Could not update notifications.");else{setRows(rs=>rs.map(r=>({...r,read_at:new Date().toISOString()})));toast.success("All notifications marked as read.");}}
  return <div className="surface p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div className="text-sm font-semibold">Recent notifications</div><button onClick={()=>void markAll()} className="btn-secondary !px-3 !py-2 text-[10px]"><CheckCheck size={13}/>Mark all read</button></div>{rows.length?rows.map(r=><div key={r.id} className={`flex items-start gap-3 border-t border-[var(--line)] py-4 first:border-0 ${r.read_at?"opacity-65":""}`}><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><Bell size={15}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="text-xs font-semibold">{r.title}</div>{!r.read_at&&<span className="h-1.5 w-1.5 rounded-full bg-[var(--orange)]"/>}</div>{r.body&&<p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{r.body}</p>}<div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--muted)]"><span>{new Date(r.created_at).toLocaleString()}</span>{r.href&&<Link href={r.href} onClick={()=>void markRead(r.id)} className="font-semibold text-[var(--green)]">Open</Link>}{!r.read_at&&<button onClick={()=>void markRead(r.id)} className="font-semibold text-[var(--green)]">Mark read</button>}</div></div></div>):<EmptyState title="You're all caught up" description="New assignments, submissions and class updates will appear here."/>}</div>;
}
