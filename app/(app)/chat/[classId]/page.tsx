import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { ChatComposer } from "@/components/chat-composer";
import { format } from "date-fns";

export default async function ClassChatPage({params}:{params:Promise<{classId:string}>}) {
 const {classId}=await params; const profile=await requireProfile(); const db=await createClient();
 const {data:roomRaw,error:roomError}=await db.from("classes").select("id,display_name,section,subjects(name)").eq("id",classId).single();
 const room: any = roomRaw;
 if(roomError||!room) return <EmptyState title="Class not found" description="You may not have permission to access this classroom." />;
 const [{data:faculty},{data:enrollment}] = await Promise.all([
  db.from("class_faculty").select("class_id").eq("class_id",classId).eq("faculty_id",profile.id).maybeSingle(),
  db.from("class_enrollments").select("id").eq("class_id",classId).eq("student_id",profile.id).eq("status","active").maybeSingle()
 ]);
 if(profile.role!=="admin"&&!faculty&&!enrollment) return <EmptyState title="Access denied" description="You are not a member of this class." />;
 const {data:messages,error}=await db.from("class_messages").select("id,body,sender_id,created_at,profiles:sender_id(full_name)").eq("class_id",classId).is("deleted_at",null).order("created_at").limit(100);
 if(error) console.error("Unable to load class messages", error);
 return <><PageHeader title="Class chat" description={`${room.display_name} · ${room.subjects?.name ?? "Course"} · Section ${room.section}`}/>
 <section className="surface p-4 sm:p-6"><div className="max-h-[58vh] space-y-3 overflow-y-auto">{messages?.length?messages.map((m:any)=><div key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.sender_id===profile.id?"ml-auto bg-[var(--green-soft)]":"bg-[var(--surface-2)]"}`}><div className="text-[10px] font-semibold text-[var(--muted)]">{m.profiles?.full_name ?? "Member"} · {format(new Date(m.created_at),"h:mm a")}</div><p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p></div>):<EmptyState title="Start the conversation" description="Share a question, reminder or helpful resource with your class."/>}</div><div className="mt-4 border-t border-[var(--line)] pt-4"><ChatComposer classId={classId}/></div></section></>;
}
