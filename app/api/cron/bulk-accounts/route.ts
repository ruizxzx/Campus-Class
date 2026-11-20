import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { bulkPassword } from "@/lib/bulk-accounts";
import { provisionMember } from "@/lib/member-provisioning";

export const runtime="nodejs";
export const maxDuration=60;

function authorized(request: Request) {
 const secret=process.env.CRON_SECRET;
 const bearer=request.headers.get("authorization") ?? "";
 const supplied=bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
 if(!secret||secret.length<20||supplied.length!==secret.length) return false;
 return timingSafeEqual(Buffer.from(supplied),Buffer.from(secret));
}

// Invoke from a trusted scheduler every minute. All state is in PostgreSQL.
export async function GET(request: Request){
 if(!authorized(request)) return NextResponse.json({error:"Unauthorized"},{status:401});
 if(!process.env.BULK_ACCOUNT_PASSWORD_SECRET || process.env.BULK_ACCOUNT_PASSWORD_SECRET.length<32){
  return NextResponse.json({error:"Bulk credential secret is not configured."},{status:503});
 }
 const admin=createAdminClient();
 const {data:rows,error}=await admin.rpc("claim_bulk_account_rows",{p_limit:8});
 if(error){
  console.error("Bulk row claim failed",{code:error.code});
  return NextResponse.json({error:"Could not claim queued rows; apply migration 051."},{status:500});
 }
 let created=0,existing=0,failed=0,remaining=0;
 for(const row of rows??[]){
  // Retries may happen after a worker crash; Auth uniqueness prevents duplicate identities.
  let result:Awaited<ReturnType<typeof provisionMember>>;
  try {
   const {data:batch,error:batchError}=await admin.from("bulk_account_batches").select("created_by").eq("id",row.batch_id).eq("college_id",row.college_id).single();
   if(batchError||!batch) throw new Error("Batch owner unavailable.");
   result=await provisionMember(admin,row.college_id,batch.created_by,{
    email:row.email,full_name:row.full_name,role:row.role,
    password:bulkPassword(row.id),send_setup_email:false,
   },row.synthetic);
  }catch {
   result={status:"failed",reason:"Temporary server error."};
  }
  if(result.status==="created") created++;
  else if(result.status==="existing") existing++;
  else failed++;
  // A transient error is retried up to 3 times, then remains available for manual retry.
  const transient=result.status==="failed" && row.attempts<3 && result.reason==="Temporary server error.";
  const {error:updateError}=await admin.from("bulk_account_rows").update({
    status:transient?"pending":result.status,
    reason:result.reason??result.warning??null,
    auth_user_id:result.userId??null,
    locked_at:null,
  }).eq("id",row.id).eq("college_id",row.college_id).eq("status","processing");
  if(updateError) {
   console.error("Bulk result persistence failed",{code:updateError.code});
   remaining++;
  }
 }
 return NextResponse.json({processed:(rows??[]).length,created,existing,failed,needs_recovery:remaining},
  {headers:{"Cache-Control":"no-store"}});
}
