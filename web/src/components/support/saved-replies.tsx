"use client";
import { useId,useRef,useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { useSupportAction } from "@/components/support/use-support-action";
import { getSavedReplies,createSavedReply,editSavedReply,deleteSavedReply,previewSavedReply,type SavedReply } from "@/lib/api/support-extras";
import { supportErrorText } from "@/lib/support";
export function SavedReplies({ticketId,onInsert,disabled=false}:{ticketId:string;onInsert:(text:string)=>void;disabled?:boolean}){
 const {user}=useAuth(),client=useQueryClient(),action=useSupportAction();
 const prefix=useId();
 const summary=useRef<HTMLElement>(null);
 function run<T>(work:(signal:AbortSignal)=>Promise<T>,done:(value:T)=>void){summary.current?.focus();void action.run(work,done);}
 const key=["support-saved-replies",user?.id];
 const q=useQuery({queryKey:key,queryFn:({signal})=>getSavedReplies(signal),enabled:!!user,retry:false,staleTime:30000});
 const [selected,setSelected]=useState(""),[title,setTitle]=useState(""),[body,setBody]=useState(""),[scope,setScope]=useState<"personal"|"team">("personal"),[editing,setEditing]=useState<SavedReply|null>(null),[notice,setNotice]=useState("");
 const reply=q.data?.find(r=>r.id===selected),busy=action.busy||disabled;
 const refresh=()=>void client.invalidateQueries({queryKey:key});
 function reset(){setEditing(null);setTitle("");setBody("");setScope("personal");}
 return <details className="panel rp-pad support-extras" aria-label="Saved replies"><summary ref={summary}>Saved replies</summary><div className="stack">
  <p className="hint">Insert into the draft, review, then send yourself. Nothing is sent automatically. Limits: 50 personal replies per account and 100 team replies across Support.</p>
  {q.isPending?<p role="status">Loading saved replies…</p>:q.isError?<p role="alert">{supportErrorText(q.error)}</p>:null}
  <div className="field"><label htmlFor={prefix+"-choose"}>Choose saved reply</label><select id={prefix+"-choose"} className="select" value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setNotice("");}}><option value="">Choose an answer</option>{q.data?.map(r=><option key={r.id} value={r.id}>{r.scope==='team'?'Team':'Personal'}: {r.title}</option>)}</select></div>
  <div className="row">
   <button className="btn btn-sm" disabled={busy||!reply} onClick={()=>{if(reply)run(signal=>previewSavedReply(reply,ticketId,signal),p=>{onInsert(p.body);setNotice("Inserted into draft. Review before sending.");});}}>Insert reply</button>
   <button className="btn btn-sm" disabled={busy} onClick={()=>void q.refetch()}>Refresh saved replies</button>
   <button className="btn btn-sm" disabled={busy||!reply} onClick={()=>{if(reply){setEditing(reply);setTitle(reply.title);setBody(reply.body);setScope(reply.scope);setNotice("");}}}>Edit selected reply</button>
   <button className="btn btn-sm" disabled={busy||!reply} onClick={()=>{if(reply&&window.confirm('Delete this saved reply? Existing sent messages will remain.'))run(signal=>deleteSavedReply(reply.id,reply.updatedAt,signal),()=>{setSelected("");reset();refresh();setNotice("Saved reply deleted.");});}}>Delete selected reply</button>
  </div>
  <form className="stack" aria-label="Saved reply editor" onSubmit={e=>{e.preventDefault();setNotice("");run(signal=>editing?editSavedReply(editing.id,{title,body,expectedUpdatedAt:editing.updatedAt},signal):createSavedReply({title,body,scope},signal),r=>{client.setQueryData<SavedReply[]>(key,old=>[...(old??[]).filter(v=>v.id!==r.id),r]);setSelected(r.id);reset();refresh();setNotice("Saved reply saved.");});}}>
   <h3 className="h3">{editing?'Edit saved reply':'Create a saved reply'}</h3>
   <div className="field"><label htmlFor={prefix+"-title"}>Saved reply title</label><input id={prefix+"-title"} className="input" value={title} required minLength={3} maxLength={120} disabled={busy} onChange={e=>setTitle(e.target.value)}/></div>
   <div className="field"><label htmlFor={prefix+"-body"}>Saved reply body</label><textarea id={prefix+"-body"} className="textarea" rows={4} value={body} required maxLength={4000} disabled={busy} onChange={e=>setBody(e.target.value)}/></div>
   <p className="hint">Only {'{name}'} and {'{code}'} are replaced. Unknown placeholders remain text. Maximum 4000 characters after expansion.</p>
   <div className="field"><label htmlFor={prefix+"-scope"}>Saved reply visibility</label><select id={prefix+"-scope"} className="select" value={scope} disabled={busy||!!editing} onChange={e=>setScope(e.target.value as 'personal'|'team')}><option value="personal">Personal — only me</option><option value="team">Team — Support can use, edit and delete</option></select></div>
   <div className="row"><button className="btn btn-sm" disabled={busy}>{busy?'Saving…':editing?'Save reply changes':'Create saved reply'}</button>{editing&&<button type="button" className="btn btn-sm" disabled={busy} onClick={reset}>Cancel saved reply edit</button>}</div>
  </form>
  {action.error&&<p className="note fail" role="alert">{action.error}</p>}{notice&&<p role="status">{notice}</p>}
 </div></details>;
}
