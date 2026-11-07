"use client";
import { useEffect,useRef,useState } from "react";
import { ApiError } from "@/lib/api/errors";
/** One action per mounted account/report scope; ignore late responses after navigation. */
export function useSupportAction(){
 const live=useRef(true),pending=useRef(false),controller=useRef<AbortController|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{live.current=true;return()=>{live.current=false;controller.current?.abort();};},[]);
 async function run<T>(work:(signal:AbortSignal)=>Promise<T>,done:(value:T)=>void){
  if(pending.current)return;pending.current=true;setBusy(true);setError("");const c=new AbortController();controller.current=c;
  try{const result=await work(c.signal);if(live.current&&!c.signal.aborted)done(result);}catch(e){if(live.current&&!c.signal.aborted)setError(e instanceof ApiError ? ([401,403,404,409,422,429].includes(e.status)?e.message:"Could not confirm the action. Refresh before retrying; it may have completed on the server.") : e instanceof Error ? e.message : "The action could not be confirmed. Refresh before retrying.");}
  finally{pending.current=false;if(live.current)setBusy(false);}
 }
 return {busy,error,run};
}
