/**
 * Public-facing errors for the privileged playlist apply RPC.
 * Never return raw PostgREST errors: they can contain internal schema details.
 */
export function describeYoutubeApplyError(error:{code?:string|null;message?:string|null}):{
  message:string;status:number;reason:string;
}{
  const message=error.message??"";
  if(error.code==="42501"){
    if(message==="Import job owner mismatch")
      return {message:"This playlist import belongs to another faculty account.",status:403,reason:"job_owner_mismatch"};
    if(message==="Target course is not in the imported subject")
      return {message:"The destination course no longer belongs to the selected subject. Choose an authorized course.",status:403,reason:"course_subject_mismatch"};
    const match=/^permission denied for (table|schema|relation|function|sequence) ([a-z0-9_."]{1,100})$/i.exec(message);
    return {
      message:"Course publishing is blocked by database permissions. Ask the college administrator to run forward SQL 048, then retry this saved import.",
      status:503,
      reason:match?"permission_denied_"+match[1].toLowerCase()+"_"+match[2].replace(/"/g,""):"database_access_denied",
    };
  }
  if(error.code==="PGRST202"||error.code==="42883")
    return {message:"The database import function is missing. Apply forward SQL 046 before SQL 048.",status:503,reason:"import_function_missing"};
  if(error.code==="23505")
    return {message:"A duplicate course or lecture reference was detected. Refresh this saved import and retry.",status:409,reason:"duplicate_reference"};
  return {message:"Could not save this course. Your playlist import is preserved; retry or contact your administrator.",status:503,reason:error.code?.slice(0,12)??"unknown"};
}
