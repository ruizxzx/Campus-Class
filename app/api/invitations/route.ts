import { NextResponse } from "next/server";
import {z} from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestProfile, isResponse } from "@/lib/http";
import { inviteSchema } from "@/lib/validators";
import { provisionMember } from "@/lib/member-provisioning";

export const runtime = "nodejs";
export async function POST(request: Request) {
 const context=await requestProfile();
 if(isResponse(context))return context;
 if(context.profile.role!=="admin")return NextResponse.json({error:"Only college administrators can create member accounts."},{status:403});
 const parsed=inviteSchema.extend({department_id:z.string().uuid().nullable().optional()}).safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid account details."},{status:400});
 const db=createAdminClient();
 if(parsed.data.department_id){
  const {data,error}=await db.from("departments").select("id").eq("college_id",context.profile.college_id).eq("id",parsed.data.department_id).maybeSingle();
  if(error||!data)return NextResponse.json({error:"Choose a department in your college."},{status:400});
 }
 const result=await provisionMember(db,context.profile.college_id,context.userId,parsed.data);
 if(result.status==="existing")return NextResponse.json({error:"This email is already registered. Use the existing account or reset its password."},{status:409});
 if(result.status==="failed")return NextResponse.json({error:result.reason??"Could not create the account."},{status:500});
 let departmentWarning="";
 if(parsed.data.department_id&&result.userId){
  const {error}=await db.rpc("admin_update_member",{p_college:context.profile.college_id,p_actor:context.userId,p_member:result.userId,p_role:parsed.data.role,p_department:parsed.data.department_id});
  if(error)departmentWarning="Account created; department could not be assigned. Use the member editor after applying SQL 054.";
 }
 return NextResponse.json({
  success:true,
  message:result.warning?.includes("Password setup email requested.")
   ?"Account created. A password-setup email was requested. Share the temporary password only if needed."
   :"Account created. Share the temporary password securely and ask the member to change it in Settings.",
  email_sent:result.warning?.includes("Password setup email requested.")??false,
  warning:[result.warning?.replace("Password setup email requested.","").trim(),departmentWarning].filter(Boolean).join(" ")||undefined,
 },{status:201});
}
