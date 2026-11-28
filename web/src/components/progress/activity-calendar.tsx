"use client";
import { useRef,useState,useSyncExternalStore } from "react";
import { activityDescription,dateLabel,type CalendarDay } from "@/lib/progress-activity";
const subscribe=(fn:()=>void)=>{const q=window.matchMedia("(max-width:680px)");q.addEventListener("change",fn);return()=>q.removeEventListener("change",fn);};
function useNarrow(){return useSyncExternalStore(subscribe,()=>window.matchMedia("(max-width:680px)").matches,()=>false);}
export function ActivityCalendar({days,onSelect,selected}:{days:CalendarDay[];onSelect:(date:string)=>void;selected:string|null}){
 const narrow=useNarrow(),[range,setRange]=useState<"auto"|"quarter"|"year">("auto"),[focus,setFocus]=useState(days.at(-1)!.date),[hint,setHint]=useState("");
 const buttons=useRef(new Map<string,HTMLButtonElement>());
 const visible=days.slice((range==="auto"?narrow:range==="quarter")?-84:0);
 const padding=new Date(visible[0].date+"T12:00:00Z").getUTCDay();
 const cells:(CalendarDay|null)[]=[...Array(padding).fill(null),...visible];
 const weeks=Math.ceil(cells.length/7),active=visible.some(d=>d.date===focus)?focus:visible.at(-1)!.date;
 const total=visible.reduce((s,d)=>s+d.total,0),activeDays=visible.filter(d=>d.total>0).length;
 return <section className="activity-panel" aria-labelledby="activity-heading" data-testid="activity-calendar">
  <div className="progress-section-head"><div><p className="eyebrow">YOUR PRACTICE, DAY BY DAY</p><h2 className="h2" id="activity-heading">Learning & experiment activity</h2></div><div className="activity-range" role="group" aria-label="Calendar period">{(["quarter","year"] as const).map(r=><button key={r} className="btn" aria-pressed={(range==="auto"?(narrow?"quarter":"year"):range)===r} onClick={()=>setRange(r)}>{r==="quarter"?"Last 12 weeks":"Last year"}</button>)}</div></div>
  <p className="activity-summary"><strong>{total}</strong> qualifying activities across <strong>{activeDays}</strong> active days <span>in this view</span></p>
  <div className="activity-chart-wrap"><div className="activity-chart" style={{"--weeks":weeks} as React.CSSProperties}>
   <div className="activity-months" aria-hidden="true">{Array.from({length:weeks},(_,w)=>{const day=cells.slice(w*7,w*7+7).find(d=>d && ((w===0 && Number(visible[0].date.slice(-2))<=21) || d.date.endsWith("-01")));return <span key={w}>{day?new Date(day.date+"T12:00:00Z").toLocaleDateString("en",{month:"short",timeZone:"UTC"}):""}</span>;})}</div>
   <div className="activity-weekdays" aria-hidden="true">{["","Mon","","Wed","","Fri", ""].map((label,i)=><span key={i}>{label}</span>)}</div>
   <div className="practice-grid" role="group" aria-label="Daily activity; use arrow keys to move between days" data-testid="practice-grid">
    {cells.map((d,i)=>!d?<span key={i} className="activity-pad"/>:<button type="button" key={d.date} ref={el=>{if(el)buttons.current.set(d.date,el);else buttons.current.delete(d.date);}} className={`practice-cell level-${d.level}`} data-date={d.date} aria-label={activityDescription(d)} aria-pressed={selected===d.date} tabIndex={d.date===active?0:-1}
     onFocus={()=>{setFocus(d.date);setHint(activityDescription(d));}} onMouseEnter={()=>setHint(activityDescription(d))} onClick={()=>onSelect(d.date)} onKeyDown={e=>{const offset=({ArrowRight:7,ArrowLeft:-7,ArrowDown:1,ArrowUp:-1} as Record<string,number>)[e.key];let target=-1;const n=visible.findIndex(v=>v.date===d.date);if(offset!==undefined)target=Math.max(0,Math.min(visible.length-1,n+offset));if(e.key==="Home")target=0;if(e.key==="End")target=visible.length-1;if(target>=0){e.preventDefault();buttons.current.get(visible[target].date)?.focus();}}}/>) }
   </div>
  </div></div>
  <div className="activity-key"><span>Days use UTC · Select a square for details.</span><span className="activity-legend" aria-label="Purple intensity: 0, 1, 2 to 3, 4 to 6, 7 or more activities">Less {[0,1,2,3,4].map(n=><i key={n} className={`practice-cell level-${n}`} aria-hidden="true"/>)} More</span></div>
  <p className="activity-hint hint" role="status">{hint||`${dateLabel(visible[0].date)} to ${dateLabel(visible.at(-1)!.date)}. Arrow keys move between days; Enter opens details.`}</p>
  <details className="activity-counting"><summary>What counts?</summary><p>A passed lesson check (once per lesson per UTC day), a completed saved simulation or Limits calculation, or an evaluated challenge submission. A modeled failure still counts as practice. Page visits, edits, pending or technically failed jobs and live previews do not count. This measures activity, not expertise.</p></details>
 </section>;
}
