"use client";
import {classLabel} from "@/lib/display";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { FileUp, Loader2 } from "lucide-react";

type Classroom={id:string;display_name:string|null;section:string;semester:number|null;subjects?:{name:string}|{name:string}[]|null};
type Pending={files:File[];items:{material_id:string;version_id:string;path:string;token:string;name:string}[];completed:Set<number>};
const types:Record<string,string>={
 ".pdf":"application/pdf",".txt":"text/plain",
 ".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
 ".pptx":"application/vnd.openxmlformats-officedocument.presentationml.presentation",
 ".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",
};
function mime(file:File){return file.type||types[file.name.slice(file.name.lastIndexOf(".")).toLowerCase()]||"";}

export function LibraryUploadForm({classes,replaceMaterialId}:{
  classes:Classroom[];replaceMaterialId?:string;
}) {
 const router=useRouter();
 const [classId,setClassId]=useState(classes[0]?.id??"");
 const [files,setFiles]=useState<File[]>([]);
 const [title,setTitle]=useState("");
 const [description,setDescription]=useState("");
 const [unit,setUnit]=useState("");
 const [chapter,setChapter]=useState("");
 const [semester,setSemester]=useState("");
 const [busy,setBusy]=useState(false);
 const pending=useRef<Pending|null>(null);
 const [hasPending,setHasPending]=useState(false);
 async function submit(event:React.FormEvent){
   event.preventDefault();
   if(busy)return;
   if(!files.length||files.length>(replaceMaterialId?1:10)){
     toast.error(replaceMaterialId?"Choose one replacement file.":"Choose 1–10 documents.");return;
   }
   if(files.some(file=>file.size<=0||file.size>30*1024*1024||!types[file.name.slice(file.name.lastIndexOf(".")).toLowerCase()])){
     toast.error("Only PDF, TXT, DOCX, PPTX and image files up to 30 MB are supported.");return;
   }
   setBusy(true);
   try{
     let current=pending.current;
     if(!current){
       const payload=replaceMaterialId?
         {action:"replace",material_id:replaceMaterialId,file:{name:files[0].name,size:files[0].size,type:mime(files[0])}}:
         {action:"create",class_id:classId,title,description,unit_title:unit,
           chapter_title:chapter,semester:semester?Number(semester):null,
           files:files.map(file=>({name:file.name,size:file.size,type:mime(file)}))};
       const response=await fetch("/api/library/materials",{method:"POST",
         headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
       const data=await response.json().catch(()=>({}));
       if(!response.ok)throw new Error(data.error??"Could not prepare the private upload.");
       if(data.items?.length!==files.length)throw new Error("Upload preparation is incomplete.");
       current={files:[...files],items:data.items,completed:new Set<number>()};
       pending.current=current;
       setHasPending(true);
     }
     const db=createClient();
     for(let index=0;index<current.files.length;index++){
       if(current.completed.has(index))continue;
       const item=current.items[index],file=current.files[index];
       const {error}=await db.storage.from("study-library").uploadToSignedUrl(
         item.path,item.token,file,{contentType:mime(file),upsert:false});
       if(error)throw new Error("Upload failed for "+file.name+": "+error.message);
       current.completed.add(index);
     }
     const response=await fetch("/api/library/materials",{method:"POST",
       headers:{"Content-Type":"application/json"},
       body:JSON.stringify({action:"publish",items:current.items.map(item=>({
         material_id:item.material_id,version_id:item.version_id,
       }))})});
     const data=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(data.error??"Files uploaded but not yet published. Retry to finalize.");
     pending.current=null;setHasPending(false);setFiles([]);
     toast.success(replaceMaterialId?"File version updated.":"All library files published.");
     router.refresh();
   }catch(error){
     toast.error(error instanceof Error?error.message:"Upload failed. Retry with the same selected files.");
   }finally{setBusy(false);}
 }
 return <form onSubmit={submit} className="surface p-5 space-y-4">
   <h2 className="font-semibold">{replaceMaterialId?"Upload replacement version":"Upload study materials"}</h2>
   <p className="text-xs text-[var(--muted)]">Files are uploaded directly to private college Storage; students see them only after all uploads finish.</p>
   {!replaceMaterialId?<div className="grid gap-3 sm:grid-cols-2">
     <label className="text-xs font-semibold">Class
       <select required className="input-base mt-1 w-full" value={classId} disabled={busy||hasPending}
         onChange={e=>setClassId(e.target.value)}>{classes.map(c=><option key={c.id} value={c.id}>{classLabel(c)}</option>)}</select>
     </label>
     <label className="text-xs font-semibold">Semester (optional)
       <input className="input-base mt-1 w-full" type="number" min="1" max="12" value={semester}
         onChange={e=>setSemester(e.target.value)}/>
     </label>
     <label className="text-xs font-semibold sm:col-span-2">Collection title (optional)
       <input className="input-base mt-1 w-full" maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}
         placeholder="e.g. Data Structures — Unit 1"/>
     </label>
     <label className="text-xs font-semibold">Unit
       <input className="input-base mt-1 w-full" maxLength={120} value={unit} onChange={e=>setUnit(e.target.value)} placeholder="Unit 1"/>
     </label>
     <label className="text-xs font-semibold">Chapter
       <input className="input-base mt-1 w-full" maxLength={120} value={chapter} onChange={e=>setChapter(e.target.value)} placeholder="Algorithms"/>
     </label>
     <label className="text-xs font-semibold sm:col-span-2">Description
       <textarea className="input-base mt-1 w-full min-h-20" maxLength={4000} value={description}
         onChange={e=>setDescription(e.target.value)} placeholder="What should students learn from these files?"/>
     </label>
   </div>:null}
   <label className="block text-xs font-semibold">Files
     <span className="mt-2 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[var(--line)] p-4">
       <FileUp size={18}/><span>{files.length?files.map(f=>f.name).join(", "):"Choose "+(replaceMaterialId?"a replacement file":"up to 10 documents")}</span>
       <input className="sr-only" type="file" multiple={!replaceMaterialId}
         disabled={busy||hasPending} accept=".pdf,.txt,.docx,.pptx,.jpg,.jpeg,.png,.webp"
         onChange={e=>setFiles(Array.from(e.target.files??[]))}/>
     </span>
   </label>
   <p className="text-[11px] text-[var(--muted)]">PDF, TXT, DOCX, PPTX, JPG, PNG, WebP · max 30 MB each</p>
   <button type="submit" className="btn-primary" disabled={busy||!files.length||(!replaceMaterialId&&!classId)}>
     {busy?<><Loader2 size={15} className="animate-spin"/>Uploading…</>:hasPending?"Retry / finish upload":replaceMaterialId?"Replace file":"Publish files"}
   </button>
 </form>;
}
