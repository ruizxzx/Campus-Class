"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Send } from "lucide-react";
import { toast } from "sonner";

export function ChatComposer({classId}:{classId:string}) {
 const [body,setBody]=useState(""); const [sending,setSending]=useState(false); const router=useRouter();
 async function send() {
  const text=body.trim(); if(!text||sending) return;
  setSending(true);
  const db=createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user){toast.error("Please sign in again");setSending(false);return;}
  const {data:profile}=await db.from("profiles").select("college_id").eq("id",user.id).single();
  const {error}=await db.from("class_messages").insert({college_id:profile?.college_id,class_id:classId,sender_id:user.id,body:text});
  if(error){toast.error(error.message);setSending(false);return;}
  setBody("");setSending(false);router.refresh();
 }
 return <div className="flex items-end gap-2"><textarea value={body} onChange={e=>setBody(e.target.value)} rows={2} maxLength={5000} placeholder="Write a message…" className="input min-h-12 flex-1 resize-y"/><button onClick={send} disabled={!body.trim()||sending} className="btn-primary h-11 px-4"><Send size={15}/><span className="sr-only">Send</span></button></div>;
}
