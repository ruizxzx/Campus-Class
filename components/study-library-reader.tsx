"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, Bookmark, Download, CheckCircle2 } from "lucide-react";
import { StudyLibraryAI } from "@/components/study-library-ai";
import { LibraryUploadForm } from "@/components/study-library-upload";
type Version={id:string;version:number;file_name:string;mime_type:string;indexed_at:string|null;created_at:string};
type BookmarkRow={page_number:number;note:string};
export function StudyLibraryReader({materialId,version,isStaff,versions,initialPage,initialCompleted,initialBookmarks}:{
 materialId:string;
 version:{id:string;file_name:string;mime_type:string;indexed_at:string|null};
 isStaff:boolean;versions:Version[];initialPage:number;initialCompleted:boolean;initialBookmarks:BookmarkRow[];
}) {
 const router=useRouter();
 const [page,setPage]=useState(initialPage);
 const [completed,setCompleted]=useState(initialCompleted);
 const [bookmarks,setBookmarks]=useState(initialBookmarks);
 const [note,setNote]=useState("");
 const [busy,setBusy]=useState(false);
 const isPdf=version.mime_type==="application/pdf";
 const url="/api/library/files?material_id="+encodeURIComponent(materialId);
 async function progress(action:"progress"|"bookmark"|"unbookmark",status:"reading"|"completed"="reading"){
   if(busy)return;
   setBusy(true);
   try {
     const response=await fetch("/api/library/progress",{method:"POST",
       headers:{"Content-Type":"application/json"},
       body:JSON.stringify({action,material_id:materialId,page,...(action==="progress"?{status}:action==="bookmark"?{note}:{})})});
     const result=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(result.error??"Could not save reading activity.");
     if(action==="progress"){
       setCompleted(Boolean(result.completed));
       toast.success(status==="completed"?"Material marked read.":"Reading position saved.");
     } else if(action==="bookmark"){
       setBookmarks(current=>[...current.filter(b=>b.page_number!==page),{page_number:page,note}].sort((a,b)=>a.page_number-b.page_number));
       setNote("");toast.success("Bookmark saved.");
     }else{
       setBookmarks(current=>current.filter(b=>b.page_number!==page));
       toast.success("Bookmark removed.");
     }
   }catch(error){toast.error(error instanceof Error?error.message:"Could not save your activity.");}
   finally{setBusy(false);}
 }
 async function restore(versionId:string){
   setBusy(true);
   try{
     const response=await fetch("/api/library/materials",{method:"POST",
       headers:{"Content-Type":"application/json"},
       body:JSON.stringify({action:"restore",material_id:materialId,version_id:versionId})});
     const data=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(data.error??"Could not restore this version.");
     toast.success("Version restored.");router.refresh();
   }catch(error){toast.error(error instanceof Error?error.message:"Restore failed.");}
   finally{setBusy(false);}
 }
 return <div className="space-y-5">
   <section className="surface overflow-hidden">
     <div className="flex flex-wrap justify-between items-center gap-3 px-5 py-4 border-b border-[var(--line)]">
       <span className="text-sm font-semibold">{version.file_name}</span>
       <a href={url+"&mode=download"} className="btn-secondary"><Download size={14}/>Download file</a>
     </div>
     {isPdf?<iframe title={"PDF reader: "+version.file_name} src={url+"&mode=preview"}
       className="block w-full min-h-[66vh] bg-white" sandbox="allow-scripts allow-same-origin"/>:
       <div className="p-8 text-center text-sm text-[var(--muted)]">
         In-browser preview is available for PDFs. Download this file to open it with the appropriate application.
       </div>}
   </section>
   {!isStaff?<section className="surface p-5 space-y-3">
     <h2 className="font-semibold flex items-center gap-2"><BookOpen size={16}/>Your reading progress</h2>
     <p className="text-xs text-[var(--muted)]">Save your page as you read or mark a resource complete. This is independent of course lecture progress.</p>
     <label className="flex gap-2 items-center text-sm">Current page
       <input className="input-base w-28" type="number" min={1} max={100000} value={page}
         onChange={e=>setPage(Math.min(100000,Math.max(1,Number(e.target.value)||1)))}/>
     </label>
     <div className="flex flex-wrap gap-2">
       <button type="button" disabled={busy} onClick={()=>void progress("progress")} className="btn-secondary">Save current page</button>
       <button type="button" disabled={busy||completed} onClick={()=>void progress("progress","completed")} className="btn-primary">
         <CheckCircle2 size={14}/>{completed?"Finished reading":"Mark material read"}</button>
     </div>
     <label className="block text-xs font-semibold">Bookmark note
       <input className="input-base mt-1 w-full" value={note} maxLength={240} onChange={e=>setNote(e.target.value)}
         placeholder="Optional note about this page"/>
     </label>
     <button type="button" className="btn-secondary" disabled={busy} onClick={()=>void progress("bookmark")}><Bookmark size={14}/>Bookmark page {page}</button>
     {bookmarks.length?<ul className="space-y-2">
       {bookmarks.map(b=><li className="rounded-lg bg-[var(--surface-2)] p-3 text-xs flex items-center justify-between gap-2" key={b.page_number}>
         <button className="font-semibold" type="button" onClick={()=>setPage(b.page_number)}>Page {b.page_number}{b.note?" · "+b.note:""}</button>
         <button type="button" className="underline" onClick={()=>{setPage(b.page_number);void (async()=>{
           const response=await fetch("/api/library/progress",{method:"POST",headers:{"Content-Type":"application/json"},
             body:JSON.stringify({action:"unbookmark",material_id:materialId,page:b.page_number})});
           if(response.ok){setBookmarks(current=>current.filter(x=>x.page_number!==b.page_number));}
           else toast.error("Could not remove bookmark.");
         })();}}>Remove</button>
       </li>)}</ul>:null}
   </section>:null}
   {isStaff?<section className="space-y-4">
     <LibraryUploadForm classes={[]} replaceMaterialId={materialId}/>
     <div className="surface p-5"><h2 className="font-semibold mb-3">File version history</h2>
       <div className="space-y-2">{versions.map(v=><div key={v.id} className="flex flex-wrap gap-3 items-center justify-between border-b border-[var(--line)] py-3 text-xs">
         <span>Version {v.version} · {v.file_name} · {new Date(v.created_at).toLocaleDateString("en-IN")}</span>
         <div className="flex gap-2">
           <a className="btn-secondary" href={url+"&mode=download&version_id="+encodeURIComponent(v.id)}>Download</a>
           {v.id!==version.id?<button className="btn-secondary" type="button" disabled={busy} onClick={()=>void restore(v.id)}>Restore</button>:<span className="status-pill green">Current</span>}
         </div>
       </div>)}</div>
     </div>
   </section>:null}
   <StudyLibraryAI materialId={materialId} indexed={Boolean(version.indexed_at)} staff={isStaff}
     isPdf={isPdf||version.mime_type==="text/plain"}/>
 </div>;
}
