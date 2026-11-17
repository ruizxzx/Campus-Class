import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

export default async function ChatIndexPage() {
 const profile=await requireProfile(); const db=await createClient();
 const {data:classes,error}=await db.from("classes").select("id,display_name,section,subjects(name,code),class_enrollments(count)").eq("college_id",profile.college_id).eq("is_active",true).order("display_name");
 if(error) console.error("Unable to load your classes", error);
 const {data:faculty}=await db.from("class_faculty").select("class_id").eq("faculty_id",profile.id);
 const {data:enrollments}=await db.from("class_enrollments").select("class_id").eq("student_id",profile.id).eq("status","active");
 const permitted=new Set([...(faculty??[]).map(x=>x.class_id),...(enrollments??[]).map(x=>x.class_id)]);
 const visible=profile.role==="admin"?(classes??[]):(classes??[]).filter(x=>permitted.has(x.id));
 return <><PageHeader title="Class chat" description="Conversations stay inside each college classroom."/><div className="grid gap-3 md:grid-cols-2">{visible.length?visible.map((c:any)=><Link key={c.id} href={`/chat/${c.id}`} className="surface flex items-center gap-3 p-4 transition hover:-translate-y-0.5"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--green-soft)] text-[var(--green)]"><MessageCircle size={19}/></div><div><div className="text-sm font-semibold">{c.display_name}</div><div className="mt-1 text-xs text-[var(--muted)]">{c.subjects?.name} · Section {c.section}</div></div></Link>):<EmptyState title="No active classrooms" description="Join or get assigned to a class to use class chat."/>}</div></>;
}
