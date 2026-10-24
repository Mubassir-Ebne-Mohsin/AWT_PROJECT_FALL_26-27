import {useState} from "react";
import type {Graph} from "@/lib/api/designs";
export function ConnectionPanel({graph,selected,select,connect,reverse,remove}:{
 graph:Graph;selected:string;select:(id:string)=>void;connect:(from:string,to:string)=>void;reverse:()=>void;remove:()=>void;
}) {
 const [from,setFrom]=useState(""),[to,setTo]=useState("");
 const edge=graph.edges.find(e=>e.id===selected);
 return <div className="props-sec stack">
  <h3 className="h3">Connections</h3>
  <label className="field"><span className="label">Connection</span><select className="select sm" aria-label="Connection" value={edge?.id??""} onChange={e=>select(e.target.value)}>
   <option value="">Select a connection</option>
   {graph.edges.map(e=><option key={e.id} value={e.id}>{graph.nodes.find(n=>n.id===e.from)?.label} → {graph.nodes.find(n=>n.id===e.to)?.label}</option>)}
  </select></label>
  {edge && <><p className="small">{graph.nodes.find(n=>n.id===edge.from)?.label} → {graph.nodes.find(n=>n.id===edge.to)?.label}</p><div className="row"><button className="btn btn-sm" onClick={reverse}>Reverse connection</button><button className="btn btn-sm" onClick={remove}>Delete connection</button></div></>}
  <label className="field"><span className="label">Source component</span><select className="select sm" aria-label="Source component" value={graph.nodes.some(n=>n.id===from)?from:""} onChange={e=>setFrom(e.target.value)}><option value="">Choose source</option>{graph.nodes.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select></label>
  <label className="field"><span className="label">Destination component</span><select className="select sm" aria-label="Destination component" value={graph.nodes.some(n=>n.id===to)?to:""} onChange={e=>setTo(e.target.value)}><option value="">Choose destination</option>{graph.nodes.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select></label>
  <button className="btn btn-sm" disabled={!from||!to} onClick={()=>connect(from,to)}>Add connection</button>
  <p className="hint">Arrows show traffic direction. Clients can only be the source. Cycles can be saved but must be repaired before Run.</p>
 </div>;
}
