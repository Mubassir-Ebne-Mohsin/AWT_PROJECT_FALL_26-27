import type { ProgressActivity, ActivityEvent } from "@/lib/api/progress";
import type { LearningPass } from "@/lib/learning-activity";
export type ActivityCounts = { learning:number; simulation:number; limits:number; challenge:number };
export type CalendarDay = {date:string;counts:ActivityCounts;total:number;level:number};
export const dateLabel=(date:string) => new Date(date+"T12:00:00Z").toLocaleDateString("en",{month:"long",day:"numeric",year:"numeric",timeZone:"UTC"});
export function calendarDays(end:string,saved:ProgressActivity["days"],learning:LearningPass[]):CalendarDay[] {
  const now=new Date(end.slice(0,10)+"T00:00:00Z");
  const counts=new Map<string,ActivityCounts>();
  const get=(date:string) => {if(!counts.has(date)) counts.set(date,{learning:0,simulation:0,limits:0,challenge:0});return counts.get(date)!;};
  for(const d of saved) {const c=get(d.date);c.simulation=d.simulation;c.limits=d.limits;c.challenge=d.challenge;}
  const unique=new Set<string>();for(const p of learning){const key=p.at.slice(0,10)+":"+p.topic;if(!unique.has(key)){unique.add(key);get(p.at.slice(0,10)).learning++;}}
  return Array.from({length:365},(_,i)=>{const d=new Date(now);d.setUTCDate(d.getUTCDate()-364+i);const date=d.toISOString().slice(0,10),c=get(date),total=c.learning+c.simulation+c.limits+c.challenge;return {date,counts:c,total,level:total===0?0:total===1?1:total<=3?2:total<=6?3:4};});
}
export const activityDescription=(d:CalendarDay) => `${dateLabel(d.date)}: ${d.total} activities; ${d.counts.learning} lesson checks, ${d.counts.simulation} simulations, ${d.counts.limits} Limits calculations, ${d.counts.challenge} challenge submissions`;
export const kindLabel:Record<ActivityEvent["kind"]|"learning",string>={simulation:"Completed simulation",limits:"Completed Limits calculation",challenge:"Evaluated challenge submission",learning:"Passed lesson check"};
