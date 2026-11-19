"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
export function CourseApprovalButton({courseId,studentId}:{
 courseId:string;studentId:string;
}){
 const [busy,setBusy]=useState(false);const router=useRouter();
 async function approve(){
   setBusy(true);
   try{
     const response=await fetch("/api/youtube/courses/rules",{
       method:"POST",headers:{"Content-Type":"application/json"},
       body:JSON.stringify({action:"approve",course_id:courseId,student_id:studentId}),
     });
     const result=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(result.error??"Approval failed.");
     toast.success("Faculty completion approval recorded.");
     router.refresh();
   }catch(error){toast.error(error instanceof Error?error.message:"Could not approve the student.");}
   finally{setBusy(false);}
 }
 return <button className="btn-secondary !px-2 !py-1 text-[11px]" type="button" disabled={busy}
   onClick={()=>void approve()}><CheckCheck size={13}/>{busy?"Approving…":"Approve completion"}</button>;
}
