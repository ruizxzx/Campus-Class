"use client";
import { useSyncExternalStore } from "react";
import { isUiLanguage, type UiLanguage } from "@/lib/ui-language";

const key="campusclass-ui-language";
const eventName="campusclass-ui-language-change";

function readLanguage():UiLanguage{
  try{
    const value=window.localStorage.getItem(key);
    return isUiLanguage(value)?value:"en";
  }catch{return "en";}
}
function subscribe(callback:()=>void){
  window.addEventListener("storage",callback);
  window.addEventListener(eventName,callback);
  return ()=>{
    window.removeEventListener("storage",callback);
    window.removeEventListener(eventName,callback);
  };
}
/**
 * One consistent browser language across navigation and nested app features.
 * useSyncExternalStore avoids stale or duplicate React language state.
 */
export function useUiLanguage():UiLanguage{
  return useSyncExternalStore(subscribe,readLanguage,()=>"en");
}
export function chooseUiLanguage(next:UiLanguage){
  if(!isUiLanguage(next))return;
  try{window.localStorage.setItem(key,next);}catch{/* non-persistent privacy mode */}
  document.documentElement.lang=next;
  window.dispatchEvent(new Event(eventName));
}
