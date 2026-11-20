"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Bell, CheckCheck } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { format } from "date-fns";
type NotificationRow={id:string;type:string;title:string;body:string|null;href:string|null;read_at:string|null;created_at:string};
export function NotificationList({ initial, userId }: { initial: NotificationRow[]; userId:string }) {
  const [rows,setRows]=useState<NotificationRow[]>(initial);
  const [syncError,setSyncError]=useState(false);
  const refresh=useCallback(async()=>{
    const {data,error}=await createClient().from("notifications")
      .select("id,type,title,body,href,read_at,created_at").eq("user_id",userId)
      .order("created_at",{ascending:false}).limit(50);
    if(error){setSyncError(true);return;}
    setSyncError(false);setRows((data??[]) as NotificationRow[]);
  },[userId]);
  useEffect(()=>{
    const db=createClient();
    const channel=db.channel("notifications-inbox-"+userId)
      .on("postgres_changes",{event:"*",schema:"public",table:"notifications",
        filter:"user_id=eq."+userId},()=>{void refresh();}).subscribe();
    const interval=window.setInterval(()=>{void refresh();},20_000);
    return()=>{window.clearInterval(interval);void db.removeChannel(channel);};
  },[userId,refresh]);

  async function markRead(id:string){const {error}=await createClient().from("notifications").update({read_at:new Date().toISOString()}).eq("id",id).eq("user_id",userId);if(error){toast.error("Could not update notification.");return;}setRows(rs=>rs.map(r=>r.id===id?{...r,read_at:new Date().toISOString()}:r));}
  async function markAll(){const ids=rows.filter(r=>!r.read_at).map(r=>r.id);if(!ids.length)return;const {error}=await createClient().from("notifications").update({read_at:new Date().toISOString()}).in("id",ids).eq("user_id",userId);if(error)toast.error("Could not update notifications.");else{setRows(rs=>rs.map(r=>({...r,read_at:new Date().toISOString()})));toast.success("All notifications marked as read.");}}
  return <div className="surface p-5 sm:p-6">{syncError?<p role="status" className="mb-3 text-xs text-amber-700">Could not refresh notifications. Showing the last loaded items.</p>:null}<div className="mb-4 flex items-center justify-between"><div className="text-sm font-semibold">Recent notifications</div><button onClick={()=>void markAll()} className="btn-secondary !px-3 !py-2 text-[10px]"><CheckCheck size={13}/>Mark all read</button></div>{rows.length?rows.map(r=><div key={r.id} className={`flex items-start gap-3 border-t border-[var(--line)] py-4 first:border-0 ${r.read_at?"opacity-65":""}`}><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><Bell size={15}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="text-xs font-semibold">{r.title}</div>{!r.read_at&&<span className="h-1.5 w-1.5 rounded-full bg-[var(--orange)]"/>}</div>{r.body&&<p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{r.body}</p>}<div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--muted)]"><span>{format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</span>{r.href&&<Link href={r.href} onClick={()=>void markRead(r.id)} className="font-semibold text-[var(--green)]">Open</Link>}{!r.read_at&&<button onClick={()=>void markRead(r.id)} className="font-semibold text-[var(--green)]">Mark read</button>}</div></div></div>):<EmptyState title="You're all caught up" description="New assignments, submissions and class updates will appear here."/>}</div>;
}
