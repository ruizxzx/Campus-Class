import {NextResponse} from "next/server";
import {lookupCertificate} from "@/lib/certificates/verification";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Minimal public verification. Does not reveal student identity or private grades. */
export async function GET(request:Request){
 const number=new URL(request.url).searchParams.get("number")??"";
 if(!/^CC-[A-F0-9]{20}$/i.test(number.trim()))
  return NextResponse.json({error:"A valid certificate number is required."},{status:400});
 try{
  const cert=await lookupCertificate(number);
  if(!cert)return NextResponse.json({valid:false,error:"Certificate not found."},{status:404});
  return NextResponse.json(cert,{headers:{"Cache-Control":"no-store"}});
 }catch{
  return NextResponse.json({error:"Certificate verification is temporarily unavailable."},{status:503});
 }
}
