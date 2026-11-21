export type Block={kind:"heading"|"bullet"|"paragraph"|"code";text:string};
export function markdownBlocks(value:string):Block[]{
 const blocks:Block[]=[];let code:string[]|null=null;
 for(const raw of value.split(/\r?\n/)){
  if(/^\s*```/.test(raw)){if(code){blocks.push({kind:"code",text:code.join("\n")});code=null;}else code=[];continue;}
  if(code){code.push(raw);continue;}const line=raw.trim();if(!line)continue;
  const heading=/^#{1,6}\s+(.+)$/.exec(line),bullet=/^[-*+]\s+(.+)$/.exec(line);
  blocks.push(heading?{kind:"heading",text:heading[1]}:bullet?{kind:"bullet",text:bullet[1]}:{kind:"paragraph",text:line});
 }
 if(code)blocks.push({kind:"code",text:code.join("\n")});return blocks;
}
export function inlineMarkdown(value:string):{kind:"bold"|"italic"|"code"|"text";text:string}[]{
 const tokens:{kind:"bold"|"italic"|"code"|"text";text:string}[]=[];
 const re=/\*\*([^*\n]+)\*\*|__([^_\n]+)__|`([^`\n]+)`|\*([^*\n]+)\*/g;let at=0;
 for(const m of value.matchAll(re)){const index=m.index??0;if(index>at)tokens.push({kind:"text",text:value.slice(at,index)});tokens.push({kind:m[1]||m[2]?"bold":m[3]?"code":"italic",text:m[1]??m[2]??m[3]??m[4]});at=index+m[0].length;}
 if(at<value.length)tokens.push({kind:"text",text:value.slice(at)});return tokens;
}
