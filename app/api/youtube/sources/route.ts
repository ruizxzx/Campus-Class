import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageYoutubeSubject } from "@/lib/youtube-access";
export const runtime="nodejs";
const schema=z.object({source_id:z.string().uuid(),sync_enabled:z.boolean(),
 automatic_additions:z.boolean()}).strict();
export async function POST(request:Request){
 const actor=await requestProfile();if(isResponse(actor))return actor;
 if(actor.profile.role==="student")return NextResponse.json({error:"Only staff manage playlist syncing."},{status:403});
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid playlist sync controls."},{status:400});
 const db=createAdminClient(),college=actor.profile.college_id;
 const {data:source,error}=await db.from("youtube_playlist_sources")
   .select("id,course_id,courses!inner(subject_id)")
   .eq("college_id",college).eq("id",parsed.data.source_id).maybeSingle();
 if(error||!source)return NextResponse.json({error:"Playlist connection not found."},{status:404});
 const course=Array.isArray(source.courses)?source.courses[0]:source.courses;
 try{if(!course||!await canManageYoutubeSubject(actor.profile,course.subject_id,source.course_id))
   return NextResponse.json({error:"You cannot manage this course."},{status:403});}
 catch{return NextResponse.json({error:"Could not verify subject assignment."},{status:503});}
 const {error:saveError}=await db.from("youtube_playlist_sources").update({
   sync_enabled:parsed.data.sync_enabled,automatic_additions:parsed.data.automatic_additions,
 }).eq("college_id",college).eq("id",source.id);
 if(saveError)return NextResponse.json({error:"Could not save playlist sync preferences."},{status:503});
 return NextResponse.json({success:true});
}
