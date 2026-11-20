import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestProfile, isResponse } from "@/lib/http";
import { inviteSchema } from "@/lib/validators";
import { provisionMember } from "@/lib/member-provisioning";

export const runtime = "nodejs";
export async function POST(request: Request) {
 const context=await requestProfile();
 if(isResponse(context))return context;
 if(context.profile.role!=="admin")return NextResponse.json({error:"Only college administrators can create member accounts."},{status:403});
 const parsed=inviteSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid account details."},{status:400});
 const result=await provisionMember(createAdminClient(),context.profile.college_id,context.userId,parsed.data);
 if(result.status==="existing")return NextResponse.json({error:"This email is already registered. Use the existing account or reset its password."},{status:409});
 if(result.status==="failed")return NextResponse.json({error:result.reason??"Could not create the account."},{status:500});
 return NextResponse.json({
  success:true,
  message:result.warning?.includes("Password setup email requested.")
   ?"Account created. A password-setup email was requested. Share the temporary password only if needed."
   :"Account created. Share the temporary password securely and ask the member to change it in Settings.",
  email_sent:result.warning?.includes("Password setup email requested.")??false,
  warning:result.warning?.replace("Password setup email requested.","").trim()||undefined,
 },{status:201});
}
