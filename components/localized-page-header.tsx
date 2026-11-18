"use client";
import type { ReactNode } from "react";
import { useUiLanguage } from "@/lib/use-ui-language";
import { translateUi } from "@/lib/ui-language";

export function LocalizedPageHeader({title,description,action}:{
  title:string;description?:string;action?:ReactNode;
}){
  const language=useUiLanguage();
  return <div className="mb-6 flex min-w-0 flex-wrap items-end justify-between gap-3 sm:mb-7 sm:gap-4">
    <div className="min-w-0 max-w-full flex-1">
      <h1 className="page-title">{translateUi(title,language)}</h1>
      {description&&<p className="page-subtitle mt-2 max-w-2xl">{translateUi(description,language)}</p>}
    </div>
    {action&&<div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">{action}</div>}
  </div>;
}
