/**
 * Keep database error details in server logs, but never reveal SQL or tenant
 * records through a route's client UI. A status is deliberately NOT a grade.
 */
export type AcademicIssue = "migration" | "permissions" | "unavailable" | "incomplete" | "configuration";
type DbError = {code?:string;message?:string}|null|undefined;
const missing = new Set(["42P01","42703","PGRST205","PGRST204","PGRST202","42883"]);
export function academicIssueFor(error:DbError):AcademicIssue{
  if(missing.has(error?.code??""))return "migration";
  if(error?.code==="42501")return "permissions";
  return "unavailable";
}
export function academicLog(stage:string,error:DbError){
  // The database error code is useful; its message may contain private values.
  console.error("Academic data request failed",{stage,code:error?.code??"unknown"});
}
export function missingOptionalAcademicTable(error:DbError):boolean{
  return error!==null&&error!==undefined&&["42P01","PGRST205"].includes(error.code??"");
}
