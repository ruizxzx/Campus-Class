"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export function AdminAcademicForm({action,children,label="Save",confirm}:{action:string;children:React.ReactNode;label?:string;confirm?:string}){
 const router=useRouter();const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[failed,setFailed]=useState(false);
 async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(busy||confirm&&!window.confirm(confirm))return;setBusy(true);setMessage("");setFailed(false);
 try{const data=new FormData(event.currentTarget);const payload:Record<string,unknown>={action};for(const [key,value] of data){if(typeof value==="string")payload[key]=key==="remove_logo"?value==="on":value;else if(value.size){if(value.size>250000||!["image/png","image/jpeg"].includes(value.type))throw new Error("Use a PNG or JPEG logo smaller than 250 KB.");payload.logo_data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Could not read logo."));reader.readAsDataURL(value);});}}
 const response=await fetch("/api/admin/academic-management",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const result=await response.json().catch(()=>null);if(!response.ok)throw new Error(result?.error??"Could not save.");
 setMessage("Saved.");router.refresh();
 }catch(error){setFailed(true);setMessage(error instanceof Error?error.message:"Could not save.");}finally{setBusy(false);}}
 return <form onSubmit={submit} className="space-y-3"><fieldset disabled={busy} className="flex flex-wrap items-end gap-3">{children}<button className="btn-primary" disabled={busy}>{busy?"Saving…":label}</button></fieldset>{message&&<p role={failed?"alert":"status"} className={failed?"text-xs text-red-600":"text-xs text-emerald-700"}>{message}</p>}</form>;
}
