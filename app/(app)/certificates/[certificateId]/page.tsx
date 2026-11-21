import { displayName, istDate } from "@/lib/display";
import { PrintCertificate } from "@/components/print-certificate";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Award } from "lucide-react";
export const dynamic="force-dynamic";
export default async function CertificateDetail({params}:{params:Promise<{certificateId:string}>}) {
  const profile=await requireProfile();const {certificateId}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(certificateId))notFound();
  const db=createAdminClient();
  const {data:cert,error}=await db.from("academic_certificates")
    .select("id,college_id,student_id,course_id,certificate_number,issued_at,revoked_at,metadata")
    .eq("id",certificateId).eq("college_id",profile.college_id).maybeSingle();
  if(error||!cert||cert.revoked_at)notFound();
  if(cert.student_id!==profile.id&&profile.role!=="admin")notFound();
  const [{data:student},{data:college},{data:course}]=await Promise.all([
    db.from("profiles").select("full_name").eq("id",cert.student_id).eq("college_id",profile.college_id).maybeSingle(),
    db.from("colleges").select("name").eq("id",profile.college_id).maybeSingle(),
    db.from("courses").select("title").eq("id",cert.course_id).eq("college_id",profile.college_id).maybeSingle(),
  ]);
  const {data:branding}=await db.from("college_certificate_branding").select("template,logo_data").eq("college_id",profile.college_id).maybeSingle();
  const meta=cert.metadata&&typeof cert.metadata==="object"&&!Array.isArray(cert.metadata)?cert.metadata as Record<string,unknown>:{};
  const studentName=String(meta.student_name??student?.full_name??"Course student");
  const collegeName=String(meta.college_name??college?.name??"College");
  const courseTitle=String(meta.course_title??course?.title??"Course");
  return <main className="mx-auto max-w-4xl p-4 sm:p-8">
    <nav className="mb-5 print:hidden"><Link href={profile.role==="admin"?"/admin/certificates":"/certificates"} className="btn-secondary">Back to certificates</Link> <PrintCertificate student={displayName(studentName)} college={collegeName} course={courseTitle} issued={istDate(cert.issued_at,{day:"numeric",month:"long",year:"numeric"})} number={cert.certificate_number} verify={(process.env.NEXT_PUBLIC_APP_URL??"https://campus-class.vercel.app").replace(/[/]$/,"")+"/verify/"+cert.certificate_number} logo={branding?.logo_data} template={branding?.template} lessons={typeof meta.lesson_count==="number"?meta.lesson_count:undefined}/></nav>
    <article aria-label="College course completion certificate" className={"rounded-xl border-[10px] bg-white text-[#1a2823] px-8 py-12 sm:px-14 sm:py-20 text-center shadow-xl print:shadow-none "+(branding?.template==="modern"?"border-solid border-blue-700":"border-double border-emerald-700")}>
      {branding?.logo_data?<img src={branding.logo_data} alt="College logo" className="mx-auto h-20 w-auto object-contain"/>:<Award className="text-emerald-700 mx-auto" size={52}/>}
      <div className="mt-6 text-lg font-semibold uppercase tracking-widest">{collegeName}</div>
      <h1 className="mt-10 text-3xl sm:text-5xl font-serif">Certificate of Completion</h1>
      <p className="mt-10 text-base">This certifies that</p>
      <h2 className="mt-5 text-2xl sm:text-4xl font-serif font-bold">{displayName(studentName)}</h2>
      <p className="mt-8 text-base">has completed every published lecture of</p>
      <h3 className="mt-5 text-xl sm:text-3xl font-bold">{courseTitle}</h3>
      <p className="mt-9 text-sm">{typeof meta.lesson_count==="number"?String(meta.lesson_count)+(meta.lesson_count===1?" lesson · ":" lessons · "):""}
        Issued {istDate(cert.issued_at,{day:"numeric",month:"long",year:"numeric"})}</p>
      <div className="mt-12 border-t border-gray-300 pt-5 text-sm">Certificate ID: {cert.certificate_number}</div>
      <div className="mt-2 text-xs">Issued automatically by Campus Class for {collegeName}</div>
      <div className="mt-2 text-xs break-all">
        Verify: {(process.env.NEXT_PUBLIC_APP_URL??"https://campus-class.vercel.app").replace(/[/]$/,"")}/verify/{cert.certificate_number}
      </div>
    </article>
    <p className="mt-5 text-center text-sm text-[var(--muted)] print:hidden">Download the certificate as a PDF or use your browser Print command.</p>
  </main>;
}
