"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, BookOpen, Plus, Save } from "lucide-react";

type SavedLesson={
  id:string;title:string;plain_text:string|null;video_url:string|null;
  is_published:boolean;position:number;
};
type SavedModule={
  id:string;title:string;description:string|null;position:number;
  course_lessons:SavedLesson[]|null;
};
type SavedCourse={
  id:string;subject_id:string;title:string;description:string|null;status:string;updated_at:string;
};
type DraftLesson={
  localId:string;id?:string;title:string;plain_text:string;
  video_url:string;is_published:boolean;
};
type DraftModule={
  localId:string;id?:string;title:string;description:string;
  lessons:DraftLesson[];
};
function newLesson():DraftLesson{
  return {localId:crypto.randomUUID(),title:"",plain_text:"",video_url:"",is_published:false};
}
function newModule():DraftModule{
  return {localId:crypto.randomUUID(),title:"",description:"",lessons:[newLesson()]};
}
export function CourseEditForm({course,modules}:{
  course:SavedCourse;modules:SavedModule[];
}) {
  const router=useRouter();
  const [title,setTitle]=useState(course.title);
  const [description,setDescription]=useState(course.description??"");
  const [published,setPublished]=useState(course.status==="active");
  const [chapters,setChapters]=useState<DraftModule[]>(()=>modules
    .slice().sort((a,b)=>a.position-b.position).map((module)=>({
      localId:module.id,id:module.id,title:module.title,
      description:module.description??"",
      lessons:(module.course_lessons??[]).slice().sort((a,b)=>a.position-b.position)
        .map((lesson)=>({
          localId:lesson.id,id:lesson.id,title:lesson.title,
          plain_text:lesson.plain_text??"",video_url:lesson.video_url??"",
          is_published:lesson.is_published,
        })),
    })));
  const [busy,setBusy]=useState(false);
  const [preview,setPreview]=useState(false);
  const total=chapters.reduce((n,chapter)=>n+chapter.lessons.length,0);
  const valid=title.trim().length>=2 && chapters.length>0 &&
    chapters.every((chapter)=>chapter.title.trim().length>=2 && chapter.lessons.length>0
      && chapter.lessons.every((lesson)=>lesson.title.trim().length>=2));
  function updateModule(id:string,patch:Partial<DraftModule>){
    setChapters((current)=>current.map((chapter)=>chapter.localId===id?{...chapter,...patch}:chapter));
  }
  function updateLesson(moduleId:string,lessonId:string,patch:Partial<DraftLesson>){
    setChapters((current)=>current.map((chapter)=>chapter.localId===moduleId
      ?{...chapter,lessons:chapter.lessons.map((lesson)=>lesson.localId===lessonId
        ?{...lesson,...patch}:lesson)}:chapter));
  }
  function moveModule(index:number,to:number){
    setChapters((current)=>{
      if(to<0||to>=current.length)return current;
      const next=current.slice();[next[index],next[to]]=[next[to],next[index]];return next;
    });
  }
  function moveLesson(moduleId:string,index:number,to:number){
    setChapters((current)=>current.map((chapter)=>{
      if(chapter.localId!==moduleId||to<0||to>=chapter.lessons.length)return chapter;
      const next=chapter.lessons.slice();[next[index],next[to]]=[next[to],next[index]];
      return {...chapter,lessons:next};
    }));
  }
  async function save(event:React.FormEvent){
    event.preventDefault();
    if(!valid||busy)return;
    setBusy(true);
    try{
      const response=await fetch("/api/courses/manage",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"update",course_id:course.id,subject_id:course.subject_id,
          title:title.trim(),description,publish:published,revision:course.updated_at,
          modules:chapters.map((chapter)=>({
            ...(chapter.id?{id:chapter.id}:{}),
            title:chapter.title,description:chapter.description||null,
            lessons:chapter.lessons.map((lesson)=>({
              ...(lesson.id?{id:lesson.id}:{}),
              title:lesson.title,plain_text:lesson.plain_text,
              video_url:lesson.video_url||null,is_published:lesson.is_published,
            })),
          })),
        }),
      });
      const data=await response.json().catch(()=>({error:"Unreadable server response."})) as {error?:string};
      if(!response.ok)throw new Error(data.error??"Could not save the course.");
      toast.success("Course curriculum saved in one transaction.");
      router.refresh();
    }catch(error){
      toast.error(error instanceof Error?error.message:"Course update failed.");
    }finally{setBusy(false);}
  }
  async function archive(){
    if(busy||!window.confirm("Archive this course? Unsaved edits will be discarded. Existing student progress will remain."))return;
    setBusy(true);
    try{
      const response=await fetch("/api/courses/manage",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"archive",course_id:course.id,subject_id:course.subject_id,revision:course.updated_at}),
      });
      const data=await response.json().catch(()=>({error:"Unreadable server response."})) as {error?:string};
      if(!response.ok)throw new Error(data.error??"Could not archive the course.");
      setPublished(false);toast.success("Course archived. Student progress was preserved.");
      router.refresh();
    }catch(error){toast.error(error instanceof Error?error.message:"Archive failed.");}
    finally{setBusy(false);}
  }
  return <form onSubmit={save} className="space-y-5">
    <section className="surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-base font-semibold">Course settings</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Existing lecture IDs are retained to preserve student progress.</p></div>
        <Link href={"/courses/"+course.id} className="btn-secondary">View course</Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">Course title
          <input className="input-base mt-2" required minLength={2} maxLength={180}
            value={title} onChange={(event)=>setTitle(event.target.value)}/>
        </label>
        <label className="text-xs font-semibold">Publication state
          <select className="input-base mt-2" value={published?"active":"archived"}
            onChange={(event)=>setPublished(event.target.value==="active")}>
            <option value="active">Published to learners</option>
            <option value="archived">Draft / archived (staff only)</option>
          </select>
        </label>
      </div>
      <label className="mt-3 block text-xs font-semibold">Course description
        <textarea className="input-base mt-2 min-h-24" maxLength={5000}
          value={description} onChange={(event)=>setDescription(event.target.value)}/>
      </label>
    </section>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold">Chapters and lectures</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{chapters.length} chapters · {total} lectures. Unpublish existing lectures instead of removing academic history.</p></div>
      <button type="button" className="btn-secondary" disabled={chapters.length>=30||total>=300}
        onClick={()=>setChapters((items)=>[...items,newModule()])}><Plus size={14}/>Add chapter</button>
    </div>
    {chapters.map((chapter,index)=><section key={chapter.localId} className="surface p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Chapter {index+1}</h3>
        <div className="flex gap-1">
          <button type="button" aria-label={"Move chapter "+(index+1)+" up"}
            disabled={index===0} className="btn-secondary !p-2" onClick={()=>moveModule(index,index-1)}><ArrowUp size={14}/></button>
          <button type="button" aria-label={"Move chapter "+(index+1)+" down"}
            disabled={index===chapters.length-1} className="btn-secondary !p-2" onClick={()=>moveModule(index,index+1)}><ArrowDown size={14}/></button>
          {!chapter.id&&chapters.length>1&&<button type="button" className="btn-secondary"
            onClick={()=>setChapters((items)=>items.filter((item)=>item.localId!==chapter.localId))}>Remove draft</button>}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">Chapter title
          <input className="input-base mt-1" required minLength={2} maxLength={180}
            value={chapter.title} onChange={(event)=>updateModule(chapter.localId,{title:event.target.value})}/>
        </label>
        <label className="text-xs font-semibold">Chapter overview
          <input className="input-base mt-1" maxLength={2000}
            value={chapter.description} onChange={(event)=>updateModule(chapter.localId,{description:event.target.value})}/>
        </label>
      </div>
      <div className="mt-4 space-y-3">{chapter.lessons.map((lesson,lessonIndex)=>
        <article key={lesson.localId} className="rounded-xl border border-[var(--line)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold">Lecture {lessonIndex+1}</h4>
            <div className="flex flex-wrap gap-1">
              <button type="button" aria-label={"Move lecture "+(lessonIndex+1)+" up"}
                className="btn-secondary !p-2" disabled={lessonIndex===0}
                onClick={()=>moveLesson(chapter.localId,lessonIndex,lessonIndex-1)}><ArrowUp size={14}/></button>
              <button type="button" aria-label={"Move lecture "+(lessonIndex+1)+" down"}
                className="btn-secondary !p-2" disabled={lessonIndex===chapter.lessons.length-1}
                onClick={()=>moveLesson(chapter.localId,lessonIndex,lessonIndex+1)}><ArrowDown size={14}/></button>
              {!lesson.id&&chapter.lessons.length>1&&<button type="button" className="btn-secondary"
                onClick={()=>updateModule(chapter.localId,{lessons:chapter.lessons.filter((x)=>x.localId!==lesson.localId)})}>Remove draft</button>}
            </div>
          </div>
          <label className="mt-3 block text-xs font-semibold">Title
            <input className="input-base mt-1" required minLength={2} maxLength={180}
              value={lesson.title} onChange={(event)=>updateLesson(chapter.localId,lesson.localId,{title:event.target.value})}/>
          </label>
          <label className="mt-3 block text-xs font-semibold">Learning notes
            <textarea className="input-base mt-1 min-h-28" maxLength={20000}
              value={lesson.plain_text} onChange={(event)=>updateLesson(chapter.localId,lesson.localId,{plain_text:event.target.value})}/>
          </label>
          <label className="mt-3 block text-xs font-semibold">Video HTTPS link · optional
            <input className="input-base mt-1" type="url" maxLength={2000}
              value={lesson.video_url} onChange={(event)=>updateLesson(chapter.localId,lesson.localId,{video_url:event.target.value})}/>
          </label>
          <label className="mt-3 flex items-center gap-2 text-xs font-medium">
            <input type="checkbox" checked={lesson.is_published}
              onChange={(event)=>updateLesson(chapter.localId,lesson.localId,{is_published:event.target.checked})}/>
            Lecture published within course
          </label>
        </article>)}</div>
      <button type="button" className="btn-secondary mt-3 w-full"
        disabled={chapter.lessons.length>=50||total>=300}
        onClick={()=>updateModule(chapter.localId,{lessons:[...chapter.lessons,newLesson()]})}>
        <Plus size={14}/>Add lecture
      </button>
    </section>)}
    <section className="surface p-5 sm:p-6">
      <div className="flex flex-wrap justify-between gap-3">
        <button type="button" className="btn-secondary" aria-expanded={preview}
          onClick={()=>setPreview((current)=>!current)}>{preview?"Hide preview":"Preview content"}</button>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={busy||!published}
            onClick={archive}>Archive course</button>
          <button type="submit" className="btn-primary" disabled={busy||!valid}>
            <Save size={15}/>{busy?"Saving…":"Save curriculum"}
          </button>
        </div>
      </div>
      {preview&&<div className="mt-4 space-y-4 rounded-xl bg-[var(--surface-2)] p-4">
        <h3 className="text-sm font-semibold">{title}</h3><p className="whitespace-pre-wrap text-xs">{description}</p>
        {chapters.map((chapter,index)=><section key={chapter.localId}>
          <h4 className="text-xs font-semibold">{index+1}. {chapter.title}</h4>
          {chapter.lessons.map((lesson,j)=><div key={lesson.localId} className="mt-2 rounded-lg border border-[var(--line)] p-3">
            <div className="text-xs font-semibold">{index+1}.{j+1} {lesson.title} {lesson.is_published?"· visible":"· draft"}</div>
            <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--muted)]">{lesson.plain_text.slice(0,250)}</p>
          </div>)}
        </section>)}
      </div>}
      <p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">
        All changes are written as one transaction. Existing chapter/lecture IDs may be reordered or updated but never silently removed.
      </p>
    </section>
  </form>;
}
