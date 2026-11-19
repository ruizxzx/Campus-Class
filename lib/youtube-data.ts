/** Strict YouTube v3 client. No transcript scraping or uncontrolled remote URLs. */
export type YouTubeVideo = {
  position:number;videoId:string|null;title:string;description:string;
  durationSeconds:number;thumbnailUrl:string|null;
  availability:"available"|"private"|"deleted"|"unembeddable"|"unavailable";
};
export class YouTubeApiError extends Error {
  constructor(message:string,public readonly status:number,public readonly retryable=false){
    super(message);this.name="YouTubeApiError";
  }
}
export function parsePlaylistUrl(value:string):string {
  if(typeof value!=="string"||value.length>1500)throw new YouTubeApiError("Paste a valid YouTube playlist URL.",400);
  let url:URL;
  try{url=new URL(value.trim());}catch{throw new YouTubeApiError("Invalid YouTube playlist URL.",400);}
  if(url.protocol!=="https:"||
    !["youtube.com","www.youtube.com","m.youtube.com","music.youtube.com","youtu.be"].includes(url.hostname)||
    (url.hostname==="youtu.be"?url.pathname.split("/").filter(Boolean).length!==1:
      !["/playlist","/watch"].includes(url.pathname)))
    throw new YouTubeApiError("Use a direct YouTube playlist URL over HTTPS.",400);
  const id=url.searchParams.get("list")??"";
  if(!/^[A-Za-z0-9_-]{10,64}$/.test(id))
    throw new YouTubeApiError("The playlist ID is missing or invalid.",400);
  return id;
}
export function parseIsoDuration(input:string|null|undefined):number{
  if(!input)return 0;
  const match=/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(input);
  if(!match)return 0;
  return Math.min(864000,Math.round(Number(match[1]||0)*604800+Number(match[2]||0)*86400+
    Number(match[3]||0)*3600+Number(match[4]||0)*60+Number(match[5]||0)));
}
type YoutubeItem={
  id?:string;snippet?:{title?:string;description?:string;position?:number;
    resourceId?:{videoId?:string};thumbnails?:{medium?:{url?:string};default?:{url?:string}}};
  contentDetails?:{videoId?:string};
};
type YoutubeVideoDetails={
  id?:string;snippet?:{title?:string;description?:string;
    thumbnails?:{medium?:{url?:string};default?:{url?:string}}};
  contentDetails?:{duration?:string};
  status?:{privacyStatus?:string;embeddable?:boolean};
};
export type YouTubePlaylistMeta={id:string;title:string;description:string;thumbnail:string|null;count:number};
const BASE="https://www.googleapis.com/youtube/v3";
function apiKey(){
 const key=process.env.YOUTUBE_DATA_API_KEY;
 if(!key||key.length<15)throw new YouTubeApiError("Configure YOUTUBE_DATA_API_KEY in Vercel server environment.",503);
 return key;
}
export async function youtubeData(path:"playlists"|"playlistItems"|"videos",params:Record<string,string>):
 Promise<Record<string,unknown>> {
 const url=new URL(BASE+"/"+path);
 const key=apiKey();
 for(const [name,value] of Object.entries(params))url.searchParams.set(name,value);
 url.searchParams.set("key",key);
 for(let attempt=0;attempt<3;attempt++){
   let response:Response;
   try{response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(12000)});}
   catch{
     if(attempt<2)continue;
     throw new YouTubeApiError("YouTube did not respond. Retry fetching this playlist.",503,true);
   }
   const result=await response.json().catch(()=>null) as {
     error?:{code?:number;message?:string;errors?:{reason?:string}[]}
   }|null;
   if(response.ok&&result&&typeof result==="object")return result as Record<string,unknown>;
   const reason=result?.error?.errors?.[0]?.reason??"";
   if(response.status===403){
     if(/quotaExceeded|dailyLimitExceeded|rateLimitExceeded|userRateLimitExceeded/i.test(reason))
       throw new YouTubeApiError("YouTube API quota or rate limit reached. Retry after quota resets.",429,true);
     throw new YouTubeApiError("YouTube rejected the server API key. Check API restrictions and permissions.",503);
   }
   if(response.status===404)throw new YouTubeApiError("YouTube playlist or video not found or not public.",404);
   if(response.status===400)throw new YouTubeApiError("YouTube rejected the playlist request.",400);
   if((response.status===429||response.status>=500)&&attempt<2)continue;
   throw new YouTubeApiError("YouTube is temporarily unavailable. Retry later.",503,response.status>=500);
 }
 throw new YouTubeApiError("YouTube request could not be completed.",503,true);
}
export async function fetchPlaylistMeta(id:string):Promise<YouTubePlaylistMeta>{
 const response=await youtubeData("playlists",{part:"snippet,contentDetails",id,maxResults:"1"});
 const rows=(response.items??[]) as {snippet?:{title?:string;description?:string;
   thumbnails?:{medium?:{url?:string};default?:{url?:string}}};
   contentDetails?:{itemCount?:number}}[];
 if(!rows.length)throw new YouTubeApiError("This playlist is private, unavailable, or deleted.",404);
 const r=rows[0];
 return {id,title:(r.snippet?.title??"Untitled playlist").slice(0,180),
   description:(r.snippet?.description??"").slice(0,10000),
   thumbnail:r.snippet?.thumbnails?.medium?.url??r.snippet?.thumbnails?.default?.url??null,
   count:Math.max(0,Math.trunc(r.contentDetails?.itemCount??0))};
}
export async function fetchPlaylistPage(id:string,pageToken:string|null):Promise<{
  videos:YouTubeVideo[];nextPageToken:string|null;total:number;
}>{
 const response=await youtubeData("playlistItems",{
   part:"snippet,contentDetails",playlistId:id,maxResults:"50",
   ...(pageToken?{pageToken}:{})});
 const entries=(response.items??[]) as YouTubeItem[];
 const ids=[...new Set(entries.map(x=>x.contentDetails?.videoId??x.snippet?.resourceId?.videoId)
   .filter((id):id is string=>typeof id==="string"&&/^[A-Za-z0-9_-]{11}$/.test(id)))];
 const videoMap=new Map<string,YouTubeVideoDetails>();
 if(ids.length){
   const result=await youtubeData("videos",{part:"snippet,contentDetails,status",id:ids.join(","),
     maxResults:"50"});
   for(const item of (result.items??[]) as YouTubeVideoDetails[]){
     if(item.id)videoMap.set(item.id,item);
   }
 }
 const videos=entries.map((entry,index)=>{
   const videoId=entry.contentDetails?.videoId??entry.snippet?.resourceId?.videoId??null;
   const info=videoId?videoMap.get(videoId):undefined;
   const privateVideo=info?.status?.privacyStatus==="private"||/private video/i.test(entry.snippet?.title??"");
   const deletedVideo=/deleted video/i.test(entry.snippet?.title??"");
   const embeddable=info?.status?.embeddable!==false;
   const durationSeconds=parseIsoDuration(info?.contentDetails?.duration);
   const availability:YouTubeVideo["availability"]=privateVideo?"private":
     deletedVideo?"deleted":!info?"unavailable":!embeddable?"unembeddable":
       !["public","unlisted"].includes(info.status?.privacyStatus??"")||durationSeconds<1?"unavailable":"available";
   return {
     position:Number.isInteger(entry.snippet?.position)?entry.snippet!.position!:index,
     videoId:videoId&&/^[A-Za-z0-9_-]{11}$/.test(videoId)?videoId:null,
     title:(info?.snippet?.title??entry.snippet?.title??"Unavailable video").slice(0,180),
     description:(info?.snippet?.description??entry.snippet?.description??"").slice(0,20000),
     durationSeconds,
     thumbnailUrl:info?.snippet?.thumbnails?.medium?.url??
       entry.snippet?.thumbnails?.medium?.url??null,
     availability,
   };
 });
 const token=typeof response.nextPageToken==="string"?response.nextPageToken:null;
 return {videos,nextPageToken:token,total:Math.max(0,Number((response.pageInfo as {totalResults?:number}|undefined)?.totalResults??videos.length))};
}
export function duplicatePlaylistEntries(videos:YouTubeVideo[]):YouTubeVideo[]{
 const seen=new Set<string>();
 return videos.map(v=>{
   if(!v.videoId||v.availability!=="available")return v;
   if(seen.has(v.videoId))return {...v,availability:"unavailable",
     title:v.title+" (duplicate in playlist)"};
   seen.add(v.videoId);return v;
 });
}
