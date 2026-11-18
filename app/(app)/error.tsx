"use client";
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
export default function AcademicRouteError({error,reset}:{
  error:Error&{digest?:string};reset:()=>void;
}){
  useEffect(()=>{console.error("CampusClass route error",error);},[error]);
  return <main className="mx-auto max-w-2xl p-6 sm:p-10">
    <section className="surface p-6 sm:p-8" role="alert">
      <AlertTriangle size={26} className="text-amber-600"/>
      <h1 className="mt-4 text-lg font-semibold">This page couldn&apos;t finish loading</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">The request failed before its data could be verified. Your saved work and records were not changed by this error screen.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={reset}><RotateCcw size={15}/>Retry</button>
        <Link href="/dashboard" className="btn-secondary">Dashboard</Link>
      </div>
      {error.digest&&<p className="mt-4 text-xs text-[var(--muted)]">Reference: {error.digest}</p>}
    </section>
  </main>;
}
