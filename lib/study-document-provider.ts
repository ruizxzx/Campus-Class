import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { OpenRouterError } from "@/lib/openrouter";
import { parsedPdfFromAnnotations, validEmbedding, type ParsedPdf } from "@/lib/study-document-text";
import type { Profile } from "@/types/database";

type Credential={apiKey:string;model:string};

/** Indexing requires Vault storage; never pass provider secrets to the browser. */
async function collegeCredential(profile:Profile):Promise<Credential>{
  const admin=createAdminClient();
  const {data:settings,error}=await admin.from("college_ai_settings")
    .select("enabled,model,api_key_vault_id")
    .eq("college_id",profile.college_id).maybeSingle();
  if(error)throw new OpenRouterError("Could not load college AI settings.",503);
  if(!settings?.enabled)throw new OpenRouterError("Enable CampusClass AI in your college's Admin AI Settings.",503);
  if(!settings.api_key_vault_id)throw new OpenRouterError(
    "Save the college OpenRouter API key again in Admin AI Settings after applying Vault SQL 032.",503);
  const {data:secret,error:vaultError}=await admin.rpc("read_college_ai_secret",{
    p_college_id:profile.college_id,p_user_id:profile.id,
  });
  if(vaultError||typeof secret!=="string"||secret.length<20)
    throw new OpenRouterError("Could not read this college's Vault AI key.",503);
  return {apiKey:secret,model:settings.model};
}
async function checkAIQuota(profile:Profile){
  const {data,error}=await createAdminClient().rpc("consume_ai_request_quota",{
    p_college_id:profile.college_id,p_user_id:profile.id,
  });
  if(error)throw new OpenRouterError("The AI request quota is unavailable. Apply SQL migration 030.",503);
  if(data!==true)throw new OpenRouterError("This college AI user's hourly request limit is reached.",429);
}
async function callProvider(apiKey:string,url:string,body:object){
  let response:Response;
  try{
    response=await fetch(url,{
      method:"POST",headers:{
        Authorization:"Bearer "+apiKey,"Content-Type":"application/json",
        "HTTP-Referer":process.env.NEXT_PUBLIC_APP_URL??"https://campusclass.app",
        "X-Title":"CampusClass Study Index",
      },body:JSON.stringify(body),signal:AbortSignal.timeout(55_000),
    });
  }catch{
    throw new OpenRouterError("Could not reach the study material processor.",502);
  }
  if(!response.ok){
    console.error("OpenRouter study index provider failed",{status:response.status});
    throw new OpenRouterError(response.status===429?"Study AI is busy; try again later.":
      "The study material provider could not complete this request.",
      response.status===429?429:502);
  }
  return response.json().catch(()=>null) as Promise<unknown>;
}
export async function extractSyllabusPdf(profile:Profile,fileUrl:string,useOcr:boolean):Promise<ParsedPdf>{
  if(!/^https:\/\//.test(fileUrl)||fileUrl.length>4000)
    throw new OpenRouterError("Invalid signed PDF URL.",400);
  const credentials=await collegeCredential(profile);
  await checkAIQuota(profile);
  const response=await callProvider(credentials.apiKey,
    "https://openrouter.ai/api/v1/chat/completions",{
      model:credentials.model,
      messages:[{role:"user",content:[
        {type:"text",text:"Acknowledge that a syllabus PDF was attached in one word."},
        {type:"file",file:{filename:"syllabus.pdf",file_data:fileUrl}},
      ]}],max_tokens:24,temperature:0,
      plugins:[{id:"file-parser",pdf:{engine:useOcr?"mistral-ocr":"cloudflare-ai"}}],
    });
  try{return parsedPdfFromAnnotations(response);}
  catch(error){
    throw new OpenRouterError(error instanceof Error?error.message:
      "The PDF parser did not return verified extractable text.",422);
  }
}
export async function embedStudyText(profile:Profile,inputs:string[]):Promise<number[][]>{
  if(!inputs.length||inputs.length>8
    ||inputs.some((s)=>!s.trim()||s.length>1800))
    throw new OpenRouterError("Invalid text embedding batch.",400);
  const credentials=await collegeCredential(profile);
  await checkAIQuota(profile);
  const response=await callProvider(credentials.apiKey,"https://openrouter.ai/api/v1/embeddings",{
    model:"openai/text-embedding-3-small",dimensions:1536,
    input:inputs,encoding_format:"float",
  });
  const root=response && typeof response==="object" ? response as {
    data?:{index?:number;embedding?:unknown}[]
  }:null;
  if(!Array.isArray(root?.data)||root.data.length!==inputs.length)
    throw new OpenRouterError("The embedding provider returned an incomplete batch.",502);
  const vectors:(number[]|undefined)[]=Array(inputs.length).fill(undefined);
  for(const item of root.data){
    if(!item||!Number.isInteger(item.index)||item.index!<0||item.index!>=inputs.length
      ||!validEmbedding(item.embedding)||vectors[item.index!])
      throw new OpenRouterError("The embedding provider returned invalid vectors.",502);
    vectors[item.index!]=item.embedding;
  }
  if(vectors.some((value)=>!value))throw new OpenRouterError("The embedding batch is incomplete.",502);
  return vectors as number[][];
}
