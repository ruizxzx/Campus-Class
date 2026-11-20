import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestProfile, isResponse } from "@/lib/http";
import { bulkRequestSchema, bulkPassword } from "@/lib/bulk-accounts";

export const runtime = "nodejs";
const deny = (error: string, status: number) => NextResponse.json({error},{status});
async function authorize() {
 const ctx=await requestProfile();
 if (isResponse(ctx)) return ctx;
 if (ctx.profile.role !== "admin" || !ctx.profile.college_id) return deny("College admin access required.",403);
 return ctx;
}
function sameOrigin(req: Request) {
 const origin=req.headers.get("origin");
 if (!origin) return true;
 try {return new URL(origin).host === new URL(req.url).host;} catch{return false;}
}

export async function POST(request: Request) {
 const ctx=await authorize();
 if (isResponse(ctx)) return ctx;
 if (!sameOrigin(request)) return deny("Cross-origin request rejected.",403);
 const parsed=bulkRequestSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success) return NextResponse.json({error:"Invalid batch.",issues:parsed.error.issues.map(i=>({path:i.path,message:i.message}))},{status:400});
 const admin=createAdminClient(), collegeId=ctx.profile.college_id;
 const {data:previous,error:previousError}=await admin.from("bulk_account_batches").select("id").eq("college_id",collegeId).eq("idempotency_key",parsed.data.idempotency_key).maybeSingle();
 if(previousError) return deny("Could not check previous submissions.",500);
 if(previous) return NextResponse.json({id:previous.id,existing:true});
 const {count,error:rateError}=await admin.from("bulk_account_batches").select("id",{count:"exact",head:true}).eq("college_id",collegeId).gte("created_at",new Date(Date.now()-3600000).toISOString());
 if(rateError) return deny("Could not check import rate limit.",500);
 if((count??0)>=10) return deny("Import limit reached: 10 batches per college per hour.",429);
 const id=randomUUID();
 const {error:batchError}=await admin.from("bulk_account_batches").insert({id,college_id:collegeId,created_by:ctx.userId,idempotency_key:parsed.data.idempotency_key});
 if(batchError) {
   if(batchError.code==="23505") {
     const {data}=await admin.from("bulk_account_batches").select("id").eq("college_id",collegeId).eq("idempotency_key",parsed.data.idempotency_key).maybeSingle();
     if(data) return NextResponse.json({id:data.id,existing:true});
   }
   return deny("Could not create the import batch.",500);
 }
 const {error:rowsError}=await admin.from("bulk_account_rows").insert(parsed.data.rows.map((r,i)=>({
   id:randomUUID(),batch_id:id,college_id:collegeId,position:i,
   email:r.email,full_name:r.full_name,role:r.role,department:r.department,
   semester:r.semester??null,section:r.section,identifier:r.identifier,synthetic:r.synthetic,
 })));
 if(rowsError){
   await admin.from("bulk_account_batches").delete().eq("id",id).eq("college_id",collegeId);
   console.error("Bulk row insert failed",{code:rowsError.code});
   return deny("Could not queue the import; please retry.",500);
 }
 return NextResponse.json({id,total:parsed.data.rows.length},{status:201});
}

export async function GET(request: Request){
 const ctx=await authorize();
 if(isResponse(ctx)) return ctx;
 const id=new URL(request.url).searchParams.get("id");
 const admin=createAdminClient();
 if(!id || !/^[0-9a-f-]{36}$/i.test(id)) return deny("Valid batch id required.",400);
 const {data:batch,error}=await admin.from("bulk_account_batches").select("id,created_at,credentials_exported_at").eq("id",id).eq("college_id",ctx.profile.college_id).maybeSingle();
 if(error) return deny("Could not load import.",500);
 if(!batch) return deny("Import not found.",404);
 const {data:rows,error:rowsError}=await admin.from("bulk_account_rows").select("id,position,email,full_name,role,status,reason,synthetic").eq("college_id",ctx.profile.college_id).eq("batch_id",id).order("position");
 if(rowsError) return deny("Could not load import rows.",500);
 const result=rows??[];
 const counts={created:0,existing:0,failed:0,pending:0,processing:0};
 for(const r of result) counts[r.status as keyof typeof counts]++;
 const exportCredentials=new URL(request.url).searchParams.get("credentials")==="1";
 if(exportCredentials){
   if(counts.pending+counts.processing) return deny("Wait for processing to finish before exporting credentials.",409);
   if(batch.credentials_exported_at) return deny("Temporary credentials have already been exported. Reset individual passwords if needed.",409);
   if(!result.some(r=>r.status==="created")) return deny("No newly created accounts to export.",409);
   // Single-use atomic update protects the export against simultaneous requests.
   const {data:claimed,error:claimError}=await admin.from("bulk_account_batches").update({credentials_exported_at:new Date().toISOString()}).eq("id",id).eq("college_id",ctx.profile.college_id).is("credentials_exported_at",null).select("id").maybeSingle();
   if(claimError||!claimed) return deny("Credentials already exported or unavailable.",409);
   try {
     const credentials=result.filter(r=>r.status==="created").map(r=>({email:r.email,password:bulkPassword(r.id)}));
     return NextResponse.json({credentials},{headers:{"Cache-Control":"no-store"}});
   } catch {
     // This should be caught by configuration checks before batch execution.
     console.error("Bulk credential secret missing at export");
     return deny("Credential configuration missing. Contact administrator.",500);
   }
 }
 return NextResponse.json({id:batch.id,created_at:batch.created_at,credentials_available:!batch.credentials_exported_at,
   counts,total:result.length,rows:result},{headers:{"Cache-Control":"no-store"}});
}

export async function PATCH(request: Request) {
 const ctx=await authorize();
 if(isResponse(ctx)) return ctx;
 if(!sameOrigin(request)) return deny("Cross-origin request rejected.",403);
 const body=await request.json().catch(()=>null);
 const id=body?.id,rowIds=body?.row_ids;
 if(typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id)||!Array.isArray(rowIds)||rowIds.length<1||rowIds.length>150||rowIds.some((v:unknown)=>typeof v!=="string"||!/^[0-9a-f-]{36}$/i.test(v))) return deny("Invalid retry request.",400);
 const admin=createAdminClient();
 const {data:batch}=await admin.from("bulk_account_batches").select("id").eq("id",id).eq("college_id",ctx.profile.college_id).maybeSingle();
 if(!batch) return deny("Import not found.",404);
 const {data,error}=await admin.from("bulk_account_rows").update({status:"pending",reason:null,locked_at:null,attempts:0})
  .eq("college_id",ctx.profile.college_id).eq("batch_id",id).eq("status","failed").in("id",rowIds).select("id");
 if(error) return deny("Could not retry selected records.",500);
 return NextResponse.json({retried:data?.length??0});
}
