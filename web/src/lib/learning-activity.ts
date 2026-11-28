import type { Store } from "@/lib/learn-progress";
export type LearningPass = { topic: string; at: string };
export type LearningActivity = { since: string | null; passes: LearningPass[]; lastOpened: LearningPass | null };
const prefix = "sf:activity:v1:";
export const LEARNING_ACTIVITY_EVENT = "sf:learning-activity";
export function rawLearningActivity(store: Store | null, bucket: string) {
  try { return store?.getItem(prefix+bucket) ?? null; } catch { return null; }
}
const iso = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
export function parseLearningActivity(raw: string | null, known: readonly string[], now = new Date()): LearningActivity {
  const empty = {since:null,passes:[],lastOpened:null};
  try {
    const value = JSON.parse(raw ?? "null"); if (!value || value.version !== 1) return empty;
    const cutoff = new Date(now);cutoff.setUTCHours(0,0,0,0);cutoff.setUTCDate(cutoff.getUTCDate()-364);
    const valid = (p: LearningPass) => p && known.includes(p.topic) && iso(p.at) && Date.parse(p.at)>=cutoff.getTime() && Date.parse(p.at)<=now.getTime();
    const seen = new Set<string>();
    const passes:LearningPass[]=[];
    for(const p of (Array.isArray(value.passes)?value.passes:[]).slice(-15000)) {
      if(!valid(p)) continue;
      const key=p.at.slice(0,10)+":"+p.topic;if(seen.has(key)) continue;
      seen.add(key);passes.push({topic:p.topic,at:p.at});
    }
    return { since:iso(value.since) && Date.parse(value.since)<=now.getTime()?value.since:null,passes,
      lastOpened:valid(value.lastOpened)?{topic:value.lastOpened.topic,at:value.lastOpened.at}:null };
  } catch { return empty; }
}
export function recordLearningActivity(store: Store | null,bucket:string,topic:string,known:readonly string[],kind:"opened"|"passed",now=new Date()) {
  if(!known.includes(topic)) return;
  const current=parseLearningActivity(rawLearningActivity(store,bucket),known,now), at=now.toISOString();
  const passes=kind==="passed" && !current.passes.some(p=>p.topic===topic && p.at.slice(0,10)===at.slice(0,10))?[...current.passes,{topic,at}]:current.passes;
  try { store?.setItem(prefix+bucket,JSON.stringify({version:1,since:current.since??at,passes,lastOpened:kind==="opened"?{topic,at}:current.lastOpened})); } catch { /* Lessons still work when storage is unavailable. */ }
  if(typeof window!=="undefined") window.dispatchEvent(new window.Event(LEARNING_ACTIVITY_EVENT));
}
export function clearLearningActivity(store: Store|null,bucket:string) {
  try {store?.removeItem(prefix+bucket);}catch{}
  if(typeof window!=="undefined") window.dispatchEvent(new window.Event(LEARNING_ACTIVITY_EVENT));
}
