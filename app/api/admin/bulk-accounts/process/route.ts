import { NextResponse } from "next/server";
import { requestProfile,isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { processClaimedBulkAccounts } from "@/lib/bulk-worker";

export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:Request){
 const ctx=await requestProfile();
 if(isResponse(ctx))return ctx;
 if(ctx.profile.role!=="admin")return NextResponse.json({error:"College admin access required."},{status:403});
 const origin=request.headers.get("origin");
 if(origin){
  try{if(new URL(origin).host!==new URL(request.url).host)return NextResponse.json({error:"Invalid origin."},{status:403});}
  catch{return NextResponse.json({error:"Invalid origin."},{status:403});}
 }
 const body=await request.json().catch(()=>null);
 const batchId=body?.id;
 if(typeof batchId!=="string"||!/^[0-9a-f-]{36}$/i.test(batchId))return NextResponse.json({error:"Valid batch id required."},{status:400});
 if(!process.env.BULK_ACCOUNT_PASSWORD_SECRET||process.env.BULK_ACCOUNT_PASSWORD_SECRET.length<32)
  return NextResponse.json({error:"Bulk account password secret not configured."},{status:503});
 const admin=createAdminClient();
 const {data:batch}=await admin.from("bulk_account_batches").select("id").eq("college_id",ctx.profile.college_id).eq("id",batchId).maybeSingle();
 if(!batch)return NextResponse.json({error:"Batch not found."},{status:404});
 const {data,error}=await admin.rpc("claim_bulk_account_rows_for_batch",{p_college_id:ctx.profile.college_id,p_batch_id:batchId,p_limit:8});
 if(error){
  console.error("Admin bulk claim failed",{code:error.code});
  return NextResponse.json({error:"Bulk job worker unavailable; apply migration 051."},{status:500});
 }
 const result=await processClaimedBulkAccounts(admin,data??[]);
 return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
}
