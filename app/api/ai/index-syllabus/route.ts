import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { OpenRouterError } from "@/lib/openrouter";
import { extractSyllabusPdf, embedStudyText } from "@/lib/study-document-provider";
import { chunkExtractedPdf } from "@/lib/study-document-text";

export const runtime="nodejs";
export const maxDuration=120;
const schema=z.object({
  syllabus_id:z.string().uuid(),
  use_ocr:z.boolean().default(false),
}).strict();

export async function POST(request:Request){
  const context=await requestProfile();
  if(isResponse(context))return context;
  if(context.profile.role!=="admin"&&context.profile.role!=="faculty")
    return NextResponse.json({error:"Staff role required for PDF indexing."},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid indexing request."},{status:400});
  try{
    const db=createAdminClient();
    const collegeId=context.profile.college_id;
    const {data:syllabus,error:syllabusError}=await db.from("class_syllabi")
      .select("id,class_id,storage_path,file_size").eq("college_id",collegeId)
      .eq("id",parsed.data.syllabus_id).maybeSingle();
    if(syllabusError){
      console.error("Index syllabus lookup failed",{code:syllabusError.code});
      return NextResponse.json({error:"Could not load the selected syllabus."},{status:503});
    }
    if(!syllabus)return NextResponse.json({error:"Syllabus not found."},{status:404});
    if(context.profile.role==="faculty"){
      const {data:assigned,error:permissionError}=await db.from("class_faculty")
        .select("class_id").eq("college_id",collegeId)
        .eq("class_id",syllabus.class_id).eq("faculty_id",context.userId).maybeSingle();
      if(permissionError)return NextResponse.json({error:"Could not check staff class assignment."},{status:503});
      if(!assigned)return NextResponse.json({error:"You are not assigned to this class."},{status:403});
    }
    const prefix=collegeId+"/"+syllabus.class_id+"/";
    if(!syllabus.storage_path.startsWith(prefix)
      ||!syllabus.storage_path.toLowerCase().endsWith(".pdf")
      ||Number(syllabus.file_size)<=0 || Number(syllabus.file_size)>20*1024*1024)
      return NextResponse.json({error:"Invalid PDF storage metadata."},{status:409});
    const {data:signed,error:signError}=await db.storage.from("class-syllabi")
      .createSignedUrl(syllabus.storage_path,240);
    if(signError||!signed?.signedUrl)
      return NextResponse.json({error:"Could not access the selected PDF."},{status:503});
    // Extract actual OpenRouter file-parser annotations, never AI-generated
    // PDF summaries. Scanned documents may require explicitly chosen paid OCR.
    const parsedText=await extractSyllabusPdf(context.profile,signed.signedUrl,parsed.data.use_ocr);
    const chunks=chunkExtractedPdf(parsedText);
    const embeddings:number[][]=[];
    for(let index=0;index<chunks.length;index+=8){
      embeddings.push(...await embedStudyText(context.profile,
        chunks.slice(index,index+8).map((item)=>item.content)));
    }
    const payload=chunks.map((item,index)=>({
      index,page:item.page,content:item.content,hash:parsedText.hash,embedding:embeddings[index],
    }));
    // This RPC checks staff/college permissions again and replaces all chunks
    // in ONE transaction. A failed import retains the previously valid index.
    const {data:count,error:saveError}=await db.rpc("replace_syllabus_text_chunks",{
      p_college_id:collegeId,p_actor_id:context.userId,
      p_syllabus_id:syllabus.id,p_chunks:payload,
    });
    if(saveError){
      console.error("Syllabus vector index save failed",{code:saveError.code});
      return NextResponse.json({error:saveError.code==="PGRST202"||saveError.code==="42883"
        ?"Apply forward SQL migration 036 in Supabase before indexing a PDF."
        :"Could not securely save the index. The previous index was preserved."},{status:503});
    }
    await db.from("activity_logs").insert({
      college_id:collegeId,actor_id:context.userId,
      action:"syllabus.indexed",entity_type:"class_syllabus",entity_id:syllabus.id,
      details:{chunk_count:count,has_verified_pages:parsedText.pageBoundaries,ocr:parsed.data.use_ocr},
    });
    return NextResponse.json({success:true,indexed_chunks:count,
      text_characters:parsedText.text.length,page_numbers_verified:parsedText.pageBoundaries});
  }catch(error){
    if(error instanceof OpenRouterError)
      return NextResponse.json({error:error.message},{status:error.status});
    console.error("Syllabus indexing failed",{reason:error instanceof Error?error.name:"unknown"});
    return NextResponse.json({error:"Could not index this PDF. Check the PDF format, account limits, and migrations."},{status:503});
  }
}
