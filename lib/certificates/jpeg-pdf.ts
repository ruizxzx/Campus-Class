/** Wrap a rendered RGB JPEG certificate in a one-page PDF with byte-accurate xref. */
export function jpegPdf(jpeg:Uint8Array,width:number,height:number):Uint8Array{
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||jpeg.length<3||jpeg[0]!==255||jpeg[1]!==216)throw new Error("Invalid certificate image.");
 const encode=new TextEncoder(),chunks:Uint8Array[]=[],offsets=[0];let size=0;
 function append(value:string|Uint8Array){const bytes=typeof value==="string"?encode.encode(value):value;chunks.push(bytes);size+=bytes.length;}
 function obj(id:number,value:string){offsets[id]=size;append(id+" 0 obj\n"+value+"\nendobj\n");}
 append("%PDF-1.4\n");obj(1,"<< /Type /Catalog /Pages 2 0 R >>");obj(2,"<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
 obj(3,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
 offsets[4]=size;append("4 0 obj\n<< /Type /XObject /Subtype /Image /Width "+width+" /Height "+height+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+jpeg.length+" >>\nstream\n");append(jpeg);append("\nendstream\nendobj\n");
 const drawing="q\n842 0 0 595 0 0 cm\n/Im0 Do\nQ\n";obj(5,"<< /Length "+encode.encode(drawing).length+" >>\nstream\n"+drawing+"endstream");
 const xref=size;append("xref\n0 6\n0000000000 65535 f \n");for(let i=1;i<=5;i++)append(String(offsets[i]).padStart(10,"0")+" 00000 n \n");append("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n");
 const output=new Uint8Array(size);let at=0;for(const chunk of chunks){output.set(chunk,at);at+=chunk.length;}return output;
}
