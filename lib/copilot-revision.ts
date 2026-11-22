export type RevisionTopic = {id:string;type:string;title:string};
export type RevisionDeadline = {title:string;due_at:string|null};
/** A bounded seven-day fallback when the configured free AI model times out. */
export function buildRevisionFallback(sources:RevisionTopic[], classLabels:string[], deadlines:RevisionDeadline[]) {
  const topics=sources.filter(item=>["Published lesson","Syllabus outline","Course"].includes(item.type));
  const clean=(value:string)=>value.replace(/[\r\n*_[\]]/g," ").slice(0,130);
  const tasks=["Read and outline key ideas","Practise examples","Recall definitions without notes",
    "Solve exercises","Review difficult concepts","Take a short self-test","Consolidate notes and mistakes"];
  const days=Array.from({length:7},(_,i)=>{
    const topic=topics[i%Math.max(topics.length,1)];
    const title=topic?clean(topic.title)+" ["+topic.id+"]":clean(classLabels[i%Math.max(classLabels.length,1)]??"your published study material");
    const due=deadlines[i];
    return "**Day "+(i+1)+"** — "+tasks[i]+" for "+title+". "+
      (due?"Check "+clean(due.title)+(due.due_at?" (due "+due.due_at.slice(0,10)+")":"")+". ":"")+
      "Allow 25–40 minutes.";
  });
  return "**7-day revision plan**\n\n"+days.join("\n\n")+
    "\n\n*Short fallback based on accessible course titles and deadlines. Check the course material for details.*";
}