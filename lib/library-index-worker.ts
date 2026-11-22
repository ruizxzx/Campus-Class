import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractSyllabusPdf } from "@/lib/study-document-provider";
import { chunkExtractedPdf } from "@/lib/study-document-text";
import { OpenRouterError } from "@/lib/openrouter";
import type { Profile } from "@/types/database";

type IndexJob = {
  job_version_id:string;
  job_college_id:string;
  job_material_id:string;
  job_attempts:number;
};

async function indexOne(job:IndexJob) {
  const db=createAdminClient();
  const versionResult=await db.from("study_material_versions")
    .select("id,version,mime_type,file_size,storage_path,indexed_at,created_by")
    .eq("college_id",job.job_college_id).eq("material_id",job.job_material_id)
    .eq("id",job.job_version_id).maybeSingle();
  const materialResult=await db.from("study_materials")
    .select("id,status,current_version,class_id")
    .eq("college_id",job.job_college_id).eq("id",job.job_material_id)
    .maybeSingle();
  const version=versionResult.data,material=materialResult.data;
  let message="";
  try {
    if(versionResult.error||materialResult.error||!version||!material)
      throw new Error("Indexed document metadata is unavailable.");
    if(material.status!=="published"||material.current_version!==version.version)
      throw new Error("This version is no longer the current published document.");
    if(version.indexed_at) {
      await db.from("study_material_index_jobs").update({
        status:"indexed",error_message:null,updated_at:new Date().toISOString(),
        finished_at:new Date().toISOString(),
      }).eq("college_id",job.job_college_id).eq("version_id",job.job_version_id);
      return {version_id:job.job_version_id,status:"indexed",cached:true};
    }
    if(!version.storage_path.startsWith(job.job_college_id+"/")
      || !version.storage_path.includes("/"+material.id+"/"+version.id+"/"))
      throw new Error("Private document storage metadata did not match its tenant and version.");
    const {data:author}=await db.from("profiles").select("*")
      .eq("college_id",job.job_college_id).eq("id",version.created_by)
      .eq("status","active").maybeSingle();
    let profile=author as Profile|null;
    if(!profile){
      const {data:admin}=await db.from("profiles").select("*")
        .eq("college_id",job.job_college_id).eq("role","admin")
        .eq("status","active").limit(1).maybeSingle();
      profile=admin as Profile|null;
    }
    if(!profile)throw new Error("No active college staff account is available for indexing.");
    let text:string;
    let chunks:{content:string;page:number|null}[];
    if(version.mime_type==="application/pdf"){
      const {data:signed,error}=await db.storage.from("study-library")
        .createSignedUrl(version.storage_path,240);
      if(error||!signed?.signedUrl)throw new Error("The private PDF could not be accessed.");
      const pdf=await extractSyllabusPdf(profile,signed.signedUrl,false);
      text=pdf.text;
      chunks=chunkExtractedPdf(pdf);
    }else if(version.mime_type==="text/plain"){
      const {data:blob,error}=await db.storage.from("study-library").download(version.storage_path);
      if(error||!blob)throw new Error("The private TXT file could not be accessed.");
      if(blob.size>120000)throw new Error("TXT files over 120 KB cannot be indexed automatically.");
      text=(await blob.text()).trim();
      if(text.length<20)throw new Error("The TXT file did not contain enough text.");
      chunks=chunkExtractedPdf({hash:"library-text",text,pageBoundaries:false});
    }else throw new Error("Only PDF and TXT documents support AI indexing.");
    const {error}=await db.rpc("replace_study_material_index",{
      p_college_id:job.job_college_id,
      p_material_id:job.job_material_id,
      p_version_id:job.job_version_id,
      p_extracted_text:text,
      p_chunks:chunks.map(c=>({content:c.content,page:c.page})),
    });
    if(error){
      console.error("Queued library index database error",{code:error.code});
      throw new Error("Verified document text could not be saved.");
    }
    // SQL 055 also marks this job completed transactionally from indexed_at.
    const {error:doneError}=await db.from("study_material_index_jobs").update({
      status:"indexed",error_message:null,updated_at:new Date().toISOString(),
      finished_at:new Date().toISOString(),
    }).eq("college_id",job.job_college_id).eq("version_id",job.job_version_id);
    if(doneError)console.error("Queued library index completion update failed",{code:doneError.code});
    return {version_id:job.job_version_id,status:"indexed",chunks:chunks.length};
  }catch(error){
    message=error instanceof OpenRouterError?error.message:
      error instanceof Error?error.message:"The indexing worker failed.";
    const status=job.job_attempts>=4?"failed":"retry";
    const delayMs=Math.min(job.job_attempts,3)*3600000;
    const {error:writeError}=await db.from("study_material_index_jobs").update({
      status,error_message:message.slice(0,400),updated_at:new Date().toISOString(),
      next_attempt_at:new Date(Date.now()+delayMs).toISOString(),
      ...(status==="failed"?{finished_at:new Date().toISOString()}:{}),
    }).eq("college_id",job.job_college_id).eq("version_id",job.job_version_id);
    if(writeError)console.error("Queued library index failure status could not be saved",{code:writeError.code});
    console.error("Queued library index failed",{reason:error instanceof OpenRouterError?"provider":"processing",attempt:job.job_attempts});
    return {version_id:job.job_version_id,status};
  }
}

/** Run only via CRON_SECRET authenticated server calls; database lease prevents duplicate work. */
export async function processQueuedLibraryIndexes(limit=3) {
  const db=createAdminClient();
  const {data,error}=await db.rpc("claim_study_material_index_jobs",{p_limit:limit});
  if(error){
    console.error("Library index claim failed",{code:error.code});
    throw new Error("Library indexing queue unavailable. Apply forward SQL 055.");
  }
  const jobs=(data??[]) as IndexJob[];
  return Promise.all(jobs.map(indexOne));
}