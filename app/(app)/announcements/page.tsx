import {scopedClasses} from "@/lib/class-scope";
import { istDate, classLabel } from "@/lib/display";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { AnnouncementComposer } from "@/components/academic-workflows";
import { Megaphone } from "lucide-react";
export default async function AnnouncementsPage(){const profile=await requireProfile();const supabase=await createClient();const scoped=await scopedClasses(profile);const classIds=scoped.map(c=>c.id);
  const [classes,announcements]=await Promise.all([classIds.length?supabase.from("classes").select("id,display_name,section,subjects(name,code)").eq("college_id",profile.college_id).in("id",classIds):Promise.resolve({data:[] as any[],error:null}),classIds.length?supabase.from("announcements").select("id,title,body,published_at,class_id,author_id").eq("college_id",profile.college_id).in("class_id",classIds).order("published_at",{ascending:false}):Promise.resolve({data:[] as any[],error:null})]);
  if(classes.error||announcements.error)throw new Error("Could not load class announcements.");
  return <><PageHeader title="Announcements" description={profile.role==="student"?"Updates shared by faculty across your joined classes.":"Share important academic updates with your assigned classes."}/>{profile.role==="student"?<div className="space-y-3">{announcements.data?.length?announcements.data.map(a=><article key={a.id} className="surface p-5"><div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><Megaphone size={16}/></div><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{a.title}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{istDate(a.published_at)} · {classLabel(classes.data?.find(c=>c.id===a.class_id)??{})}</div><p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-[var(--muted)]">{a.body}</p></div></div></article>):<div className="surface"><EmptyState title="No announcements" description="Class updates will appear here when your faculty publishes them."/></div>}</div>:<AnnouncementComposer profile={profile} classes={classes.data??[]} announcements={announcements.data??[]}/>}</>;
}
