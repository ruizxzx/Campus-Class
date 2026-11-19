import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { Award, ExternalLink } from "lucide-react";
export const dynamic="force-dynamic";
export default async function CertificatesPage(){
  const profile=await requireProfile();const db=await createClient();
  const {data:certs,error}=await db.from("academic_certificates")
    .select("id,certificate_number,issued_at,metadata,courses(title)")
    .eq("college_id",profile.college_id).eq("student_id",profile.id)
    .is("revoked_at",null).order("issued_at",{ascending:false});
  if(error){console.error("Certificate lookup failed",{code:error.code});throw new Error("Could not load certificates.");}
  return <><PageHeader title="My course certificates" description="Certificates under your college's name are issued automatically when all published lessons are complete."/>
    <div className="grid gap-4 md:grid-cols-2">{certs?.length?certs.map(cert=>{
      const course=Array.isArray(cert.courses)?cert.courses[0]:cert.courses;
      const meta=cert.metadata&&typeof cert.metadata==="object"&&!Array.isArray(cert.metadata)?cert.metadata as Record<string,unknown>:{};
      return <article className="surface p-5" key={cert.id}>
        <Award size={28} className="text-[var(--green-strong)]"/>
        <h2 className="mt-3 font-semibold">{String(meta.course_title??course?.title??"Course completion")}</h2>
        <p className="mt-2 text-xs text-[var(--muted)]">{String(meta.college_name??"College-issued certificate")}</p>
        <p className="mt-2 text-xs">Certificate {cert.certificate_number}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">Issued {new Date(cert.issued_at).toLocaleDateString("en-IN")}</p>
        <Link href={"/certificates/"+cert.id} className="btn-secondary mt-4"><ExternalLink size={14}/>View / print certificate</Link>
      </article>;
    }):<EmptyState title="No certificates yet" description="Complete all lectures in your enrolled course to earn a college certificate."/>}</div>
  </>;
}
