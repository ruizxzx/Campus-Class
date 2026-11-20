"use client";
import { useEffect,useMemo,useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Download,Upload,Users,RefreshCw } from "lucide-react";

type Role="faculty"|"student";
type Entry={full_name:string;email:string;role:Role;department?:string;semester?:number|null;section?:string;identifier?:string;synthetic?:boolean};
type Result={id:string;created_at:string;credentials_available:boolean;total:number;counts:Record<string,number>;rows:Array<Entry & {id:string;position:number;status:string;reason:string|null}>};
const header=["full_name","email","role","department","semester","section","identifier"];
function csvCell(v:unknown){const s=String(v??"");return /[,"\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function download(name:string,rows:string[][]){
 const csv="\uFEFF"+rows.map(r=>r.map(csvCell).join(",")).join("\r\n")+"\r\n";
 const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function parseCsv(s:string):string[][]{
 const result:string[][]=[];let row:string[]=[],part="",quoted=false;
 s=s.replace(/^\uFEFF/,"");
 for(let i=0;i<s.length;i++){
  const c=s[i];
  if(quoted){if(c==='"'&&s[i+1]==='"'){part+='"';i++;}else if(c==='"')quoted=false;else part+=c;}
  else if(c==='"'&&part==="")quoted=true;
  else if(c===","){row.push(part);part="";}
  else if(c==="\n"||c==="\r"){if(c==="\r"&&s[i+1]==="\n")i++;row.push(part);if(row.some(v=>v.trim()))result.push(row);row=[];part="";}
  else part+=c;
 }
 if(quoted)throw Error("CSV has an unclosed quoted value.");
 row.push(part);if(row.some(v=>v.trim()))result.push(row);
 return result;
}
function decodeXml(s:string){const xml=new DOMParser().parseFromString(s,"application/xml");if(xml.querySelector("parsererror"))throw Error("Invalid Excel XML.");return xml;}
function childrenByName(el:Element,name:string){return [...el.getElementsByTagName("*")].filter(n=>n.localName===name);}
async function xlsxRows(file:File):Promise<string[][]>{
 const buffer=await file.arrayBuffer(), view=new DataView(buffer),decoder=new TextDecoder();
 // ZIP central directory is authoritative; local headers may omit compressed sizes.
 let end=-1;for(let i=buffer.byteLength-22;i>=Math.max(0,buffer.byteLength-65557);i--){if(view.getUint32(i,true)===0x06054b50){end=i;break;}}
 if(end<0)throw Error("Invalid XLSX ZIP archive.");
 let offset=view.getUint32(end+16,true);const count=view.getUint16(end+10,true);
 const zip=new Map<string,{start:number;size:number;method:number}>();
 for(let i=0;i<count;i++){
  if(view.getUint32(offset,true)!==0x02014b50)throw Error("Invalid ZIP directory.");
  const method=view.getUint16(offset+10,true),size=view.getUint32(offset+20,true);
  const nameLen=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true);
  const name=decoder.decode(new Uint8Array(buffer,offset+46,nameLen)),start=view.getUint32(offset+42,true);
  zip.set(name,{start,size,method});offset+=46+nameLen+extra+comment;
 }
 async function read(path:string){
  const entry=zip.get(path);if(!entry)throw Error("XLSX is missing "+path);
  const offset=entry.start;
  if(view.getUint32(offset,true)!==0x04034b50)throw Error("Invalid ZIP entry.");
  const start=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true);
  const bytes=new Uint8Array(buffer,start,entry.size);
  if(entry.method===0)return decoder.decode(bytes);
  if(entry.method!==8)throw Error("Unsupported Excel compression.");
  if(typeof DecompressionStream==="undefined")throw Error("This browser cannot read compressed XLSX. Save as CSV instead.");
  const stream=new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return decoder.decode(await new Response(stream).arrayBuffer());
 }
 const shared=zip.has("xl/sharedStrings.xml")?childrenByName(decodeXml(await read("xl/sharedStrings.xml")).documentElement,"si").map(si=>childrenByName(si,"t").map(t=>t.textContent??"").join("")):[];
 const workbook=decodeXml(await read("xl/workbook.xml"));
 const sheet=childrenByName(workbook.documentElement,"sheet")[0];if(!sheet)throw Error("Workbook has no sheet.");
 const relId=sheet.getAttribute("r:id")??sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id");
 const rels=decodeXml(await read("xl/_rels/workbook.xml.rels"));
 const target=childrenByName(rels.documentElement,"Relationship").find(x=>x.getAttribute("Id")===relId)?.getAttribute("Target");
 if(!target)throw Error("Worksheet missing.");
 const path=target.startsWith("/")?target.slice(1):"xl/"+target.replace(/^\.\//,"");
 if(path.includes(".."))throw Error("Invalid worksheet path.");
 const sheetXml=decodeXml(await read(path));
 const rows:string[][]=[];
 for(const r of childrenByName(sheetXml.documentElement,"row")){
  const values:string[]=[];
  for(const c of childrenByName(r,"c")){
   const ref=c.getAttribute("r")??"A1",letters=ref.match(/^[A-Z]+/)?.[0]??"A";
   let index=0;for(const char of letters)index=index*26+char.charCodeAt(0)-64;index--;
   if(index>50)continue;
   const value=childrenByName(c,"v")[0]?.textContent??"";
   values[index]=c.getAttribute("t")==="s"?shared[Number(value)]??"":c.getAttribute("t")==="inlineStr"?childrenByName(c,"t").map(x=>x.textContent??"").join(""):value;
  }
  if(values.some(v=>v?.trim()))rows.push(values.map(v=>v??""));
  if(rows.length>151)throw Error("Maximum 150 accounts per batch.");
 }
 return rows;
}
function fromGrid(grid:string[][]):Entry[]{
 if(!grid.length)throw Error("No accounts found.");
 const normalize=(v:string)=>v.toLowerCase().trim().replace(/[ -]/g,"_");
 const first=grid[0].map(v=>normalize(v??""));
 const aliases:Record<string,string>={name:"full_name",full_name:"full_name",email:"email",role:"role",department:"department",semester:"semester",section:"section",employee_id:"identifier",roll_number:"identifier",identifier:"identifier"};
 const hasHeaders=first.includes("email");
 const columns=hasHeaders?first.map(v=>aliases[v]??v):header;
 const data=hasHeaders?grid.slice(1):grid;
 return data.filter(row=>row.some(v=>v?.trim())).map(row=>{
  const obj:Record<string,string>={};columns.forEach((col,i)=>obj[col]=(row[i]??"").trim());
  return {full_name:obj.full_name??"",email:(obj.email??"").toLowerCase(),role:obj.role as Role,department:obj.department??"",semester:obj.semester?Number(obj.semester):null,section:obj.section??"",identifier:obj.identifier??""};
 });
}
function errorsFor(row:Entry,emails:Map<string,number>):string[]{
 const errors:string[]=[];
 if(row.full_name.trim().length<2||row.full_name.length>120)errors.push("Name must be 2–120 characters.");
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)||row.email.length>254)errors.push("Invalid email.");
 if(emails.get(row.email)!==1)errors.push("Duplicate email in batch.");
 if(row.role!=="faculty"&&row.role!=="student")errors.push("Role must be faculty or student.");
 if(row.semester!=null&&(!Number.isInteger(row.semester)||row.semester<1||row.semester>12))errors.push("Semester must be 1–12.");
 if((row.section??"").length>16)errors.push("Section too long.");
 if((row.department??"").length>120)errors.push("Department too long.");
 if((row.identifier??"").length>60)errors.push("Identifier too long.");
 if(row.synthetic&&!/\.(example|test|invalid)$/.test(row.email.split("@")[1]??""))errors.push("Demo accounts require reserved domains.");
 return errors;
}
export default function BulkAccountManager(){
 const [method,setMethod]=useState<"generate"|"upload"|"paste">("generate");
 const [faculty,setFaculty]=useState(30),[students,setStudents]=useState(100);
 const [domain,setDomain]=useState("demo.example"),[department,setDepartment]=useState("");
 const [semester,setSemester]=useState("1"),[section,setSection]=useState("A");
 const [paste,setPaste]=useState("");
 const [entries,setEntries]=useState<Entry[]>([]);
 const [job,setJob]=useState<string|null>(null),[result,setResult]=useState<Result|null>(null);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
 const [requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
 useEffect(()=>{try{setJob(localStorage.getItem("campus_bulk_last_job"));}catch{}},[]);
 useEffect(()=>{
  if(!job)return;
  let active=true;
  async function poll(){
   try{
    const res=await fetch("/api/admin/bulk-accounts?id="+encodeURIComponent(job!),{cache:"no-store"});
    const json=await res.json();if(!res.ok)throw Error(json.error??"Import status unavailable.");
    if(active)setResult(json);
   }catch(e){if(active)toast.error(e instanceof Error?e.message:"Could not load import status.");}
  }
  void poll();const timer=setInterval(()=>void poll(),6000);
  return()=>{active=false;clearInterval(timer);};
 },[job]);
 const counts=useMemo(()=>{const map=new Map<string,number>();entries.forEach(r=>map.set(r.email,(map.get(r.email)??0)+1));return map;},[entries]);
 const errors=useMemo(()=>entries.map(r=>errorsFor(r,counts)),[entries,counts]);
 const invalid=errors.filter(e=>e.length).length;
 function generate(){
  if(!Number.isInteger(faculty)||!Number.isInteger(students)||faculty<0||students<0||faculty+students<1||faculty+students>150){toast.error("Choose 1–150 total accounts.");return;}
  const safe=domain.toLowerCase().trim().replace(/^@/,"");
  if(!/^[a-z0-9-]+\.(example|test|invalid)$/.test(safe)){toast.error("Use a reserved domain such as demo.example; real email domains are not permitted for generated identities.");return;}
  const seed=crypto.randomUUID().slice(0,8);
  const entries:Entry[]=[];
  for(const [role,count] of [["faculty",faculty],["student",students]] as const){
   for(let i=1;i<=count;i++){
    const num=String(i).padStart(3,"0");
    entries.push({full_name:"Demo "+(role==="faculty"?"Faculty":"Student")+" "+num,email:"demo-"+role+"-"+seed+"-"+num+"@"+safe,role,department,semester:role==="student"?Number(semester):null,section:role==="student"?section:"",identifier:(role==="faculty"?"DEMO-F":"DEMO-S")+seed.toUpperCase()+"-"+num,synthetic:true});
   }
  }
  setEntries(entries);setRequestKey(crypto.randomUUID());setResult(null);setJob(null);
 }
 async function upload(file?:File){
  if(!file)return;
  if(!/\.(csv|xlsx)$/i.test(file.name)){toast.error("Choose .csv or .xlsx.");return;}
  if(file.size>2000000){toast.error("File limit: 2 MB.");return;}
  setLoading(true);
  try{
   const grid=file.name.toLowerCase().endsWith(".xlsx")?await xlsxRows(file):parseCsv(await file.text());
   setEntries(fromGrid(grid));setRequestKey(crypto.randomUUID());setJob(null);setResult(null);
  }catch(e){toast.error(e instanceof Error?e.message:"Could not read file.");}
  finally{setLoading(false);}
 }
 async function start(){
  if(!entries.length||invalid){toast.error("Correct or remove invalid rows before creating accounts.");return;}
  setBusy(true);
  try{
   const res=await fetch("/api/admin/bulk-accounts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idempotency_key:requestKey,rows:entries})});
   const data=await res.json();
   if(!res.ok)throw Error(data.issues?.[0]?.message??data.error??"Import failed.");
   setJob(data.id);setResult(null);try{localStorage.setItem("campus_bulk_last_job",data.id);}catch{}
   toast.success("Batch queued. The scheduled worker will create the accounts.");
  }catch(e){toast.error(e instanceof Error?e.message:"Could not queue batch.");}
  finally{setBusy(false);}
 }
 async function retry(){
  if(!result)return;
  const ids=result.rows.filter(r=>r.status==="failed").map(r=>r.id);
  if(!ids.length)return;
  setBusy(true);
  try{
   const res=await fetch("/api/admin/bulk-accounts",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:result.id,row_ids:ids})});
   const data=await res.json();if(!res.ok)throw Error(data.error??"Retry failed.");
   toast.success(data.retried+" records queued for retry.");
  }catch(e){toast.error(e instanceof Error?e.message:"Retry failed.");}finally{setBusy(false);}
 }
 async function exportCredentials(){
  if(!result||!confirm("This one-time CSV includes temporary passwords. Store it securely and delete it after distributing credentials. Continue?"))return;
  try{
   const res=await fetch("/api/admin/bulk-accounts?id="+encodeURIComponent(result.id)+"&credentials=1",{cache:"no-store"});
   const data=await res.json();if(!res.ok)throw Error(data.error??"Cannot export credentials.");
   download("campus-class-temporary-credentials.csv",[["email","temporary_password"],...data.credentials.map((r:{email:string;password:string})=>[r.email,r.password])]);
   setResult({...result,credentials_available:false});
  }catch(e){toast.error(e instanceof Error?e.message:"Export unavailable.");}
 }
 const pending=(result?.counts.pending??0)+(result?.counts.processing??0);
 return <div className="space-y-5">
  <div className="surface p-5 sm:p-6">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Bulk Import / Create Accounts</h2><p className="mt-1 text-xs text-[var(--muted)]">Create real college-scoped Supabase logins. Up to 150 faculty and students per batch.</p></div><div className="flex gap-2"><Link href="/admin/faculty" className="btn-secondary">Faculty</Link><Link href="/admin/students" className="btn-secondary">Students</Link></div></div>
   <div className="mt-5 flex flex-wrap gap-2">{(["generate","upload","paste"] as const).map(m=><button key={m} className={method===m?"btn-primary":"btn-secondary"} onClick={()=>setMethod(m)}>{m==="generate"?"Automatic generation":m==="upload"?"CSV / Excel":"Paste accounts"}</button>)}</div>
   {method==="generate"&&<div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <label className="text-xs">Faculty count<input className="input-base mt-1" type="number" min="0" max="150" value={faculty} onChange={e=>setFaculty(Number(e.target.value))}/></label>
    <label className="text-xs">Student count<input className="input-base mt-1" type="number" min="0" max="150" value={students} onChange={e=>setStudents(Number(e.target.value))}/></label>
    <label className="text-xs">Reserved demo email domain<input className="input-base mt-1" value={domain} onChange={e=>setDomain(e.target.value)} placeholder="demo.example"/></label>
    <label className="text-xs">Department (optional)<input className="input-base mt-1" value={department} onChange={e=>setDepartment(e.target.value)}/></label>
    <label className="text-xs">Student semester<select className="input-base mt-1" value={semester} onChange={e=>setSemester(e.target.value)}>{Array.from({length:12},(_,i)=><option value={i+1} key={i}>{i+1}</option>)}</select></label>
    <label className="text-xs">Student section<input className="input-base mt-1" value={section} maxLength={16} onChange={e=>setSection(e.target.value)}/></label>
    <button className="btn-primary sm:col-span-2 lg:col-span-3" onClick={generate}><Users size={16}/> Generate demo account preview</button>
    <p className="sm:col-span-2 lg:col-span-3 text-xs text-[var(--muted)]">Generated names and addresses are clearly marked Demo. No invitation emails will be sent. Department, semester, section and identifiers are recorded in the import report only; the current profile schema does not store them.</p>
   </div>}
   {method==="upload"&&<div className="mt-5 space-y-4"><div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={()=>download("campus-class-import-template.csv",[header,["Sample Faculty","sample-faculty@college.example","faculty","CSE","","","EMP001"],["Sample Student","sample-student@college.example","student","CSE","3","A","ROLL001"]])}><Download size={15}/> Download CSV template</button></div><label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--line)] p-8 text-center text-sm"><Upload size={22}/>{loading?"Reading spreadsheet…":"Choose a CSV or Excel (.xlsx) file"}<input className="sr-only" type="file" accept=".csv,.xlsx" onChange={e=>void upload(e.target.files?.[0])}/></label></div>}
   {method==="paste"&&<div className="mt-5 space-y-3"><p className="text-xs text-[var(--muted)]">Paste CSV rows or tab-separated spreadsheet cells. Include the header row: {header.join(", ")}.</p><textarea className="input-base min-h-36 font-mono text-xs" value={paste} onChange={e=>setPaste(e.target.value)} placeholder={"full_name,email,role,department,semester,section,identifier\nA Student,student@college.example,student,CSE,3,A,ROLL001"}/><button className="btn-primary" onClick={()=>{try{setEntries(fromGrid(parseCsv(paste.includes("\t")?paste.split("\n").map(r=>r.split("\t").join(",")).join("\n"):paste)));setRequestKey(crypto.randomUUID());setJob(null);setResult(null);}catch(e){toast.error(e instanceof Error?e.message:"Invalid pasted data.");}}}>Preview pasted accounts</button></div>}
  </div>
  {entries.length>0&&<div className="surface p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Review {entries.length} account{entries.length===1?"":"s"}</h3><p className="text-xs text-[var(--muted)]">{invalid} invalid · {entries.filter(r=>r.synthetic).length} demo accounts. Invalid rows must be corrected or skipped.</p></div><div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={()=>setEntries(a=>a.filter((_,i)=>!errors[i]?.length))} disabled={!invalid}>Skip invalid rows</button><button className="btn-primary" onClick={()=>void start()} disabled={!!invalid||busy||!!job}>{busy?"Queuing…":"Create accounts"}</button></div></div>
   <div className="table-wrap mt-4 max-h-96 overflow-auto"><table className="table-base"><thead><tr><th>#</th><th>Name</th><th>Email</th><th>Role</th><th>Validation</th><th></th></tr></thead><tbody>{entries.map((r,i)=><tr key={i}><td>{i+1}</td><td><input className="input-base min-w-36" aria-label={"Name row "+(i+1)} value={r.full_name} onChange={e=>setEntries(a=>a.map((v,n)=>n===i?{...v,full_name:e.target.value}:v))}/>{r.synthetic&&<span className="text-[10px] text-[var(--muted)]">Demo</span>}</td><td><input className="input-base min-w-52" aria-label={"Email row "+(i+1)} value={r.email} onChange={e=>setEntries(a=>a.map((v,n)=>n===i?{...v,email:e.target.value.toLowerCase()}:v))}/></td><td><select className="input-base" value={r.role} onChange={e=>setEntries(a=>a.map((v,n)=>n===i?{...v,role:e.target.value as Role}:v))}><option value="faculty">Faculty</option><option value="student">Student</option></select></td><td className="text-xs">{errors[i]?.length?<span className="text-red-600">{errors[i].join(" ")}</span>:<span className="text-[var(--green)]">Valid</span>}</td><td><button className="btn-secondary" onClick={()=>setEntries(a=>a.filter((_,n)=>n!==i))} aria-label={"Remove row "+(i+1)}>Remove</button></td></tr>)}</tbody></table></div>
  </div>}
  {result&&<div className="surface p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Import progress</h3><p className="text-xs text-[var(--muted)]">Batch {result.id} · Progress survives page refresh</p></div><button className="btn-secondary" onClick={()=>{setJob(null);setResult(null);setEntries([]);setRequestKey(crypto.randomUUID());try{localStorage.removeItem("campus_bulk_last_job");}catch{}}}>New batch</button></div>
   <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">{[["Total",result.total],["Created",result.counts.created],["Existing",result.counts.existing],["Failed",result.counts.failed],["Pending",pending]].map(([label,num])=><div className="rounded-xl bg-[var(--surface-2)] p-3" key={label}><div className="text-2xl font-bold">{num}</div><div className="text-xs text-[var(--muted)]">{label}</div></div>)}</div>
   <progress className="mt-4 h-2 w-full" max={result.total} value={result.total-pending}/>
   <div className="mt-4 flex flex-wrap gap-2"><button className="btn-secondary" onClick={()=>download("campus-class-import-results.csv",[["email","full_name","role","status","reason"],...result.rows.map(r=>[r.email,r.full_name,r.role,r.status,r.reason??""])])}><Download size={15}/> Download results CSV</button><button className="btn-secondary" onClick={()=>void retry()} disabled={busy||!result.counts.failed}><RefreshCw size={15}/> Retry failed</button><button className="btn-primary" onClick={()=>void exportCredentials()} disabled={pending>0||!result.credentials_available||!result.counts.created}>One-time credentials CSV</button></div>
   <div className="table-wrap mt-4 max-h-80 overflow-auto"><table className="table-base"><thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Reason</th></tr></thead><tbody>{result.rows.map(r=><tr key={r.id}><td>{r.email}</td><td>{r.role}</td><td>{r.status}</td><td>{r.reason??"—"}</td></tr>)}</tbody></table></div>
  </div>}
 </div>;
}
