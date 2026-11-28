"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { useLearnProgress } from "@/components/learn/learn";
import { NextStep,ConceptsProgress } from "@/components/learner/concepts";
import { Crumbs } from "@/components/shell/crumbs";
import { challengeProgress } from "@/lib/api/attempts";
import { fetchProgressActivity } from "@/lib/api/progress";
import { TOPICS } from "@/lib/learn-content";
import { resolveRoute } from "@/lib/routes";
import { calendarDays } from "@/lib/progress-activity";
import { useLearningActivity } from "@/components/progress/use-learning-activity";
import { ActivityCalendar } from "@/components/progress/activity-calendar";
import { ActivityDetails,MilestoneList,lessonMilestones } from "@/components/progress/activity-details";
export function ProgressPage(){
 const {user}=useAuth(),{progress,ready}=useLearnProgress(),learning=useLearningActivity(),[selected,setSelected]=useState<string|null>(null);
 const q=useQuery({queryKey:["challenge-progress",user?.id],queryFn:({signal})=>challengeProgress(signal),enabled:!!user,retry:false});
 const activity=useQuery({queryKey:["progress-activity",user?.id],queryFn:({signal})=>fetchProgressActivity(signal),enabled:!!user,retry:false});
 const days=calendarDays(activity.data?.windowEnd??new Date().toISOString(),activity.data?.days??[],learning.passes);
 const milestones=[...lessonMilestones(learning.passes),...(activity.data?.recent??[])].sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id)).slice(0,8);
 const activeDays=days.filter(d=>d.total>0).length;
 const last=TOPICS.find(t=>t.id===learning.lastOpened?.topic);
 return <div className="page stack lg progress-page" data-testid="progress-page"><Crumbs resolved={resolveRoute("/progress")}/>
 <header className="progress-section-head"><div><p className="eyebrow">BUILD UNDERSTANDING, ONE EXPERIMENT AT A TIME</p><h1 className="h1">Progress</h1><p className="lede">Your learning, experiments and next steps in one place.</p></div><Link className="btn" href="/learn">Explore the field guide →</Link></header>
 <div className="progress-stats" aria-label="Progress overview">
 {[{label:"Lesson checks passed",value:ready?`${progress.passed.length} / ${TOPICS.length}`:"—",note:"Completion on this device"},{label:"Challenges passed",value:q.data?`${q.data.passed} / ${q.data.attempted}`:"—",note:q.isError?"Saved results unavailable":"From recorded attempts"},{label:"Designs tested",value:activity.data?activity.data.designsTested:"—",note:"Completed runs in the last year"},{label:"Active days",value:activity.data?activeDays:"—",note:"Last year · includes local learning"}].map(s=><article key={s.label} className="progress-stat"><p>{s.label}</p><strong>{s.value}</strong><span>{s.note}</span></article>)}
 </div>
 <div className="progress-next-grid"><NextStep challenges={q.data?{items:q.data.items}:null}/><section className="activity-panel stack"><h2 className="h3">Continue learning</h2>{last?<><p>Your last opened lesson on this device</p><Link href={"/learn/"+last.id}>{last.title} →</Link></>:<><p>Start with the building blocks, then test what changes under load.</p><Link href="/learn/clients">Meet the components →</Link></>}<p className="hint">Existing marks are preserved. Earlier lesson dates are unknown.</p></section></div>
 {activity.isPending&&<p role="status">Loading saved experiment activity…</p>}
 {activity.isError&&<div role="alert" className="activity-panel"><p>Saved experiment activity is unavailable. The calendar currently shows device-only learning; empty days are not proof of inactivity.</p><button className="btn" onClick={()=>void activity.refetch()}>Retry saved activity</button></div>}
 <ActivityCalendar days={days} selected={selected} onSelect={setSelected}/>
 <p className="hint progress-source">Private to you. Saved experiments come from your account; lesson history stays on this device{learning.since?` and starts on ${new Date(learning.since).toLocaleDateString("en",{timeZone:"UTC"})}`:" and begins with your next lesson visit or check"}. Clearing Learn progress also clears its local activity. Deleted designs no longer contribute saved runs.</p>
 {selected&&<ActivityDetails key={`${user?.id}:${selected}`} date={selected} learning={learning.passes} onClose={()=>{document.querySelector<HTMLButtonElement>(`button.practice-cell[data-date="${selected}"]`)?.focus();setSelected(null);}}/>}
 <ConceptsProgress/>
 <div className="progress-bottom-grid"><section className="activity-panel stack"><h2 className="h2">Recent milestones</h2>{milestones.length?<MilestoneList events={milestones}/>:<p>No dated activity yet. Pass a lesson check or complete a saved calculation to begin.</p>}{activity.isError&&<p className="hint">Saved milestones are unavailable.</p>}</section>
 <section className="activity-panel stack" aria-labelledby="challenge-heading"><h2 className="h2" id="challenge-heading">Challenges</h2>
 {q.isPending&&<p role="status">Loading recorded challenge results…</p>}{q.isError&&<div role="alert"><p>Could not load this information. Your design is preserved. Try again.</p><button className="btn" onClick={()=>void q.refetch()}>Try again</button></div>}
 {q.data&&<><p>{q.data.passed} passed · {q.data.attempted} attempted</p>{!q.data.items.length&&<Link href="/challenges">Browse challenges to begin</Link>}{q.data.items.map(i=><article className="progress-challenge stack" key={i.attemptId}><h3 className="h3">{i.title}</h3><p>{i.passed?"Passed":"Not yet passed"}{i.archived?" · Archived":""}</p><p className="hint">p95 ≤ {i.goal.p95Ms} ms · errors ≤ {(i.goal.errorRate*100).toFixed(2)}%</p>{i.best&&<p>Best: p95 {i.best.p95} ms · errors {((i.best.errorRate??0)*100).toFixed(2)}%</p>}<Link href={`/challenges/${i.challengeId}?attempt=${i.attemptId}`}>View attempt and submissions</Link></article>)}</>}
 </section></div></div>;
}
