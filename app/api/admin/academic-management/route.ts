import {NextResponse} from "next/server";
import {z} from "zod";
import {requestProfile,isResponse} from "@/lib/http";
import {createAdminClient} from "@/lib/supabase/admin";
export const runtime="nodejs";
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("semester"),academic_year:z.string().trim().regex(/^\d{4}(?:-\d{4})?$/),semester:z.coerce.number().int().min(1).max(12)}),
 z.object({action:z.literal("member"),member_id:z.string().uuid(),role:z.enum(["faculty","student"]),department_id:z.union([z.string().uuid(),z.literal("")])}),
 z.object({action:z.literal("enrol"),class_id:z.string().uuid(),student_id:z.string().uuid(),status:z.enum(["active","removed"])}),
 z.object({action:z.literal("revoke"),certificate_id:z.string().uuid()}),
 z.object({action:z.literal("branding"),template:z.enum(["classic","modern"]),logo_data:z.string().max(350000).optional(),remove_logo:z.boolean().optional()})
]);
export async function POST(request:Request){
 const actor=await requestProfile();if(isResponse(actor))return actor;
 if(actor.profile.role!=="admin")return NextResponse.json({error:"College administrator required."},{status:403});
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Check the selected values and try again."},{status:400});
 const b=parsed.data,db=createAdminClient(),cid=actor.profile.college_id;
 let error:{code?:string;message?:string}|null=null;
 if(b.action==="semester")({error}=await db.from("academic_semesters").insert({college_id:cid,academic_year:b.academic_year,semester:b.semester}));
 else if(b.action==="member")({error}=await db.rpc("admin_update_member",{p_college:cid,p_actor:actor.userId,p_member:b.member_id,p_role:b.role,p_department:b.department_id||null}));
 else if(b.action==="enrol"){
  const [cls,student]=await Promise.all([db.from("classes").select("id").eq("college_id",cid).eq("id",b.class_id).eq("is_active",true).maybeSingle(),db.from("profiles").select("id").eq("college_id",cid).eq("id",b.student_id).eq("role","student").eq("status","active").maybeSingle()]);
  if(cls.error||student.error)return NextResponse.json({error:"Could not verify membership."},{status:503});
  if(!cls.data||!student.data)return NextResponse.json({error:"Choose an active class and student in this college."},{status:403});
  if(b.status==="removed")({error}=await db.from("class_enrollments").update({status:"removed"}).eq("college_id",cid).eq("class_id",b.class_id).eq("student_id",b.student_id));
  else {const existing=await db.from("class_enrollments").select("id,status").eq("college_id",cid).eq("class_id",b.class_id).eq("student_id",b.student_id).maybeSingle();
   if(existing.error)error=existing.error;
   else if(existing.data){if(existing.data.status!=="active")({error}=await db.from("class_enrollments").update({status:"active",enrolled_at:new Date().toISOString()}).eq("college_id",cid).eq("id",existing.data.id));}
   else ({error}=await db.from("class_enrollments").insert({college_id:cid,class_id:b.class_id,student_id:b.student_id,status:"active"}));}
 }else if(b.action==="revoke")({error}=await db.from("academic_certificates").update({revoked_at:new Date().toISOString()}).eq("college_id",cid).eq("id",b.certificate_id).is("revoked_at",null));
 else {
  const row:Record<string,unknown>={college_id:cid,template:b.template};
  if(b.remove_logo)row.logo_data=null;
  else if(b.logo_data){const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(b.logo_data);if(!match)return NextResponse.json({error:"Choose a PNG or JPEG logo."},{status:400});
    const bytes=Buffer.from(match[2],"base64");const signature=match[1]==="png"?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(!signature||bytes.length>250000)return NextResponse.json({error:"Choose a valid logo under 250 KB."},{status:400});row.logo_data=b.logo_data;}
  ({error}=await db.from("college_certificate_branding").upsert(row,{onConflict:"college_id"}));
 }
 if(error){console.error("Academic admin operation failed",{action:b.action,code:error.code});return NextResponse.json({error:error.code==="23505"?"This record already exists.":error.code==="22023"?error.message:"Could not save. Verify SQL migration 054 and try again."},{status:error.code==="22023"||error.code==="23505"?400:503});}
 return NextResponse.json({success:true});
}
