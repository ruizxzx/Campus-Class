"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CirclePlay, RotateCcw } from "lucide-react";
type YoutubePlayer={
  playVideo():void;pauseVideo():void;getCurrentTime():number;getPlaybackRate():number;
  getPlayerState():number;seekTo(seconds:number,allowSeekAhead:boolean):void;destroy():void;
};
type PlayerFactory=new(element:HTMLElement,options:{
 videoId:string;playerVars:Record<string,string|number>;
 events:{onReady:(event:{target:YoutubePlayer})=>void;
   onStateChange:(event:{data:number;target:YoutubePlayer})=>void;
   onError:(event:{data:number})=>void};
})=>YoutubePlayer;
type YoutubeWindow=Window&{
 YT?:{Player:PlayerFactory};
 onYouTubeIframeAPIReady?:()=>void;
};
let loader:Promise<void>|null=null;
function loadIframeApi():Promise<void>{
 if(loader)return loader;
 loader=new Promise<void>((resolve,reject)=>{
   const windowYT=window as YoutubeWindow;
   if(windowYT.YT?.Player){resolve();return;}
   const prior=windowYT.onYouTubeIframeAPIReady;
   let finished=false;
   const timeout=window.setTimeout(()=>{if(!finished){finished=true;loader=null;reject(new Error("YouTube player took too long to load."));}},15000);
   windowYT.onYouTubeIframeAPIReady=()=>{
     prior?.();
     if(!finished){finished=true;window.clearTimeout(timeout);resolve();}
   };
   if(!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')){
     const script=document.createElement("script");
     script.src="https://www.youtube.com/iframe_api";script.async=true;
     script.onerror=()=>{if(!finished){finished=true;window.clearTimeout(timeout);loader=null;reject(new Error("YouTube Player API could not load."));}};
     document.head.appendChild(script);
   }
 });
 return loader;
}
type WatchStatus={session_id?:string;resume?:number;percent?:number;completed?:boolean;
  watched_seconds?:number;duration_seconds?:number;position_seconds?:number;
  error?:string;retryable?:boolean};
