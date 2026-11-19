import { NextResponse } from "next/server";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAuthorizedImport } from "@/lib/youtube-access";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const actor=await requestProfile();if(isResponse(actor))return actor;
 const {id}=await params;
 if(!/^[a-f0-9-]{36}$/i.test(id))return NextResponse.json({error:"Invalid import."},{status:400});
 let job;
 try{job=await loadAuthorizedImport(actor.profile,id);}
 catch{return NextResponse.json({error:"Could not load this playlist import."},{status:503});}
 if(!job)return NextResponse.json({error:"Import not found or not authorized."},{status:404});
 const url=new URL(request.url);
 const page=Math.max(0,Math.min(100,Number.parseInt(url.searchParams.get("page")??"0",10)||0));
 const db=createAdminClient();
 const {data:videos,error}=await db.from("youtube_import_items")
   .select("id,video_id,playlist_position,title,description,duration_seconds,thumbnail_url,availability,selected")
   .eq("college_id",actor.profile.college_id).eq("job_id",id)
   .order("playlist_position",{ascending:true}).range(page*100,page*100+99);
 if(error)return NextResponse.json({error:"Could not load playlist video metadata."},{status:503});
 const existing:{video_id:string;lesson_id:string;playlist_position:number}[]=[];
 if(job.mode==="sync"&&job.target_course_id){
   const {data:sources,error:sourceError}=await db.from("youtube_playlist_sources")
     .select("id").eq("college_id",actor.profile.college_id)
     .eq("course_id",job.target_course_id).eq("playlist_id",job.playlist_id).maybeSingle();
   if(sourceError)return NextResponse.json({error:"Could not check synced course source."},{status:503});
   if(sources){
     for(let start=0;;start+=200){
       const {data,error:linksError}=await db.from("youtube_lesson_sources")
         .select("video_id,lesson_id,playlist_position").eq("college_id",actor.profile.college_id)
         .eq("source_id",sources.id).order("video_id").range(start,start+199);
       if(linksError)return NextResponse.json({error:"Could not check synchronized lectures."},{status:503});
       existing.push(...(data??[]));
       if((data?.length??0)<200)break;
     }
   }
 }
 const map=new Map(existing.map(x=>[x.video_id,x]));
 return NextResponse.json({
   job:{id:job.id,playlist_id:job.playlist_id,title:job.playlist_title,description:job.playlist_description,
     thumbnail:job.playlist_thumbnail,total:job.expected_count,processed:job.processed_count,
     status:job.status,failure:job.failure_message,mode:job.mode,grouping:job.grouping,
     target_course_id:job.target_course_id,next_page:job.next_page_token!==null},
   videos:(videos??[]).map(v=>({...v,
     existing:!!(v.video_id&&map.has(v.video_id)),
     reordered:!!(v.video_id&&map.has(v.video_id)&&map.get(v.video_id)!.playlist_position!==v.playlist_position)})),
   missingFromPlaylist:job.mode==="sync"&&job.status==="review"?existing.filter(old=>
     !(videos??[]).some(v=>v.video_id===old.video_id)
   ).length:null,
   page,has_more:(videos?.length??0)===100,
 });
}
