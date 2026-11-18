/**
 * Pure processing of OpenRouter's file-parser annotations.
 * Uses extracted annotation text, never the model's answer as "PDF text".
 * A parser does not guarantee page metadata: unknown page numbers remain null.
 */
export type TextSegment = {content:string;page:number|null};
export type ParsedPdf = {hash:string;text:string;pageBoundaries:boolean};
const MAX_PDF_TEXT=120_000;
const MAX_CHUNKS=96;

type FilePart={type?:unknown;text?:unknown};
type FileAnn={type?:unknown;file?:{hash?:unknown;content?:unknown}};
export function parsedPdfFromAnnotations(value:unknown):ParsedPdf{
  if(!value||typeof value!=="object")throw new Error("The PDF parser returned no structured response.");
  const root=value as {
    choices?:{message?:{annotations?:FileAnn[]}}[];
    error?:{metadata?:{file_annotations?:FileAnn[]}};
  };
  const annotations=[
    ...(root.choices?.[0]?.message?.annotations??[]),
    ...(root.error?.metadata?.file_annotations??[]),
  ];
  const found=annotations.find((item)=>item?.type==="file"
    && item.file&&typeof item.file.hash==="string"
    && Array.isArray(item.file.content));
  if(!found||!found.file||!Array.isArray(found.file.content))
    throw new Error("No verified PDF text annotation was returned. Try the OCR option for a scanned PDF.");
  const texts=(found.file.content as FilePart[])
    .filter((part)=>part?.type==="text"&&typeof part.text==="string")
    .map((part)=>String(part.text));
  const text=texts.join("\n\n").replaceAll("\r\n","\n").trim();
  if(text.length<30)throw new Error("The PDF contained too little extractable text. Try OCR for scanned pages.");
  if(text.length>MAX_PDF_TEXT)throw new Error("This document is too large to index in one request. Split it into smaller PDFs; none of its text was truncated.");
  return {
    hash:String(found.file.hash).slice(0,128),
    text,
    pageBoundaries:text.includes("\f"),
  };
}
export function chunkExtractedPdf(parsed:ParsedPdf):TextSegment[]{
  const chunks:TextSegment[]=[];
  const rawPages=parsed.pageBoundaries?parsed.text.split("\f"):[parsed.text];
  for(let pageIndex=0;pageIndex<rawPages.length;pageIndex++){
    const pageText=rawPages[pageIndex].trim();
    if(!pageText)continue;
    const page=parsed.pageBoundaries?pageIndex+1:null;
    let rest=pageText;
    while(rest.length){
      if(chunks.length>=MAX_CHUNKS)
        throw new Error("This PDF exceeds the supported indexing size. Split it into smaller PDFs; no partial index was saved.");
      if(rest.length<=1500){
        if(rest.length<20&&chunks.length&&chunks[chunks.length-1].page===page
          && chunks[chunks.length-1].content.length+rest.length+1<=1800){
          chunks[chunks.length-1].content+=" "+rest;break;
        }
        if(rest.length<20)throw new Error("Extracted PDF page content was too short to index reliably.");
        chunks.push({content:rest,page});break;
      }
      const limit=1500;
      let cut=rest.lastIndexOf(" ",limit);
      if(cut<1100)cut=limit;
      chunks.push({content:rest.slice(0,cut).trim(),page});
      rest=rest.slice(cut).trimStart();
    }
  }
  if(!chunks.length)throw new Error("PDF parsing returned no useful text.");
  return chunks;
}
export function validEmbedding(input:unknown):input is number[]{
  return Array.isArray(input)&&input.length===1536
    &&input.every((value)=>typeof value==="number"&&Number.isFinite(value));
}
