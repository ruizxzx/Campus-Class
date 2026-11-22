import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processQueuedLibraryIndexes } from "@/lib/library-index-worker";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;

function authorized(request:Request) {
  const expected=process.env.CRON_SECRET;
  const supplied=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??"";
  if(!expected||!supplied)return false;
  const left=Buffer.from(expected),right=Buffer.from(supplied);
  return left.length===right.length&&timingSafeEqual(left,right);
}

export async function GET(request:Request) {
  if(!authorized(request))return NextResponse.json({error:"Unauthorized."},{status:401});
  try {
    const results=await processQueuedLibraryIndexes(3);
    return NextResponse.json({success:true,processed:results.length,
      indexed:results.filter(item=>item.status==="indexed").length,
      retrying:results.filter(item=>item.status==="retry").length,
      failed:results.filter(item=>item.status==="failed").length});
  }catch(error){
    console.error("Queued library index cron unavailable",{reason:error instanceof Error?error.message:"unknown"});
    return NextResponse.json({error:"Document indexing queue is unavailable. Apply SQL 055."},{status:503});
  }
}
