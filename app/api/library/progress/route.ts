import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { libraryClassAccess } from "@/lib/study-library-access";
export const runtime="nodejs";
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("progress"),material_id:z.string().uuid(),
   page:z.number().int().min(1).max(100000),status:z.enum(["reading","completed"])}).strict(),
 z.object({action:z.literal("bookmark"),material_id:z.string().uuid(),
   page:z.number().int().min(1).max(100000),note:z.string().max(240).default("")}).strict(),
 z.object({action:z.literal("unbookmark"),material_id:z.string().uuid(),
   page:z.number().int().min(1).max(100000)}).strict(),
]);
export async function POST(request:Request){
 const actor=await requestProfile();if(isResponse(actor))return actor;
 if(actor.profile.role!=="student")
   return NextResponse.json({error:"Reading progress belongs to student accounts."},{status:403});
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid reading progress or bookmark."},{status:400});
 const body=parsed.data,db=createAdminClient(),college=actor.profile.college_id;
 const {data:material,error}=await db.from("study_materials")
   .select("id,class_id,status").eq("id",body.material_id).eq("college_id",college).maybeSingle();
 if(error)return NextResponse.json({error:"Could not verify the material."},{status:503});
 if(!material||material.status!=="published")return NextResponse.json({error:"Material not available."},{status:404});
 try{if(!await libraryClassAccess(actor,material.class_id))
   return NextResponse.json({error:"This file is not in your active class."},{status:403});}
 catch{return NextResponse.json({error:"Could not verify enrollment."},{status:503});}
 if(body.action==="progress"){
   // Do not undo completion from a later session when an old page saves.
   const {data:existing,error:existingError}=await db.from("study_material_progress")
     .select("status,completed_at").eq("college_id",college).eq("material_id",material.id)
     .eq("student_id",actor.userId).maybeSingle();
   if(existingError)return NextResponse.json({error:"Could not check current progress."},{status:503});
   const completed=body.status==="completed"||existing?.status==="completed";
   const {error:saveError}=await db.from("study_material_progress").upsert({
     college_id:college,material_id:material.id,student_id:actor.userId,
     last_page:body.page,status:completed?"completed":"reading",
     completed_at:completed?existing?.completed_at??new Date().toISOString():null,
     updated_at:new Date().toISOString(),
   },{onConflict:"material_id,student_id"});
   if(saveError)return NextResponse.json({error:"Could not save reading progress. Apply SQL 041."},{status:503});
   return NextResponse.json({success:true,completed});
 }
 if(body.action==="unbookmark"){
   const {error:deleteError}=await db.from("study_material_bookmarks").delete()
     .eq("college_id",college).eq("material_id",material.id)
     .eq("student_id",actor.userId).eq("page_number",body.page);
   if(deleteError)return NextResponse.json({error:"Could not remove bookmark."},{status:503});
   return NextResponse.json({success:true});
 }
 const {error:saveError}=await db.from("study_material_bookmarks").upsert({
   college_id:college,material_id:material.id,student_id:actor.userId,
   page_number:body.page,note:body.note,
 },{onConflict:"material_id,student_id,page_number"});
 if(saveError)return NextResponse.json({error:"Could not save bookmark."},{status:503});
 return NextResponse.json({success:true});
}
