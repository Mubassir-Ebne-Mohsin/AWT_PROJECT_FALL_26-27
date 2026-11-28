"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { fetchProgressDay,type ActivityEvent } from "@/lib/api/progress";
import { dateLabel,kindLabel } from "@/lib/progress-activity";
import { TOPICS } from "@/lib/learn-content";
import type { LearningPass } from "@/lib/learning-activity";
export type Milestone = Omit<ActivityEvent,"kind"> & {kind:ActivityEvent["kind"]|"learning"};
export function lessonMilestones(passes:LearningPass[]):Milestone[]{return passes.map(p=>({id:p.topic+":"+p.at.slice(0,10),kind:"learning",at:p.at,label:TOPICS.find(t=>t.id===p.topic)?.title??p.topic,href:"/learn/"+p.topic}));}
export function MilestoneList({events}:{events:Milestone[]}){return <ol className="progress-milestones">{events.map(e=><li key={e.kind+":"+e.id}><span className={`milestone-symbol ${e.kind}`} aria-hidden="true">{e.kind==="learning"?"✓":e.kind==="challenge"?"◇":"↗"}</span><div><span className="hint">{kindLabel[e.kind]} · {e.kind==="learning"?"This device":"Saved record"}</span><Link href={e.href}>{e.label}</Link><time dateTime={e.at}>{new Date(e.at).toLocaleString("en",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"UTC"})} UTC</time></div></li>)}</ol>;}
export function ActivityDetails({date,learning,onClose}:{date:string;learning:LearningPass[];onClose:()=>void}){
 const {user}=useAuth();const q=useQuery({queryKey:["progress-day",user?.id,date],queryFn:({signal})=>fetchProgressDay(date,signal),enabled:!!user,retry:false});
 const events=[...lessonMilestones(learning.filter(p=>p.at.slice(0,10)===date)),...(q.data?.events??[])].sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
 return <section className="activity-panel stack" aria-labelledby="selected-day" data-testid="activity-day"><div className="progress-section-head"><h3 className="h3" id="selected-day">{dateLabel(date)}</h3><button className="btn btn-ghost" onClick={onClose}>Close day details</button></div>
 {q.isPending&&<p role="status">Loading saved activities…</p>}{q.isError&&<div role="alert"><p>Saved activities could not be loaded. Local lesson records are shown below.</p><button className="btn" onClick={()=>void q.refetch()}>Retry day activities</button></div>}
 {events.length>0?<MilestoneList events={events}/>:q.data&&<p>No qualifying activities recorded on this day.</p>}
 {q.data?.hasMore&&<p className="hint">Showing the 100 latest saved activities for this day. The calendar total includes all of them.</p>}</section>;
}
