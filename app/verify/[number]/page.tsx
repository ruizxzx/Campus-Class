import Link from "next/link";
import {notFound} from "next/navigation";
import {lookupCertificate} from "@/lib/certificates/verification";
import {Award,CheckCircle2,XCircle} from "lucide-react";
export const dynamic="force-dynamic";
export default async function VerifyCertificatePage({params}:{
 params:Promise<{number:string}>;
}){
 const {number}=await params;
 const cert=await lookupCertificate(number);
 if(!cert)notFound();
 return <main className="mx-auto min-h-screen max-w-2xl px-5 py-14">
  <Link href="/" className="text-sm font-semibold text-[var(--green-strong)]">Campus Class home</Link>
  <article className="surface mt-8 p-7 sm:p-10">
   <Award size={42} className="text-[var(--green-strong)]"/>
   <h1 className="mt-5 text-2xl font-semibold">Certificate verification</h1>
   <div role="status" className="mt-6 flex items-center gap-2 text-base font-semibold">
    {cert.valid?<><CheckCircle2 size={20} className="text-emerald-700"/>Valid certificate</>:
      <><XCircle size={20} className="text-rose-700"/>Certificate revoked</>}
   </div>
   <dl className="mt-6 grid gap-4 text-sm">
    <div><dt className="text-xs text-[var(--muted)]">Certificate number</dt><dd className="mt-1 font-mono break-all">{cert.number}</dd></div>
    <div><dt className="text-xs text-[var(--muted)]">Issued by</dt><dd className="mt-1 font-medium">{cert.college}</dd></div>
    <div><dt className="text-xs text-[var(--muted)]">Course</dt><dd className="mt-1 font-medium">{cert.course}</dd></div>
    <div><dt className="text-xs text-[var(--muted)]">Date issued</dt><dd className="mt-1">{new Date(cert.issued_at).toLocaleDateString("en-IN",{year:"numeric",month:"long",day:"numeric"})}</dd></div>
   </dl>
   <p className="mt-7 text-xs leading-6 text-[var(--muted)]">This page verifies the certificate number and issuing institution only. Private student records and grades are not disclosed.</p>
  </article>
 </main>;
}
