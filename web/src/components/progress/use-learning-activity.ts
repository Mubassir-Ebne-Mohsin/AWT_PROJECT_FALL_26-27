"use client";
import { useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { bucketFor,browserStore } from "@/lib/learn-progress";
import { TOPIC_IDS } from "@/lib/learn-content";
import { rawLearningActivity,parseLearningActivity,LEARNING_ACTIVITY_EVENT } from "@/lib/learning-activity";
const subscribe=(fn:()=>void)=>{window.addEventListener("storage",fn);window.addEventListener(LEARNING_ACTIVITY_EVENT,fn);return()=>{window.removeEventListener("storage",fn);window.removeEventListener(LEARNING_ACTIVITY_EVENT,fn);};};
export function useLearningActivity(){
 const {user,status}=useAuth();
 const raw=useSyncExternalStore(subscribe,()=>status==="loading"?null:rawLearningActivity(browserStore(),bucketFor(user?.id)),()=>null);
 return parseLearningActivity(raw,TOPIC_IDS);
}
