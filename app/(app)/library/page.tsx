import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { accessibleLibraryClasses } from "@/lib/study-library-access";
import { LearningHubHeader } from "@/components/learning-hub-header";
import { LibraryUploadForm } from "@/components/study-library-upload";
import { EmptyState } from "@/components/ui";
import { BookOpen, FileText, Search } from "lucide-react";

export const dynamic="force-dynamic";
export default async function StudyLibraryPage({searchParams}:{
  searchParams:Promise<{q?:string;class?:string;semester?:string;unit?:string}>;
}) {
 const profile=await requireProfile(),db=createAdminClient();
 const filters=await searchParams;
 const classes=await accessibleLibraryClasses({profile,userId:profile.id});
 const classIds=classes.map(c=>c.id);
 const selected=classIds.includes(filters.class??"")?filters.class:null;
 const query=(filters.q??"").trim().slice(0,90);
 const unit=(filters.unit??"").trim().slice(0,80);
 const semester=/^([1-9]|1[0-2])$/.test(filters.semester??"")?Number(filters.semester):null;
 const isStaff=profile.role!=="student";
 let items:{
  id:string;title:string;description:string;class_id:string;subject_id:string;
  semester:number|null;unit_title:string;chapter_title:string;created_at:string;status:string;current_version:number;
 }[]=[];
 if(classIds.length){
   let request=db.from("study_materials")
     .select("id,title,description,class_id,subject_id,semester,unit_title,chapter_title,created_at,status,current_version")
     .eq("college_id",profile.college_id).in("class_id",selected?[selected]:classIds)
     .order("created_at",{ascending:false}).limit(500);
   if(!isStaff)request=request.eq("status","published");
   else request=request.neq("status","archived");
   if(semester)request=request.eq("semester",semester);
   if(unit)request=request.ilike("unit_title","%"+unit.replace(/[%_]/g,"")+"%");
   const {data,error}=await request;
   if(error)throw new Error("Could not load library materials. Apply SQL 041.");
   items=data??[];
 }
 const matchingText=new Map<string,{page:number|null;snippet:string}>();
 if(query&&items.length){
   const ids=items.map(item=>item.id);
   // Search only the CURRENT published version. Historic versions may contain
   // superseded or withdrawn content and must never leak through snippets.
   const currentVersions:string[]=[];
   const versionNumbers=new Map(items.map(item=>[item.id,item.current_version]));
   for(let start=0;start<ids.length;start+=75){
     const {data,error}=await db.from("study_material_versions")
       .select("id,material_id,version").eq("college_id",profile.college_id)
       .in("material_id",ids.slice(start,start+75));
     if(error)throw new Error("Could not verify current library versions.");
     for(const v of data??[])if(versionNumbers.get(v.material_id)===v.version)currentVersions.push(v.id);
   }
   for(let start=0;start<currentVersions.length;start+=75){
     const {data,error}=await db.from("study_material_chunks")
       .select("material_id,page_number,chunk_text")
       .eq("college_id",profile.college_id).in("version_id",currentVersions.slice(start,start+75))
       .textSearch("chunk_text",query,{type:"websearch",config:"english"})
       .limit(50);
     if(error)throw new Error("Could not search indexed book text. Apply SQL 042.");
     for(const item of data??[])if(!matchingText.has(item.material_id))
       matchingText.set(item.material_id,{page:item.page_number,snippet:item.chunk_text.slice(0,210)});
   }
   const normalized=query.toLowerCase();
   items=items.filter(item=>
     [item.title,item.description,item.unit_title,item.chapter_title].some(v=>v.toLowerCase().includes(normalized))||
     matchingText.has(item.id));
 }
 const names=new Map(classes.map(c=>[c.id,(c.display_name??"Class")+" · "+c.section]));
 return <>
   <LearningHubHeader active="library" title="Digital study library"
     description="Find class textbooks, lecture notes and resource files. Save your reading position and study with verified document AI."
     canAuthor={isStaff}/>
   {isStaff?<div className="mb-5"><LibraryUploadForm classes={classes}/></div>:null}
   <section className="surface p-4 mb-5">
     <form action="/library" className="grid gap-3 md:grid-cols-[1fr_220px_120px_auto]">
       <label className="text-xs font-semibold">Search books and extracted text
         <input className="input-base mt-1 w-full" name="q" maxLength={90} defaultValue={query} placeholder="Search notes, subjects, or PDF contents"/>
       </label>
       <label className="text-xs font-semibold">Class
         <select className="input-base mt-1 w-full" name="class" defaultValue={selected??""}>
           <option value="">All accessible classes</option>
           {classes.map(c=><option value={c.id} key={c.id}>{names.get(c.id)}</option>)}
         </select>
       </label>
       <label className="text-xs font-semibold">Semester
         <select className="input-base mt-1 w-full" name="semester" defaultValue={semester??""}>
           <option value="">All</option>
           {Array.from({length:12},(_,i)=>i+1).map(n=><option value={n} key={n}>{n}</option>)}
         </select>
       </label>
       <button className="btn-primary self-end" type="submit"><Search size={14}/>Search</button>
     </form>
   </section>
   <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
     {items.length?items.map(item=><Link key={item.id} href={"/library/"+item.id} className="surface p-5 group hover:border-[var(--green)]">
       <div className="flex justify-between items-center"><FileText size={20} className="text-[var(--green-strong)]"/>
         {item.status!=="published"?<span className="status-pill">{item.status}</span>:null}</div>
       <h2 className="font-semibold mt-3">{item.title}</h2>
       <p className="mt-2 line-clamp-2 text-xs text-[var(--muted)]">{item.description}</p>
       <div className="mt-3 space-y-1 text-[11px] text-[var(--muted)]">
         <p>{names.get(item.class_id)}</p>
         <p>{item.semester?"Semester "+item.semester+" · ":""}{item.unit_title}{item.chapter_title?" / "+item.chapter_title:""}</p>
         {matchingText.get(item.id)?<p className="mt-2 line-clamp-3 italic">
           Matched indexed text {matchingText.get(item.id)?.page?"· page "+matchingText.get(item.id)?.page:""}:
           {" "+matchingText.get(item.id)?.snippet}</p>:null}
       </div>
       <div className="mt-4 pt-3 border-t border-[var(--line)] text-xs font-semibold text-[var(--green-strong)] flex gap-2 items-center">
         <BookOpen size={14}/>Open material</div>
     </Link>):<div className="col-span-full"><EmptyState title={query?"No matching study material":"No study resources yet"} description="Faculty can upload a set of PDF books or notes for this class. Index PDFs to enable full-text search."/></div>}
   </section>
   {items.length===500?<p className="mt-4 text-xs text-[var(--muted)]">Showing the 500 most recent materials. Narrow the class or semester to find older files.</p>:null}
 </>;
}
