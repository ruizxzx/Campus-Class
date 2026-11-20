"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {Bell} from "lucide-react";
import {createClient} from "@/lib/supabase/client";

/** Realtime unread count with periodic refresh when Realtime publication is unavailable. */
export function NotificationBell({userId}:{userId:string}){
 const [unread,setUnread]=useState<number|null>(null);
 const load=useCallback(async()=>{
   const {count,error}=await createClient().from("notifications")
     .select("id",{count:"exact",head:true})
     .eq("user_id",userId).is("read_at",null);
   if(!error)setUnread(count??0);
 },[userId]);
 useEffect(()=>{
   void load();
   const db=createClient();
   const channel=db.channel("notifications-bell-"+userId)
     .on("postgres_changes",{event:"*",schema:"public",table:"notifications",
        filter:"user_id=eq."+userId},()=>{void load();}).subscribe();
   const interval=window.setInterval(()=>{void load();},20_000);
   return()=>{window.clearInterval(interval);void db.removeChannel(channel);};
 },[userId,load]);
 return <Link href="/notifications"
   aria-label={unread?unread+" unread notifications":"Notifications"}
   className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface-2)]">
   <Bell size={18}/>
   {unread!==null&&unread>0?<span aria-hidden="true"
     className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
     {unread>99?"99+":unread}
   </span>:null}
 </Link>;
}
