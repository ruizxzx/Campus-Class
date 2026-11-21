import "server-only";
import {createAdminClient} from "@/lib/supabase/admin";
export async function trackAIRequest(collegeId:string,mode:"chat"|"practice"|"revision"|"summary"|"resource"|"evaluation"){try{const {error}=await createAdminClient().rpc("record_college_ai_request",{p_college:collegeId,p_mode:mode});if(error)console.warn("AI usage counter unavailable",{code:error.code});}catch{console.warn("AI usage counter unavailable");}}
