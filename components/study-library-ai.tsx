"use client";
import {AIMarkdown} from "@/components/ai-markdown";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { BookOpen, Brain, WandSparkles } from "lucide-react";
type Card={front:string;back:string};
type Question={question:string;choices:[string,string,string,string];answer:number;explanation:string};
export function StudyLibraryAI({materialId,indexed,staff,isPdf}:{
 materialId:string;indexed:boolean;staff:boolean;isPdf:boolean;
}) {
 const router=useRouter();
 const [busy,setBusy]=useState(false);
 const [ocr,setOcr]=useState(false);
 const [focus,setFocus]=useState("");
 const [summary,setSummary]=useState("");
 const [cards,setCards]=useState<Card[]>([]);
 const [quiz,setQuiz]=useState<Question[]>([]);
 const [cardIndex,setCardIndex]=useState(0);
 const [revealed,setRevealed]=useState(false);
 const [answers,setAnswers]=useState<Record<number,number>>({});
 async function run(action:"index"|"summary"|"flashcards"|"quiz"){
   if(busy)return;
   setBusy(true);
   try{
     const res=await fetch("/api/library/ai",{method:"POST",
       headers:{"Content-Type":"application/json"},
       body:JSON.stringify({action,material_id:materialId,use_ocr:ocr,focus})});
     const body=await res.json().catch(()=>({}));
     if(!res.ok)throw new Error(body.error??"AI could not process this resource.");
     if(action==="index"){
       toast.success("Verified document text indexed: "+body.chunks+" sections.");
       router.refresh();
     }
     if(action==="summary"){setSummary(body.summary??"");setCards([]);setQuiz([]);}
     if(action==="flashcards"){setCards(body.cards??[]);setSummary("");setQuiz([]);setCardIndex(0);setRevealed(false);}
     if(action==="quiz"){setQuiz(body.questions??[]);setSummary("");setCards([]);setAnswers({});}
   }catch(error){toast.error(error instanceof Error?error.message:"AI study request failed.");}
   finally{setBusy(false);}
 }
 return <section className="surface p-5 space-y-4">
   <div className="flex items-center gap-2"><WandSparkles size={18} className="text-[var(--green-strong)]"/><h2 className="font-semibold">Study this material with AI</h2></div>
   <p className="text-xs text-[var(--muted)]">AI uses verified extracted PDF/TXT text, not an invented summary of the file. Results can contain mistakes; check the source.</p>
   {staff?<div className="space-y-2">
     <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={ocr} onChange={e=>setOcr(e.target.checked)}/>Use OCR for scanned PDFs (may incur AI costs)</label>
     <button className="btn-secondary" type="button" disabled={busy||!isPdf} onClick={()=>void run("index")}>
       Index document text {indexed?"again":""}
     </button>
   </div>:null}
   {!indexed?<p className="text-sm text-[var(--muted)]">This document is not indexed yet. Ask a faculty member to extract it before using AI study tools.</p>:<>
     <input aria-label="Study focus" className="input-base w-full" maxLength={250} value={focus}
       onChange={e=>setFocus(e.target.value)} placeholder="Optional focus: e.g. sorting algorithms, Unit 2"/>
     <div className="flex flex-wrap gap-2">
       <button type="button" disabled={busy} className="btn-secondary" onClick={()=>void run("summary")}><BookOpen size={14}/>Summary</button>
       <button type="button" disabled={busy} className="btn-secondary" onClick={()=>void run("flashcards")}><Brain size={14}/>Flashcards</button>
       <button type="button" disabled={busy} className="btn-secondary" onClick={()=>void run("quiz")}><WandSparkles size={14}/>Practice quiz</button>
     </div>
   </>}
   {busy?<p className="text-xs text-[var(--muted)]">Processing the verified material…</p>:null}
   {summary?<article className="leading-7 text-sm rounded-xl bg-[var(--surface-2)] p-4"><AIMarkdown value={summary}/></article>:null}
   {cards.length>0?<section className="rounded-xl bg-[var(--surface-2)] p-4 space-y-4">
     <div className="text-xs text-[var(--muted)]">Flashcard {cardIndex+1} of {cards.length}</div>
     <button type="button" onClick={()=>setRevealed(v=>!v)}
       className="w-full min-h-36 rounded-lg border border-[var(--line)] p-5 text-center text-lg font-medium">
       {revealed?cards[cardIndex].back:cards[cardIndex].front}
       <span className="block mt-3 text-xs text-[var(--muted)]">Tap to {revealed?"hide":"reveal"} answer</span>
     </button>
     <div className="flex justify-between">
       <button type="button" className="btn-secondary" disabled={cardIndex===0} onClick={()=>{setCardIndex(i=>i-1);setRevealed(false);}}>Previous</button>
       <button type="button" className="btn-secondary" disabled={cardIndex===cards.length-1} onClick={()=>{setCardIndex(i=>i+1);setRevealed(false);}}>Next</button>
     </div>
   </section>:null}
   {quiz.length>0?<section className="space-y-5">
     <p className="text-xs text-[var(--muted)]">Practice only · not an official graded course assessment</p>
     {quiz.map((question,i)=><div className="rounded-xl border border-[var(--line)] p-4 space-y-3" key={i}>
       <h3 className="text-sm font-semibold">{i+1}. {question.question}</h3>
       {question.choices.map((choice,j)=><button type="button" key={j} disabled={answers[i]!==undefined}
         onClick={()=>setAnswers(current=>({...current,[i]:j}))}
         className={"w-full text-left p-3 rounded-lg border text-xs "+
           (answers[i]!==undefined&&j===question.answer?"border-emerald-500 bg-[var(--green-soft)]":
             answers[i]===j?"border-red-500":"border-[var(--line)]")}>{choice}</button>)}
       {answers[i]!==undefined?<p className="text-xs">
         {answers[i]===question.answer?"Correct.":"Not quite. "+(question.answer+1)+" is correct."}
         {" "+question.explanation}</p>:null}
     </div>)}
     <p className="text-sm font-semibold">Score: {quiz.filter((q,i)=>answers[i]===q.answer).length}/{quiz.length}</p>
   </section>:null}
 </section>;
}
