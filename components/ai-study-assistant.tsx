"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowUp, BrainCircuit, Sparkles, Trash2 } from "lucide-react";

type Reference = { id: string; type: string; title: string; href: string };
type Message = { role: "user" | "assistant"; content: string; sources?: Reference[] };

const suggestedQuestions = [
  "What should I work on next?",
  "Summarize my upcoming deadlines.",
  "Help me understand my class syllabus.",
];

export function AIStudyAssistant({ syllabi }: { syllabi: { id:string; title:string; class_id:string }[] }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<"chat" | "practice" | "revision">("chat");
  const [syllabusId, setSyllabusId] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyWarning, setHistoryWarning] = useState("");
  const [clearing, setClearing] = useState(false);
  const pendingRetry=useRef<{
    text:string;mode:string;syllabusId:string;requestId:string
  }|null>(null);

  useEffect(()=>{
    let alive=true;
    async function restore(){
      try{
        const response=await fetch("/api/ai/study-history",{cache:"no-store"});
        const result=await response.json() as {items?:{
          question:string;answer:string;
          sources?:Reference[];created_at:string;
        }[];error?:string};
        if(!response.ok)throw new Error(result.error??"Could not load saved study history.");
        if(alive){
          const restored=(result.items??[]).flatMap((item):Message[]=>[
            {role:"user",content:item.question},
            {role:"assistant",content:item.answer,sources:item.sources??[]},
          ]);
          setMessages((current)=>current.length?current:restored);
          setHistoryWarning("");
        }
      }catch(error){
        if(alive)setHistoryWarning(error instanceof Error?error.message:"History not available.");
      }finally{if(alive)setHistoryLoaded(true);}
    }
    void restore();
    return ()=>{alive=false;};
  },[]);

  async function clearHistory(){
    if(clearing||!window.confirm("Permanently clear your saved AI study conversation?"))return;
    setClearing(true);
    try{
      const response=await fetch("/api/ai/study-history",{method:"DELETE"});
      const result=await response.json().catch(()=>({error:"Unreadable server response."})) as {error?:string};
      if(!response.ok)throw new Error(result.error??"Could not clear history.");
      pendingRetry.current=null;
      setMessages([]);setHistoryWarning("");toast.success("Private study history cleared.");
    }catch(error){toast.error(error instanceof Error?error.message:"Could not clear history.");}
    finally{setClearing(false);}
  }


  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || sending) return;
    const history = messages.slice(-8).map(({ role, content }) => ({ role, content }));
    const retry=pendingRetry.current;
    const requestId=retry&&retry.text===text&&retry.mode===mode&&retry.syllabusId===syllabusId
      ?retry.requestId:crypto.randomUUID();
    pendingRetry.current={text,mode,syllabusId,requestId};
    setMessages((current) => [...current, { role: "user", content: text }]);
    setQuestion("");
    setSending(true);
    try {
      const response = await fetch("/api/ai/study-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history, mode, syllabus_id: syllabusId || null, request_id: requestId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The study assistant could not answer.");
      pendingRetry.current=null;
      setMessages((current) => [...current, { role: "assistant", content: result.answer, sources: result.sources ?? [] }]);
      setHistoryWarning(result.history_saved===false
        ?result.history_warning??"The answer was generated but could not be saved to private history."
        :"");
    } catch (error) {
      setMessages((current) => current.filter((message, index) => !(index === current.length - 1 && message.role === "user" && message.content === text)));
      setQuestion(text);
      toast.error(error instanceof Error ? error.message : "The study assistant could not answer.");
    } finally {
      setSending(false);
    }
  }

  return <section className="surface mx-auto flex min-h-[min(70vh,760px)] max-w-4xl flex-col overflow-hidden">
    <header className="flex items-center gap-3 border-b border-[var(--line)] p-5 sm:p-6">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--green-soft)] text-[var(--green-strong)]"><BrainCircuit size={18}/></div>
      <div><h2 className="text-sm font-semibold">Campus AI Study Copilot</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Grounded in accessible lessons, course notes, syllabus outlines and assignments.</p></div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span className="status-pill hidden sm:inline-flex"><Sparkles size={11}/>College AI</span>
        <button type="button" className="btn-secondary !px-2.5 !py-2 text-[10px]"
          disabled={clearing||sending||!messages.length||!historyLoaded}
          onClick={()=>void clearHistory()} aria-label="Clear private AI chat history">
          <Trash2 size={13}/>Clear
        </button>
      </div>
    </header>

    {historyWarning&&<p role="alert" className="border-b border-amber-500/30 bg-amber-500/10 px-5 py-3 text-xs leading-5">
      {historyWarning}
    </p>}
    <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" aria-live="polite">
      {!messages.length ? <div className="mx-auto max-w-xl py-10 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--surface-2)] text-[var(--green-strong)]"><Sparkles size={20}/></div>
        <h3 className="mt-4 text-lg font-semibold tracking-tight">What are you working on?</h3>
        <p className="mt-2 text-xs leading-6 text-[var(--muted)]">Ask about what is due, upcoming quizzes, your class syllabus, or a concept from published course material.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">{suggestedQuestions.map((item) => <button key={item} type="button" onClick={() => setQuestion(item)} className="btn-secondary !rounded-full !px-3 !py-2 text-[10px]">{item}</button>)}</div>
      </div> : messages.map((message, index) => <div key={`${index}-${message.role}`} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-[var(--green-soft)]" : "bg-[var(--surface-2)]"}`}>
        <div className="mb-1 text-[9px] font-bold uppercase tracking-[.12em] text-[var(--muted)]">{message.role === "user" ? "You" : "CampusClass AI"}</div>
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.sources?.length ? <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--line)] pt-3" aria-label="Referenced course sources">
          {message.sources.map((source) => <Link key={source.id} href={source.href} className="rounded-full border border-[var(--line)] px-2 py-1 text-[10px] font-semibold hover:text-[var(--green)]" title={source.type + ": " + source.title}>[{source.id}] {source.title}</Link>)}
        </div> : null}
      </div>)}
      {sending ? <div className="max-w-[88%] animate-pulse rounded-2xl bg-[var(--surface-2)] px-4 py-3 text-xs text-[var(--muted)]">Checking your workspace…</div> : null}
    </div>

    <form onSubmit={ask} className="border-t border-[var(--line)] p-4 sm:p-5">
      <div role="group" aria-label="Study copilot mode" className="mb-3 flex flex-wrap gap-2">
        {([{ value:"chat", label:"Ask and explain" },{ value:"practice", label:"Practice quiz" },{ value:"revision", label:"7-day revision plan" }] as const).map((item) =>
          <button key={item.value} type="button" aria-pressed={mode===item.value} onClick={() => { setMode(item.value); setQuestion(item.value==="practice" ? "Create practice questions from my published course material." : item.value==="revision" ? "Plan my revision for the coming week." : ""); }} className={"rounded-full border px-3 py-2 text-xs font-semibold transition-colors " + (mode===item.value ? "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green-strong)]" : "border-[var(--line)]")}>{item.label}</button>)}
      </div>
      {syllabi.length>0&&<label className="mb-3 block text-[11px] font-medium">
        Study a full syllabus PDF (optional)
        <select className="input-base mt-1" value={syllabusId} onChange={(event)=>setSyllabusId(event.target.value)}>
          <option value="">Use published lessons and outlines</option>
          {syllabi.map((item)=><option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <span className="mt-1 block text-[10px] text-[var(--muted)]">When selected, the private PDF is sent to the configured AI provider for this question.</span>
      </label>}
      <div className="flex items-end gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-2 focus-within:border-[var(--green)]">
        <textarea className="max-h-32 min-h-11 flex-1 resize-y bg-transparent px-2 py-2 text-sm outline-none placeholder:text-[var(--muted)]" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={4000} placeholder="Ask about your classes or pending work…" aria-label="Ask the study assistant"/>
        <button className="btn-primary !h-10 !w-10 !shrink-0 !justify-center !p-0" disabled={sending || !question.trim()} aria-label="Send question"><ArrowUp size={17}/></button>
      </div>
      <p className="mt-2 px-1 text-[9px] leading-4 text-[var(--muted)]">AI can make mistakes. Citations refer to published lesson text and syllabus outlines. When selected above, the full PDF is provided to the model for that request. Relevant content is processed by your college’s configured AI provider.</p>
    </form>
  </section>;
}
