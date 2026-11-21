import {Fragment} from "react";
import {markdownBlocks,inlineMarkdown} from "@/lib/markdown-text";
function Inline({value}:{value:string}){return <>{inlineMarkdown(value).map((t,i)=>t.kind==="bold"?<strong key={i}>{t.text}</strong>:t.kind==="italic"?<em key={i}>{t.text}</em>:t.kind==="code"?<code key={i} className="rounded bg-[var(--surface)] px-1">{t.text}</code>:<Fragment key={i}>{t.text}</Fragment>)}</>;}
/** Model output is plain text rendered as React elements; no injected HTML or executable links. */
export function AIMarkdown({value}:{value:string}){return <div className="min-w-0 break-words space-y-2">{markdownBlocks(value).map((block,i)=>{
 if(block.kind==="code")return <pre key={i} className="overflow-x-auto rounded-lg bg-[var(--surface)] p-3 text-xs"><code>{block.text}</code></pre>;
 if(block.kind==="heading")return <p key={i} className="font-semibold"><Inline value={block.text}/></p>;
 if(block.kind==="bullet")return <div key={i} className="flex gap-2"><span aria-hidden="true">•</span><span><Inline value={block.text}/></span></div>;
 return <p key={i} className="whitespace-pre-wrap"><Inline value={block.text}/></p>;
 })}</div>;}