export function YoutubeTrackedPlayer({lessonId,videoId,enabled,initialPercent=0,onComplete}:{
 lessonId:string;videoId:string;enabled:boolean;initialPercent?:number;onComplete?:()=>void;
}){
 const container=useRef<HTMLDivElement|null>(null);
 const player=useRef<YoutubePlayer|null>(null);
 const session=useRef<string|null>(null);
 const updating=useRef(false);
 const completeRef=useRef(onComplete);
 const [status,setStatus]=useState<"loading"|"ready"|"error">("loading");
 const [error,setError]=useState("");
 const [percent,setPercent]=useState(initialPercent);
 const [watched,setWatched]=useState(0);
 const [duration,setDuration]=useState(0);
 const [done,setDone]=useState(false);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{completeRef.current=onComplete;},[onComplete]);
 useEffect(()=>{
   let cancelled=false,interval:number|undefined;
   async function ping(){
     const target=player.current;
     if(cancelled||!target||!session.current||updating.current)return;
     const position=target.getCurrentTime();
     if(!Number.isFinite(position)||position<0)return;
     updating.current=true;
     try{
       const response=await fetch("/api/youtube/watch",{method:"POST",
         headers:{"Content-Type":"application/json"},
         body:JSON.stringify({
           action:"heartbeat",session_id:session.current,position,
           state:target.getPlayerState(),
           rate:Math.min(2,Math.max(.25,target.getPlaybackRate()||1)),
         })});
       const info=await response.json().catch(()=>({})) as WatchStatus;
       if(!response.ok)throw new Error(info.error??"Could not save video progress.");
       if(cancelled)return;
       setPercent(Number(info.percent??0));setWatched(Number(info.watched_seconds??0));
       setDuration(Number(info.duration_seconds??0));
       if(info.completed&&!done){
         setDone(true);
         completeRef.current?.();
         toast.success("You completed this lecture and saved your progress.");
       }
       setError("");
     }catch(reason){
       if(!cancelled)setError(reason instanceof Error?reason.message:"Progress sync failed. Your player can continue; retry shortly.");
     }finally{updating.current=false;}
   }
   async function setup(){
     try{
       const response=await fetch("/api/youtube/watch",{method:"POST",
         headers:{"Content-Type":"application/json"},
         body:JSON.stringify({action:"start",lesson_id:lessonId})});
       const result=await response.json().catch(()=>({})) as WatchStatus;
       if(!response.ok)throw new Error(result.error??"Could not start a playback session.");
       if(cancelled)return;
       session.current=result.session_id??null;
       setPercent(Number(result.percent??0));setWatched(Number(result.watched_seconds??0));
       setDuration(Number(result.duration_seconds??0));setDone(Boolean(result.completed));
       await loadIframeApi();
       if(cancelled||!container.current)return;
       const factory=(window as YoutubeWindow).YT?.Player;
       if(!factory)throw new Error("YouTube Player API is not available.");
       player.current=new factory(container.current,{
         videoId,playerVars:{autoplay:0,controls:1,playsinline:1,rel:0,origin:window.location.origin},
         events:{
           onReady:({target})=>{
             if(cancelled)return;
             const resume=Math.max(0,Number(result.resume??0));
             if(resume>0&&resume<(result.duration_seconds??Infinity)-2)target.seekTo(resume,true);
             setStatus("ready");
           },
           onStateChange:({data})=>{
             if(data===0||data===2||data===1)void ping();
           },
           onError:()=>{
             setError("This video cannot be embedded. Open it on YouTube or ask faculty to replace the link.");
           },
         },
       });
       interval=window.setInterval(()=>{void ping();},12000);
     }catch(reason){
       if(!cancelled){setStatus("error");setError(reason instanceof Error?reason.message:"Video player is unavailable.");}
     }
   }
   void setup();
   return()=>{
     cancelled=true;
     if(interval!==undefined)window.clearInterval(interval);
     const target=player.current;
     if(target)target.destroy();
     player.current=null;session.current=null;
   };
   // 'done' must not cause a video player remount after a heartbeat.
   // eslint-disable-next-line react-hooks/exhaustive-deps
 },[lessonId,videoId,retry]);
 if(!enabled){
   return <div className="absolute inset-0 flex items-center justify-center bg-[#111815] p-6 text-center text-sm text-white">
     Join an active subject class to save tracked YouTube watch progress.
   </div>;
 }
 return <div className="absolute inset-0 flex flex-col bg-[#111815]">
   <div ref={container} className="relative flex-1 min-h-0 w-full"/>
   {status==="loading"?<div className="absolute inset-0 grid place-items-center bg-[#111815] text-sm text-white">
     <CirclePlay size={26} className="animate-pulse"/>Starting YouTube player…
   </div>:null}
   {status==="error"?<div className="absolute inset-0 grid place-items-center bg-[#111815] p-5 text-center text-sm text-white">
     <div>{error}</div>
     <button type="button" className="btn-secondary" onClick={()=>{setError("");setStatus("loading");setRetry(n=>n+1);}}>
       <RotateCcw size={14}/>Retry player
     </button>
   </div>:null}
   {status==="ready"?<div className="flex gap-3 items-center justify-between px-3 py-2 text-[11px] text-white bg-[#202c26]">
     <span className="flex gap-2 items-center">{done?<CheckCircle2 size={14} className="text-emerald-300"/>:null}
       {done?"Completed":percent>0?"In progress":"Started"} · {percent.toFixed(0)}% watched
       {duration>0?" · "+Math.floor(watched/60)+"/"+Math.ceil(duration/60)+" min":""}
     </span>
     {error?<button type="button" className="underline text-amber-200" title={error}
       onClick={()=>void (async()=>{
         const target=player.current;if(target)target.pauseVideo();
         toast.error(error);
       })()}>Sync warning</button>:null}
   </div>:null}
 </div>;
}
