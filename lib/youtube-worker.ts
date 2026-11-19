import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPlaylistMeta, fetchPlaylistPage, YouTubeApiError } from "@/lib/youtube-data";

type Job={id:string;college_id:string;playlist_id:string;created_by:string;
  attempts:number;processed_count:number;next_page_token:string|null;
  playlist_title:string|null;mode:string;target_course_id:string|null};
async function applyExplicitlyEnabledNewVideos(job:Job){
 if(job.mode!=="sync"||!job.target_course_id)return false;
 const db=createAdminClient();
 const {data:source,error:sourceError}=await db.from("youtube_playlist_sources")
   .select("id,automatic_additions,sync_enabled")
   .eq("college_id",job.college_id).eq("course_id",job.target_course_id)
   .eq("playlist_id",job.playlist_id).maybeSingle();
 if(sourceError||!source?.automatic_additions||!source.sync_enabled)return false;
 const oldIds=new Set<string>();
 for(let start=0;;start+=200){
   const {data,error}=await db.from("youtube_lesson_sources").select("video_id")
     .eq("college_id",job.college_id).eq("course_id",job.target_course_id)
     .order("video_id").range(start,start+199);
   if(error)throw new Error("Could not check existing playlist video references.");
   for(const item of data??[])oldIds.add(item.video_id);
   if((data?.length??0)<200)break;
 }
 const fresh:{id:string;video_id:string;title:string;description:string}[]=[];
 for(let start=0;;start+=200){
   const {data,error}=await db.from("youtube_import_items")
     .select("id,video_id,title,description").eq("college_id",job.college_id)
     .eq("job_id",job.id).eq("availability","available")
     .order("playlist_position").range(start,start+199);
   if(error)throw new Error("Could not load newly added videos.");
   for(const item of data??[])if(item.video_id&&!oldIds.has(item.video_id)){
     oldIds.add(item.video_id);fresh.push(item as typeof fresh[number]);
   }
   if((data?.length??0)<200)break;
 }
 // A playlist can also change order or remove content. Without newly added
 // videos it requires faculty review, and we never delete existing lessons.
 if(!fresh.length)return false;
 if(fresh.length>500)return false; // Explicit review of unusually large changes.
 const {error}=await db.rpc("apply_youtube_playlist_import",{
   p_job_id:job.id,p_actor:job.created_by,
   p_title:job.playlist_title??"YouTube playlist",
   p_description:"",
   p_publish:true,p_overwrite_titles:false,
   p_modules:[{title:"New playlist lectures · "+new Date().toISOString().slice(0,10),
     lessons:fresh.map(video=>({item_id:video.id,title:video.title,
       description:video.description}))}],
 });
 if(error)throw new Error("Automatic additions could not be applied transactionally.");
 return true;
}
export async function processYoutubeJob(job:Job):Promise<{status:string;processed:number;error?:string}>{
 const db=createAdminClient();
 try{
   const meta=job.playlist_title?null:await fetchPlaylistMeta(job.playlist_id);
   const page=await fetchPlaylistPage(job.playlist_id,job.next_page_token);
   // Only process at most one YouTube page (50 videos) per serverless invocation.
   // This bounds request time, quota and memory. A browser or cron can resume.
   const ids=page.videos.map(x=>x.videoId).filter((id):id is string=>!!id);
   let existing=new Set<string>();
   if(ids.length&&job.processed_count>0){
     const {data,error}=await db.from("youtube_import_items")
       .select("video_id").eq("college_id",job.college_id).eq("job_id",job.id)
       .in("video_id",ids).lt("playlist_position",job.processed_count).limit(200);
     if(error)throw new Error("Unable to check duplicate playlist entries.");
     existing=new Set((data??[]).map(x=>x.video_id));
   }
   const seen=new Set(existing);
   const rows=page.videos.map(video=>{
     const duplicate=video.videoId&&seen.has(video.videoId);
     if(video.videoId)seen.add(video.videoId);
     const availability=duplicate?"unavailable":video.availability;
     return {
       college_id:job.college_id,job_id:job.id,
       playlist_position:video.position,video_id:video.videoId,
       title:video.title,description:video.description,
       duration_seconds:video.durationSeconds,thumbnail_url:video.thumbnailUrl,
       availability,selected:availability==="available",fetched_at:new Date().toISOString(),
     };
   });
   if(rows.length){
     const {error:writeError}=await db.from("youtube_import_items")
       .upsert(rows,{onConflict:"job_id,playlist_position"});
     if(writeError)throw new Error("Could not safely store imported YouTube lecture metadata.");
   }
   const next=page.nextPageToken;
   const {error:saveError}=await db.from("youtube_import_jobs").update({
     playlist_title:meta?.title??job.playlist_title,
     playlist_description:meta?.description??undefined,
     playlist_thumbnail:meta?.thumbnail??undefined,
     expected_count:meta?.count??page.total,
     processed_count:job.processed_count+rows.length,
     next_page_token:next,
     status:next?"queued":"review",attempts:0,lock_expires_at:null,
     updated_at:new Date().toISOString(),
     ...(next?{}:{completed_at:new Date().toISOString()}),
   }).eq("id",job.id).eq("college_id",job.college_id).eq("status","processing");
   if(saveError)throw new Error("Could not update playlist import checkpoint.");
   if(!next&&job.mode==="sync"){
     try{
       const applied=await applyExplicitlyEnabledNewVideos(job);
       if(applied)return {status:"applied",processed:job.processed_count+rows.length};
     }catch(error){
       // Keep the reviewable snapshot. The job is not lost if auto-apply fails.
       console.error("Automatic YouTube additions require manual review",{
         job:job.id,reason:error instanceof Error?error.message:"unknown",
       });
     }
   }
   return {status:next?"queued":"review",processed:job.processed_count+rows.length};
 }catch(error){
   const failure=error instanceof YouTubeApiError?error:
     new YouTubeApiError("The playlist import could not be saved; retry.",503,true);
   console.error("YouTube import failed",{job:job.id,code:failure.status,retryable:failure.retryable});
   const retryable=failure.retryable&&failure.status!==429&&job.attempts<8;
   await db.from("youtube_import_jobs").update({
     status:retryable?"queued":"failed",failure_code:String(failure.status),
     failure_message:failure.message.slice(0,400),lock_expires_at:null,
     updated_at:new Date().toISOString(),
   }).eq("id",job.id).eq("college_id",job.college_id);
   return {status:retryable?"queued":"failed",processed:job.processed_count,error:failure.message};
 }
}
export async function processSpecificYoutubeJob(id:string){
 const db=createAdminClient();
 const {data, error}=await db.rpc("claim_specific_youtube_import_job",{p_job:id});
 if(error)throw new Error("Cannot claim import job. Apply forward SQL 046.");
 const job=Array.isArray(data)?data[0]:null;
 if(!job)return {status:"busy",processed:0};
 return processYoutubeJob(job as Job);
}
export async function processQueuedYoutubeJobs(limit=2){
 const db=createAdminClient();
 const {data,error}=await db.rpc("claim_youtube_import_jobs",{p_limit:Math.max(1,Math.min(limit,5))});
 if(error)throw new Error("Could not claim queued YouTube jobs. Apply SQL 046.");
 const results=[];
 for(const job of data??[])results.push(await processYoutubeJob(job as Job));
 return results;
}
