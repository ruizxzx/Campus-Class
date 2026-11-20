import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { processClaimedBulkAccounts } from "@/lib/bulk-worker";

export const runtime="nodejs";
export const maxDuration=60;
function authorized(request: Request) {
 const secret=process.env.CRON_SECRET;
 const bearer=request.headers.get("authorization")??"";
 const supplied=bearer.startsWith("Bearer ")?bearer.slice(7):"";
 return !!secret && secret.length>=20 && supplied.length===secret.length
   && timingSafeEqual(Buffer.from(supplied),Buffer.from(secret));
}
// Can be invoked by an external scheduler. The queue stays durable if no scheduler is configured.
export async function GET(request: Request){
 if(!authorized(request))return NextResponse.json({error:"Unauthorized"},{status:401});
 if(!process.env.BULK_ACCOUNT_PASSWORD_SECRET || process.env.BULK_ACCOUNT_PASSWORD_SECRET.length<32)
  return NextResponse.json({error:"Bulk account password secret is not configured."},{status:503});
 const admin=createAdminClient();
 const {data,error}=await admin.rpc("claim_bulk_account_rows",{p_limit:8});
 if(error)return NextResponse.json({error:"Could not claim queued rows; apply migration 051."},{status:500});
 const result=await processClaimedBulkAccounts(admin,data??[]);
 return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
}
