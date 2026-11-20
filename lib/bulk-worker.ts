import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { provisionMember } from "@/lib/member-provisioning";
import { bulkPassword } from "@/lib/bulk-accounts";

type Admin=ReturnType<typeof createAdminClient>;
type QueueRow={id:string;batch_id:string;college_id:string;email:string;full_name:string;role:"faculty"|"student";synthetic:boolean;attempts:number};

export async function processClaimedBulkAccounts(admin:Admin, rows:QueueRow[]) {
 let created=0,existing=0,failed=0,needs_recovery=0;
 for(const row of rows){
  let result:Awaited<ReturnType<typeof provisionMember>>;
  try{
   const {data:batch,error}=await admin.from("bulk_account_batches").select("created_by").eq("id",row.batch_id).eq("college_id",row.college_id).single();
   if(error||!batch)throw Error("Batch owner unavailable.");
   result=await provisionMember(admin,row.college_id,batch.created_by,{
     email:row.email,full_name:row.full_name,role:row.role,
     password:bulkPassword(row.id),send_setup_email:false,
   },row.synthetic);
  }catch {result={status:"failed",reason:"Temporary server error."};}
  if(result.status==="created")created++;
  else if(result.status==="existing")existing++;
  else failed++;
  const retry=result.status==="failed" && row.attempts<3 && result.reason==="Temporary server error.";
  const {error}=await admin.from("bulk_account_rows").update({
   status:retry?"pending":result.status,reason:result.reason??result.warning??null,
   auth_user_id:result.userId??null,locked_at:null
  }).eq("college_id",row.college_id).eq("id",row.id).eq("status","processing");
  if(error){console.error("Bulk result persistence failed",{code:error.code});needs_recovery++;}
 }
 return {processed:rows.length,created,existing,failed,needs_recovery};
}
