import "server-only";
import {createAdminClient} from "@/lib/supabase/admin";

export type PublicCertificateCheck={
 number:string;valid:boolean;issued_at:string;college:string;course:string;
};
/** Public check returns ONLY a shared certificate's issuing college, course and status. */
export async function lookupCertificate(number:string):Promise<PublicCertificateCheck|null>{
 const normalized=number.trim().toUpperCase();
 if(!/^CC-[A-F0-9]{20}$/.test(normalized))return null;
 const db=createAdminClient();
 const {data:matches,error}=await db.from("academic_certificates")
  .select("college_id,course_id,certificate_number,issued_at,revoked_at")
  .eq("certificate_number",normalized).limit(2);
 if(error)throw new Error("Certificate verification is temporarily unavailable.");
 // Certificate number is unique per college; fail closed on an unlikely collision.
 if(!matches||matches.length!==1)return null;
 const cert=matches[0];
 const [college,course]=await Promise.all([
  db.from("colleges").select("name").eq("id",cert.college_id).maybeSingle(),
  db.from("courses").select("title").eq("id",cert.course_id)
   .eq("college_id",cert.college_id).maybeSingle(),
 ]);
 if(college.error||course.error||!college.data||!course.data)
  throw new Error("Certificate verification details could not be loaded.");
 return {number:normalized,valid:!cert.revoked_at,issued_at:cert.issued_at,
  college:college.data.name,course:course.data.title};
}
