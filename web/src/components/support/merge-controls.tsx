"use client";
import Link from "next/link";
import { useId,useRef,useState } from "react";
import { useSupportAction } from "@/components/support/use-support-action";
import { listInbox } from "@/lib/api/support";
import { mergeReport,unmergeReport } from "@/lib/api/support-extras";
import { emptyFilters,type InboxDetail,type InboxItem } from "@/lib/support";
export function MergeControls({report:r,onChange,disabled=false}:{report:InboxDetail;onChange:(r:InboxDetail)=>void;disabled?:boolean}){
 const prefix=useId();
 const action=useSupportAction();const heading=useRef<HTMLHeadingElement>(null);
 function run<T>(work:(signal:AbortSignal)=>Promise<T>,done:(value:T)=>void){heading.current?.focus();void action.run(work,done);}
 function changed(value:InboxDetail){heading.current?.focus();onChange(value);}
const [search,setSearch]=useState(""),[items,setItems]=useState<InboxItem[]>([]),[chosen,setChosen]=useState("");
 const selected=items.find(x=>x.id===chosen),busy=action.busy||disabled;
 return <section className="stack support-extras" aria-label="Duplicate reports"><h3 className="h3" tabIndex={-1} ref={heading}>Duplicate reports</h3>
  {r.mergedInto?<><p className="note">Merged into <Link prefetch={false} href={'/support/'+r.mergedInto.id}>{r.mergedInto.code}</Link>. Conversations remain separate and private.</p><button className="btn btn-sm" disabled={busy} onClick={()=>{if(window.confirm('Unmerge and reopen '+r.code+'?'))run(signal=>unmergeReport(r.id,r.updatedAt,signal),changed);}}>Unmerge and reopen</button></>:
   (r.duplicates?.length??0)>0?<p className="hint">This is a surviving report. Unmerge its duplicates before merging it elsewhere.</p>:
   <><div className="field"><label htmlFor={prefix+"-search"}>Find surviving report</label><input id={prefix+"-search"} className="input" value={search} maxLength={100} disabled={busy} placeholder="SF-1042 or a title" onChange={e=>{setSearch(e.target.value);setChosen("");setItems([]);}}/></div>
    <button className="btn btn-sm" disabled={busy||!search.trim()} onClick={()=>run(signal=>listInbox({...emptyFilters(),q:search.trim()},undefined,signal),p=>{setItems(p.items.filter(x=>x.id!==r.id&&!x.mergedInto));setChosen("");})}>Search merge targets</button>
    <div className="field"><label htmlFor={prefix+"-target"}>Surviving report</label><select id={prefix+"-target"} className="select" value={chosen} disabled={busy} onChange={e=>setChosen(e.target.value)}><option value="">Choose a report</option>{items.map(x=><option key={x.id} value={x.id}>{x.code}: {x.title}</option>)}</select></div>
    {selected&&<div className="note"><p>Mark {r.code} as a duplicate of <b>{selected.code}</b>. This report becomes Resolved. No messages, names or internal notes are copied. Support can reverse this.</p><button className="btn btn-sm" disabled={busy} onClick={()=>run(signal=>mergeReport(r.id,{targetId:selected.id,expectedUpdatedAt:r.updatedAt,targetUpdatedAt:selected.updatedAt},signal),changed)}>Confirm merge</button></div>}
   </>}
  {!!r.duplicates?.length&&<><p className="hint">Open each private conversation separately:</p><ul>{r.duplicates.map(x=><li key={x.id}><Link prefetch={false} href={'/support/'+x.id}>{x.code}</Link></li>)}</ul></>}
  {action.error&&<p className="note fail" role="alert">{action.error} Refresh this report before retrying a changed merge.</p>}
 </section>;
}
