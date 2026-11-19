"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, BookOpen, CheckCircle2, Clock3, FilePlus2,
  Layers3, LoaderCircle, Play, Plus, RefreshCw, Sparkles, Trash2, Youtube } from "lucide-react";
type Subject={id:string;name:string;code:string};
type Course={id:string;title:string;subject_id:string;status:string};
type Source={id:string;course_id:string;playlist_id:string;title:string|null;
 sync_enabled:boolean;automatic_additions:boolean;last_checked_at:string|null};
type Job={id:string;playlist_id:string;playlist_title?:string|null;status:string;
 failure_message?:string|null;processed_count?:number;expected_count?:number;
 target_course_id?:string|null;mode?:string};
type Video={id:string;video_id:string|null;playlist_position:number;title:string;
 description:string;duration_seconds:number;thumbnail_url:string|null;
 availability:string;selected:boolean;existing?:boolean;reordered?:boolean};
type Group={id:string;title:string;ids:string[]};
type Detail={job:{id:string;status:string;title:string|null;description:string|null;total:number;
 processed:number;thumbnail:string|null;failure:string|null;mode:string;next_page:boolean;
 target_course_id:string|null};
 videos:Video[];page:number;has_more:boolean};
const input="input-base w-full mt-2";
async function jsonFetch(url:string,opts?:RequestInit):Promise<Record<string,unknown>>{
 const response=await fetch(url,opts);
 const data=await response.json().catch(()=>({})) as Record<string,unknown>;
 if(!response.ok)throw new Error(String(data.error??"This playlist request failed. Please retry."));
 return data;
}
async function post(url:string,payload:unknown){
 return jsonFetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
}
function duration(seconds:number){
 const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=seconds%60;
 return h?String(h)+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0"):
   String(m)+":"+String(s).padStart(2,"0");
}
function makeGroups(videos:Video[],mode:"sequential"|"rule",playlist:string):Group[]{
 const available=videos.filter(v=>v.availability==="available");
 if(!available.length)return [];
 if(mode==="sequential")return[{id:crypto.randomUUID(),title:playlist||"All lectures",
   ids:available.map(v=>v.id)}];
 const groups:Group[]=[];let group:Group|null=null;
 for(const v of available){
   const match=v.title.match(/(?:^|\s)(?:chapter|unit|part|module|section)\s*(\d+)/i);
   const label=match?"Unit "+match[1]:null;
   if(!group||group.ids.length>=10||label&&label!==group.title){
     group={id:crypto.randomUUID(),title:label??"Chapter "+(groups.length+1),ids:[]};
     groups.push(group);
   }
   group.ids.push(v.id);
 }
 return groups;
}
export function YoutubeImportWizard({subjects}:{subjects:Subject[]}){
 const [subject,setSubject]=useState("");
 const [courseId,setCourseId]=useState("");
 const [mode,setMode]=useState<"import"|"sync">("import");
 const [groupMode,setGroupMode]=useState<"sequential"|"rule"|"ai">("sequential");
 const [urls,setUrls]=useState([""]);
 const [title,setTitle]=useState("");
 const [description,setDescription]=useState("");
 const [courses,setCourses]=useState<Course[]>([]);
 const [sources,setSources]=useState<Source[]>([]);
 const [jobs,setJobs]=useState<Job[]>([]);
 const [selectedJob,setSelectedJob]=useState("");
 const [details,setDetails]=useState<Record<string,Detail>>({});
 const [allVideos,setAllVideos]=useState<Record<string,Video[]>>({});
 const [groups,setGroups]=useState<Record<string,Group[]>>({});
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState("");
 const [resultCourse,setResultCourse]=useState<string|null>(null);
 const [threshold,setThreshold]=useState(90);
 const [minQuiz,setMinQuiz]=useState(50);
 const [minAssignment,setMinAssignment]=useState(50);
 const [quizId,setQuizId]=useState("");
 const [assignmentId,setAssignmentId]=useState("");
 const [approval,setApproval]=useState(false);
 const [assessments,setAssessments]=useState<{quizzes:{id:string;title:string;subject_id:string}[];
   assignments:{id:string;title:string;subject_id:string}[]}>({quizzes:[],assignments:[]});
 const current=details[selectedJob];
 const videos=allVideos[selectedJob]??[];
 const activeGroups=groups[selectedJob]??[];
 const selectedCount=videos.filter(v=>v.selected&&v.availability==="available").length;
 const availableCourses=courses.filter(c=>c.subject_id===subject);
 const applicableSources=sources.filter(s=>s.course_id===courseId);
 const required=useMemo(()=>jobs.filter(j=>j.status!=="cancelled"),[jobs]);
 useEffect(()=>{
   let cancelled=false;
   async function load(){
     try{
       const [options,recent]=await Promise.all([
         jsonFetch("/api/youtube/courses"),jsonFetch("/api/youtube/imports"),
       ]);
       if(cancelled)return;
       setCourses((options.courses??[]) as Course[]);
       setSources((options.sources??[]) as Source[]);
       setAssessments({quizzes:(options.quizzes??[]) as typeof assessments.quizzes,
         assignments:(options.assignments??[]) as typeof assessments.assignments});
       setJobs((recent.jobs??[]) as Job[]);
     }catch{/* Feature still shows setup guidance before SQL 045 is installed. */}
   }
   void load();
   return()=>{cancelled=true;};
   // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 async function reloadDetail(id:string){
   const detail=await jsonFetch("/api/youtube/imports/"+id) as unknown as Detail;
   const full:Video[]=[...detail.videos];
   let page=1,more=detail.has_more;
   while(more&&page<12){
     const other=await jsonFetch("/api/youtube/imports/"+id+"?page="+page) as unknown as Detail;
     full.push(...other.videos);more=other.has_more;page++;
   }
   setDetails(current=>({...current,[id]:detail}));
   setAllVideos(current=>({...current,[id]:full}));
   setGroups(current=>({...current,[id]:makeGroups(full,"sequential",detail.job.title??"Lectures")}));
   setJobs(current=>current.map(j=>j.id===id?{
     ...j,status:detail.job.status,playlist_title:detail.job.title,
     processed_count:detail.job.processed,expected_count:detail.job.total,
   }:j));
   if(more)toast.warning("This playlist has more than 1,200 videos. Import it in smaller sections; the job retains all fetched videos.");
 }
 async function processUntilReview(id:string){
   for(let iteration=0;iteration<120;iteration++){
     const data=await post("/api/youtube/imports/"+id+"/process",{action:"process"});
     const status=String(data.status??"");
     const count=Number(data.processed??0);
     setProgress("Fetching YouTube videos · "+count+" processed");
     if(status==="queued")continue;
     if(status==="busy"){
       await new Promise(resolve=>setTimeout(resolve,1500));continue;
     }
     if(status==="failed")throw new Error(String(data.error??"YouTube import failed."));
     if(status==="review"){await reloadDetail(id);return;}
     throw new Error("Import paused. Select Continue Import to resume.");
   }
   throw new Error("A large import was checkpointed. Continue processing from the saved job.");
 }
 async function begin(event:React.FormEvent){
   event.preventDefault();
   if(!subject||!urls.some(s=>s.trim())){toast.error("Select a subject and enter a playlist.");return;}
   if(mode==="sync"&&!courseId){toast.error("Select the linked course to synchronize.");return;}
   setBusy(true);setResultCourse(null);
   try{
     const data=await post("/api/youtube/imports",{
       urls:urls.filter(v=>v.trim()),subject_id:subject,course_id:courseId||null,
       mode,grouping:groupMode,idempotency_key:crypto.randomUUID(),
     });
     const newJobs=(data.jobs??[]) as Job[];
     setJobs(previous=>[...newJobs,...previous.filter(old=>!newJobs.some(job=>job.id===old.id))]);
     if(!newJobs.length)throw new Error("No playlist jobs were created.");
     setSelectedJob(newJobs[0].id);
     for(const job of newJobs){
       setProgress("Importing playlist "+job.playlist_id);
       if(["review","applied"].includes(job.status)){await reloadDetail(job.id);continue;}
       await processUntilReview(job.id);
     }
     toast.success("Playlist data fetched. Review lectures before creating the course.");
   }catch(error){toast.error(error instanceof Error?error.message:"Could not fetch playlists.");}
   finally{setBusy(false);setProgress("");}
 }
 async function continueJob(id:string){
   setBusy(true);
   try{await processUntilReview(id);setSelectedJob(id);toast.success("Playlist ready for review.");}
   catch(error){toast.error(error instanceof Error?error.message:"Import still pending.");}
   finally{setBusy(false);setProgress("");}
 }
 function updateVideo(id:string,patch:Partial<Video>){
   setAllVideos(existing=>({...existing,[selectedJob]:
     (existing[selectedJob]??[]).map(v=>v.id===id?{...v,...patch}:v)}));
 }
 function regroup(newMode:"sequential"|"rule"){
   setGroupMode(newMode);
   setGroups(current=>({...current,[selectedJob]:makeGroups(videos,newMode,details[selectedJob]?.job.title??"Lectures")}));
 }
 function moveVideo(groupId:string,id:string,delta:number){
   setGroups(prev=>({...prev,[selectedJob]:(prev[selectedJob]??[]).map(g=>{
     if(g.id!==groupId)return g;
     const ids=[...g.ids],index=ids.indexOf(id),next=index+delta;
     if(index<0||next<0||next>=ids.length)return g;
     [ids[index],ids[next]]=[ids[next],ids[index]];return{...g,ids};
   })}));
 }
 function relocate(id:string,groupId:string){
   setGroups(prev=>{
     const list=(prev[selectedJob]??[]).map(g=>({...g,ids:g.ids.filter(x=>x!==id)}));
     return {...prev,[selectedJob]:list.map(g=>g.id===groupId?{...g,ids:[...g.ids,id]}:g)};
   });
 }
 function changeGroup(id:string,change:Partial<Group>){
   setGroups(prev=>({...prev,[selectedJob]:(prev[selectedJob]??[]).map(g=>g.id===id?{...g,...change}:g)}));
 }
 async function aiGroup(){
   setBusy(true);
   try{
     const data=await post("/api/youtube/ai",{job_id:selectedJob});
     const modules=(data.modules??[]) as {title:string;ids:string[]}[];
     const groups=modules.map(m=>({id:crypto.randomUUID(),title:m.title,ids:m.ids}));
     const placed=new Set(groups.flatMap(x=>x.ids));
     const leftovers=videos.filter(v=>v.availability==="available"&&!placed.has(v.id)).map(v=>v.id);
     if(leftovers.length)groups.push({id:crypto.randomUUID(),title:"Other lectures",ids:leftovers});
     setGroups(prev=>({...prev,[selectedJob]:groups}));
     setGroupMode("ai");
     if(data.limited)toast.message("AI grouped the first 60 lectures; remaining lectures are in Other lectures.");
     toast.success("AI suggested chapters using video titles and descriptions.");
     if(typeof data.description==="string"&&data.description)setDescription(data.description);
   }catch(error){toast.error(error instanceof Error?error.message:"AI grouping unavailable. Choose rule-based grouping.");}
   finally{setBusy(false);}
 }
 async function saveDraft(jobId:string){
   const files=allVideos[jobId]??[];
   for(let start=0;start<files.length;start+=100){
     await post("/api/youtube/imports/"+jobId+"/draft",{items:files.slice(start,start+100).map(v=>({
       id:v.id,title:v.title,description:v.description,selected:v.selected,
     }))});
   }
 }
 async function applyAll(publish:boolean){
   const reviewJobs=required.filter(j=>details[j.id]?.job.status==="review");
   if(!reviewJobs.length){toast.error("Fetch and review a playlist before importing.");return;}
   if(reviewJobs.some(j=>!(allVideos[j.id]??[]).some(v=>v.selected&&v.availability==="available"))){
     toast.error("Each playlist needs at least one selected, embeddable lecture.");return;
   }
   setBusy(true);
   let target=courseId||null;
   try{
     for(const [i,job] of reviewJobs.entries()){
       setProgress("Saving curriculum · playlist "+(i+1)+"/"+reviewJobs.length);
       await saveDraft(job.id);
       if(target&&!details[job.id]?.job.target_course_id){
         await post("/api/youtube/imports/"+job.id+"/target",{course_id:target});
       }
       const playlistVideos=allVideos[job.id]??[];
       const lookup=new Map(playlistVideos.map(v=>[v.id,v]));
       const modules=(groups[job.id]??[]).map(g=>({
         title:g.title.trim(),
         lessons:g.ids.map(id=>lookup.get(id)).filter((v):v is Video=>!!v&&v.selected&&v.availability==="available")
           .map(v=>({item_id:v.id,title:v.title,description:v.description})),
       })).filter(g=>g.lessons.length);
       if(!modules.length)continue;
       const data=await post("/api/youtube/imports/"+job.id+"/apply",{
         title:(title||details[job.id].job.title||"YouTube course").slice(0,180),
         description:description||details[job.id].job.description||"",
         modules,publish:false,overwrite_titles:false,
       });
       if(!data.course_id)throw new Error("Course import returned no course ID.");
       target=String(data.course_id);
     }
     if(!target)throw new Error("No course was saved.");
     await post("/api/youtube/courses/rules",{
       action:"requirements",course_id:target,threshold,quiz_id:quizId||null,
       assignment_id:assignmentId||null,min_quiz_percent:minQuiz,
       min_assignment_percent:minAssignment,faculty_approval_required:approval,
     });
     if(publish)await post("/api/youtube/courses/rules",{action:"publish",course_id:target});
     setResultCourse(target);
     toast.success(publish?"Course published. Students can start learning.":"Course draft saved. Publish when ready.");
     const options=await jsonFetch("/api/youtube/courses");
     setCourses((options.courses??[]) as Course[]);
     setSources((options.sources??[]) as Source[]);
   }catch(error){
     toast.error(error instanceof Error?error.message:"Course saving failed. Saved jobs can be resumed safely.");
   }finally{setBusy(false);setProgress("");}
 }
 async function saveSource(source:Source,auto:boolean,sync:boolean){
   try{
     await post("/api/youtube/sources",{
       source_id:source.id,sync_enabled:sync,automatic_additions:auto,
     });
     setSources(prev=>prev.map(s=>s.id===source.id?{...s,sync_enabled:sync,automatic_additions:auto}:s));
     toast.success("Playlist sync settings saved.");
   }catch(error){toast.error(error instanceof Error?error.message:"Could not update sync settings.");}
 }
 return <div className="surface min-w-0 space-y-5 p-4 sm:p-6">
   <header className="flex gap-3 items-start border-b border-[var(--line)] pb-5">
     <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green-strong)]"><Youtube size={22}/></span>
     <div><h2 className="text-lg font-semibold">Smart YouTube playlist importer</h2>
       <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Turn official YouTube playlists into editable chapter-based courses, without copying video links one by one.</p>
     </div>
   </header>
   <div className="flex gap-2 text-xs text-[var(--muted)]" aria-label="Import steps">
     {["1. Connect","2. Review lectures","3. Organize & publish"].map((t,i)=><div key={t} className={"rounded-lg px-3 py-2 "+(i===0||i===1&&current||i===2&&selectedCount?"bg-[var(--green-soft)] text-[var(--green-strong)]":"bg-[var(--surface-2)]")}>{t}</div>)}
   </div>
   <form onSubmit={begin} className="space-y-4">
     <div className="grid gap-3 sm:grid-cols-2">
       <label className="text-xs font-semibold">Subject
         <select className={input} required value={subject} disabled={busy}
           onChange={e=>{setSubject(e.target.value);setCourseId("");}}>
           <option value="">Choose an assigned subject</option>
           {subjects.map(s=><option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
         </select>
       </label>
       <label className="text-xs font-semibold">Import destination
         <select className={input} value={courseId} disabled={busy}
           onChange={e=>setCourseId(e.target.value)}>
           {mode==="import"?<option value="">Create a new course</option>:<option value="">Choose course for synchronization</option>}
           {availableCourses.map(c=><option key={c.id} value={c.id}>{c.title}{c.status==="archived"?" (draft)":""}</option>)}
         </select>
       </label>
       <label className="text-xs font-semibold">Operation
         <select className={input} value={mode} disabled={busy}
           onChange={e=>setMode(e.target.value as "import"|"sync")}>
           <option value="import">Import new lectures</option>
           <option value="sync">Synchronize an existing playlist</option>
         </select>
       </label>
       <label className="text-xs font-semibold">Chapter grouping
         <select className={input} value={groupMode} disabled={busy}
           onChange={e=>setGroupMode(e.target.value as "sequential"|"rule"|"ai")}>
           <option value="sequential">Sequential lectures</option>
           <option value="rule">Rule-based units</option>
           <option value="ai">AI-assisted suggestions (optional)</option>
         </select>
       </label>
     </div>
     <div className="space-y-2">
       <div className="flex justify-between items-center">
         <span className="text-xs font-semibold">YouTube playlist links (up to 5)</span>
         <button type="button" className="btn-secondary" disabled={busy||urls.length>=5}
           onClick={()=>setUrls(v=>[...v,""])}><Plus size={14}/>Add another playlist</button>
       </div>
       {urls.map((url,i)=><div key={i} className="flex gap-2 items-center">
         <input className="input-base w-full" type="url" required aria-label={"Playlist URL "+(i+1)}
           placeholder="https://www.youtube.com/playlist?list=PL..." value={url} disabled={busy}
           onChange={e=>setUrls(v=>v.map((x,k)=>k===i?e.target.value:x))}/>
         {urls.length>1?<button type="button" className="btn-secondary !p-2"
           aria-label={"Remove playlist "+(i+1)} disabled={busy} onClick={()=>setUrls(v=>v.filter((_,k)=>k!==i))}><Trash2 size={14}/></button>:null}
       </div>)}
     </div>
     <button className="btn-primary" type="submit" disabled={busy||!subject||mode==="sync"&&!courseId}>
       {busy?<LoaderCircle size={15} className="animate-spin"/>:<Youtube size={16}/>}
       {busy?"Fetching playlist…":"Fetch and preview playlists"}
     </button>
     {progress?<p role="status" className="text-xs text-[var(--muted)]">{progress}</p>:null}
   </form>
   {applicableSources.length?<section className="border-t border-[var(--line)] pt-4">
     <h3 className="text-sm font-semibold mb-2">Connected playlists and automatic synchronization</h3>
     <p className="text-xs text-[var(--muted)] mb-3">Automatic sync never deletes or overwrites old student progress or certificates. Automatic additions require explicit opt-in.</p>
     <div className="space-y-2">{applicableSources.map(s=><div key={s.id} className="rounded-xl border border-[var(--line)] p-3 flex flex-wrap items-center justify-between gap-3">
       <span className="text-xs font-semibold">{s.title||s.playlist_id}</span>
       <div className="flex flex-wrap gap-4">
         <label className="flex gap-2 items-center text-xs">
           <input type="checkbox" checked={s.sync_enabled}
             onChange={e=>void saveSource(s,s.automatic_additions,e.target.checked)}/>Daily sync</label>
         <label className="flex gap-2 items-center text-xs">
           <input type="checkbox" checked={s.automatic_additions}
             onChange={e=>void saveSource(s,e.target.checked,s.sync_enabled)}/>Auto-add new lectures</label>
       </div>
     </div>)}</div>
   </section>:null}
   {jobs.length?<section className="border-t border-[var(--line)] pt-4 space-y-3">
     <h3 className="text-sm font-semibold">Saved import jobs</h3>
     <div className="flex flex-wrap gap-2">{jobs.slice(0,16).map(j=><button key={j.id} type="button"
       className={selectedJob===j.id?"btn-primary":"btn-secondary"}
       onClick={()=>{setSelectedJob(j.id);if(!details[j.id])void reloadDetail(j.id).catch(e=>toast.error(e.message));}}>
       {j.playlist_title||j.playlist_id.slice(0,18)} · {j.status}
     </button>)}</div>
     {selectedJob&&jobs.find(j=>j.id===selectedJob)?.status!=="applied"?<div className="flex flex-wrap gap-2">
       <button type="button" className="btn-secondary" disabled={busy} onClick={()=>void continueJob(selectedJob)}>
         <RefreshCw size={14}/>Continue / retry fetch</button>
       <button type="button" className="btn-secondary" disabled={busy}
         onClick={()=>void post("/api/youtube/imports/"+selectedJob+"/process",{action:"cancel"})
           .then(()=>{setJobs(jobs=>jobs.map(j=>j.id===selectedJob?{...j,status:"cancelled"}:j));toast.success("Import cancelled.");})
           .catch(e=>toast.error(e.message))}><Trash2 size={14}/>Cancel job</button>
     </div>:null}
   </section>:null}
   {current?.job.status==="review"?<section className="border-t border-[var(--line)] pt-5 space-y-5">
     <div className="flex items-center gap-3">
       {current.job.thumbnail?<img src={current.job.thumbnail} alt="" className="h-16 w-24 rounded-lg object-cover"/>:null}
       <div><h3 className="font-semibold">{current.job.title||"YouTube playlist"}</h3>
         <p className="text-xs text-[var(--muted)]">{current.job.processed} of {current.job.total} video entries fetched · {selectedCount} selected</p></div>
     </div>
     <div className="flex flex-wrap gap-2">
       <button type="button" className="btn-secondary" onClick={()=>setAllVideos(prev=>({...prev,[selectedJob]:videos.map(v=>({
         ...v,selected:v.availability==="available"&&!v.existing,
       }))}))}>Select all new videos</button>
       <button type="button" className="btn-secondary" onClick={()=>setAllVideos(prev=>({...prev,[selectedJob]:videos.map(v=>({...v,selected:false}))}))}>Deselect all</button>
       <button type="button" className="btn-secondary" onClick={()=>regroup("sequential")}><Layers3 size={14}/>Sequential</button>
       <button type="button" className="btn-secondary" onClick={()=>regroup("rule")}><Layers3 size={14}/>Rule-based</button>
       <button type="button" className="btn-secondary" disabled={busy} onClick={()=>void aiGroup()}><Sparkles size={14}/>Suggest chapters with AI</button>
     </div>
     <div className="grid gap-3 sm:grid-cols-2">
       <label className="text-xs font-semibold">Course title
         <input className={input} required minLength={2} maxLength={180} value={title||current.job.title||""}
           onChange={e=>setTitle(e.target.value)}/></label>
       <label className="text-xs font-semibold">Minimum watch completion
         <select className={input} value={threshold} onChange={e=>setThreshold(Number(e.target.value))}>
           {[60,70,75,80,85,90,95,100].map(n=><option key={n} value={n}>{n}% of verified watched timeline</option>)}
         </select>
       </label>
     </div>
     <label className="block text-xs font-semibold">Course overview
       <textarea className={input+" min-h-24"} maxLength={10000} value={description||current.job.description||""}
         onChange={e=>setDescription(e.target.value)}/></label>
     <div className="space-y-4">
       {activeGroups.map((g,i)=><section key={g.id} className="rounded-xl border border-[var(--line)] p-4 space-y-3">
         <div className="flex flex-wrap gap-2 items-center">
           <span className="font-semibold text-xs">Chapter {i+1}</span>
           <input className="input-base flex-1 min-w-40" aria-label={"Chapter "+(i+1)+" title"}
             value={g.title} maxLength={180} onChange={e=>changeGroup(g.id,{title:e.target.value})}/>
           <button type="button" className="btn-secondary !p-2" aria-label="Move chapter up"
             disabled={i===0} onClick={()=>setGroups(prev=>({...prev,[selectedJob]:prev[selectedJob].map((_,j)=>prev[selectedJob][j===i-1?i:j===i?i-1:j])}))}><ArrowUp size={14}/></button>
           <button type="button" className="btn-secondary !p-2" aria-label="Move chapter down"
             disabled={i===activeGroups.length-1} onClick={()=>setGroups(prev=>({...prev,[selectedJob]:prev[selectedJob].map((_,j)=>prev[selectedJob][j===i+1?i:j===i?i+1:j])}))}><ArrowDown size={14}/></button>
           {activeGroups.length>1?<button type="button" className="btn-secondary !p-2" aria-label="Remove chapter"
             onClick={()=>setGroups(prev=>{
               const list=[...(prev[selectedJob]??[])];
               const removed=list.splice(i,1)[0];
               list[0]={...list[0],ids:[...list[0].ids,...removed.ids]};
               return {...prev,[selectedJob]:list};
             })}><Trash2 size={14}/></button>:null}
         </div>
         <div className="space-y-2">
           {g.ids.map((id,index)=>{
             const v=videos.find(x=>x.id===id);if(!v)return null;
             return <div key={id} className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3">
               <div className="flex items-center gap-3">
                 <input type="checkbox" className="h-4 w-4" disabled={v.availability!=="available"}
                   checked={v.selected&&v.availability==="available"}
                   onChange={e=>updateVideo(id,{selected:e.target.checked})}
                   aria-label={"Include "+v.title}/>
                 {v.thumbnail_url?<img src={v.thumbnail_url} alt="" loading="lazy" className="h-12 w-20 rounded object-cover"/>:null}
                 <div className="flex-1 min-w-0">
                   <label className="text-[10px] font-semibold">Lecture title
                     <input value={v.title} className="input-base mt-1 w-full" maxLength={180}
                       onChange={e=>updateVideo(id,{title:e.target.value})}/>
                   </label>
                   <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-[var(--muted)]">
                     <span><Clock3 size={11} className="inline"/>{duration(v.duration_seconds)}</span>
                     {v.existing?<span>Already in course</span>:null}
                     {v.reordered?<span>Reordered on YouTube</span>:null}
                   </div>
                 </div>
                 <div className="flex flex-col gap-1">
                   <button type="button" className="btn-secondary !p-1.5" aria-label="Move lecture earlier"
                     disabled={index===0} onClick={()=>moveVideo(g.id,id,-1)}><ArrowUp size={13}/></button>
                   <button type="button" className="btn-secondary !p-1.5" aria-label="Move lecture later"
                     disabled={index===g.ids.length-1} onClick={()=>moveVideo(g.id,id,1)}><ArrowDown size={13}/></button>
                 </div>
               </div>
               <details className="mt-2"><summary className="cursor-pointer text-xs text-[var(--muted)]">Edit lecture description & chapter</summary>
                 <textarea value={v.description} onChange={e=>updateVideo(id,{description:e.target.value})}
                   maxLength={20000} className={input+" min-h-20"} aria-label="Lecture description"/>
                 <select className={input} value={g.id} aria-label="Move lecture to chapter"
                   onChange={e=>relocate(id,e.target.value)}>
                   {activeGroups.map(target=><option key={target.id} value={target.id}>{target.title}</option>)}
                 </select>
               </details>
             </div>;
           })}
         </div>
       </section>)}
       <button type="button" className="btn-secondary" onClick={()=>setGroups(prev=>({...prev,
         [selectedJob]:[...(prev[selectedJob]??[]),{id:crypto.randomUUID(),title:"New chapter",ids:[]}]}))}>
         <Plus size={14}/>Add chapter</button>
     </div>
     {videos.filter(v=>v.availability!=="available").length>0?<p className="text-xs text-amber-600">
       {videos.filter(v=>v.availability!=="available").length} unavailable, deleted, private, non-embeddable or duplicate videos were excluded from import.</p>:null}
     <div className="rounded-xl border border-[var(--line)] p-4 space-y-3">
       <h3 className="font-semibold text-sm">Optional academic completion requirements</h3>
       <p className="text-xs text-[var(--muted)]">These are enforced before the college certificate is issued. Existing graded assessments continue to work normally.</p>
       <div className="grid gap-3 sm:grid-cols-2">
         <label className="text-xs">Required quiz
           <select className={input} value={quizId} onChange={e=>setQuizId(e.target.value)}>
             <option value="">None</option>
             {assessments.quizzes.filter(q=>q.subject_id===subject).map(q=><option key={q.id} value={q.id}>{q.title}</option>)}
           </select>
         </label>
         <label className="text-xs">Minimum quiz score (%)
           <input className={input} type="number" min={0} max={100} value={minQuiz}
             onChange={e=>setMinQuiz(Math.max(0,Math.min(100,Number(e.target.value)||0)))}/>
         </label>
         <label className="text-xs">Required assignment
           <select className={input} value={assignmentId} onChange={e=>setAssignmentId(e.target.value)}>
             <option value="">None</option>
             {assessments.assignments.filter(q=>q.subject_id===subject).map(q=><option key={q.id} value={q.id}>{q.title}</option>)}
           </select>
         </label>
         <label className="text-xs">Minimum assignment score (%)
           <input className={input} type="number" min={0} max={100} value={minAssignment}
             onChange={e=>setMinAssignment(Math.max(0,Math.min(100,Number(e.target.value)||0)))}/>
         </label>
       </div>
       <label className="flex items-center gap-2 text-xs">
         <input type="checkbox" checked={approval} onChange={e=>setApproval(e.target.checked)}/>Faculty approval required before issuing certificate
       </label>
     </div>
     <div className="flex flex-wrap gap-3">
       <button className="btn-secondary" type="button" disabled={busy}
         onClick={()=>void saveDraft(selectedJob).then(()=>toast.success("Lecture selections saved to your import draft.")).catch(e=>toast.error(e.message))}>
         <FilePlus2 size={14}/>Save preview draft
       </button>
       <button className="btn-secondary" type="button" disabled={busy||!selectedCount}
         onClick={()=>void applyAll(false)}><BookOpen size={14}/>Create course draft</button>
       <button className="btn-primary" type="button" disabled={busy||!selectedCount}
         onClick={()=>void applyAll(true)}><CheckCircle2 size={14}/>Publish complete course</button>
     </div>
   </section>:null}
   {resultCourse?<div role="status" className="rounded-xl border border-emerald-500/40 bg-[var(--green-soft)] p-5">
     <h3 className="font-semibold">Course saved successfully</h3>
     <p className="mt-1 text-xs text-[var(--muted)]">Lessons, imported video references and academic rules have been committed.</p>
     <div className="mt-4 flex flex-wrap gap-3">
       <Link href={"/courses/"+resultCourse} className="btn-primary"><Play size={14}/>Open course</Link>
       <Link href={"/faculty/progress?course="+resultCourse} className="btn-secondary">Student progress</Link>
       <button type="button" className="btn-secondary" onClick={()=>void post("/api/youtube/courses/rules",
         {action:"publish",course_id:resultCourse}).then(()=>toast.success("Course published.")).catch(e=>toast.error(e.message))}>
         Publish saved draft
       </button>
     </div>
   </div>:null}
   <p className="text-[11px] leading-5 text-[var(--muted)]">YouTube metadata is refreshed or removed within 30 days. Videos remain hosted by YouTube. Playback tracking is based on plausible server-timed reports, not tamper-proof proof of attention. No transcripts are scraped.</p>
 </div>;
}
