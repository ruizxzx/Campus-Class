"use client";
import {useState} from "react";
import {jpegPdf} from "@/lib/certificates/jpeg-pdf";
type Props={student:string;college:string;course:string;issued:string;number:string;verify:string;logo?:string|null;template?:string|null;lessons?:number};
export function PrintCertificate(p:Props){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 async function download(){
  setBusy(true);setError("");
  try{
   const canvas=document.createElement("canvas");canvas.width=1684;canvas.height=1190;
   const ctx=canvas.getContext("2d");if(!ctx)throw new Error("PDF rendering unavailable.");
   const accent=p.template==="modern"?"#1d4ed8":"#047857";
   ctx.fillStyle="#fff";ctx.fillRect(0,0,1684,1190);ctx.strokeStyle=accent;ctx.lineWidth=12;ctx.strokeRect(36,36,1612,1118);ctx.lineWidth=3;ctx.strokeRect(56,56,1572,1078);
   ctx.textAlign="center";ctx.textBaseline="middle";
   function line(value:string,y:number,size:number,bold=false,color="#1a2823"){let n=size;ctx!.font=(bold?"bold ":"")+n+"px Georgia, serif";while(ctx!.measureText(value).width>1450&&n>20){n--;ctx!.font=(bold?"bold ":"")+n+"px Georgia, serif";}ctx!.fillStyle=color;ctx!.fillText(value,842,y,1450);}
   if(p.logo){const image=new Image();image.src=p.logo;await image.decode();const scale=Math.min(140/image.width,115/image.height);ctx.drawImage(image,842-image.width*scale/2,82,image.width*scale,image.height*scale);}else line("✦",145,70,true,accent);
   line(p.college,246,42,true,accent);line("Certificate of Completion",358,68,true);line("This certifies that",480,34);line(p.student,580,64,true);line("has completed every published lecture of",678,34);line(p.course,766,48,true);
   line((p.lessons===undefined?"":p.lessons+(p.lessons===1?" lesson · ":" lessons · "))+"Issued "+p.issued,875,29);
   line("Certificate ID: "+p.number,985,25);line("Verify: "+p.verify,1050,22);
   const jpeg=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Could not render certificate.")),"image/jpeg",0.94));
   const bytes=jpegPdf(new Uint8Array(await jpeg.arrayBuffer()),canvas.width,canvas.height);
   const url=URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer],{type:"application/pdf"}));
   const a=document.createElement("a");a.href=url;a.download="certificate-"+p.number.replace(/[^a-zA-Z0-9_-]/g,"_")+".pdf";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch{setError("Could not download the certificate. You can still print or save as PDF.");}finally{setBusy(false);}
 }
 return <><button className="btn-primary" type="button" disabled={busy} onClick={download}>{busy?"Preparing PDF…":"Download PDF"}</button> <button className="btn-secondary" type="button" onClick={()=>window.print()}>Print / Save as PDF</button>{error&&<p role="alert" className="text-xs text-red-600 mt-2">{error}</p>}</>;
}
