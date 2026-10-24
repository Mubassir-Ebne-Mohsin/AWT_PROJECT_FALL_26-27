import Link from "next/link";
import type { EditorSession } from "@/lib/editor-session";
export function ValidationPanel({session, focus, connect}:{
  session:EditorSession;focus?:(id:string)=>void;connect?:(id:string)=>void;
}) {
  const v=session.state.validation;
  if(!v)return <p className="hint">Use Check graph to see problems and repair steps before running.</p>;
  const stale=session.validationStale;
  return <section className="panel panel-b stack" aria-label="Graph validation">
    <div className="row between"><h2 className="h3">Graph check</h2><span className={"pill "+(stale?"warn":v.result.ok?"ok":"fail")}>{stale?"Outdated check":v.result.ok?"Ready to run":"Needs repair"}</span></div>
    {stale && <p role="status">Inputs changed since this check. Check graph again for current issues.</p>}
    {!stale && v.result.ok && <p role="status">No blocking graph errors. {v.result.warnings.length ? "Review the warnings below." : "You can run the saved design."}</p>}
    {[...v.result.errors,...v.result.warnings].map((issue,index)=><div className={"note "+(issue.severity==="error"?"fail":"warn")} key={issue.code+index}>
      <div className="stack"><strong>{issue.message}</strong><p>{issue.repair}</p>
        {!stale && <div className="row">
          {focus ? issue.nodeIds.filter(id=>session.state.design.graph.nodes.some(n=>n.id===id)).map(id=><button className="btn btn-sm" key={id} onClick={()=>focus(id)}>Select {session.state.design.graph.nodes.find(n=>n.id===id)?.label}</button>)
          : <Link className="btn btn-sm" href={"/designs/"+session.state.design.id+"/edit"}>Fix in editor</Link>}
          {connect && issue.code==="ENTRY_UNCONNECTED" && issue.nodeIds[0] && <button className="btn btn-sm" onClick={()=>connect(issue.nodeIds[0])}>Start connection</button>}
        </div>}
      </div>
    </div>)}
    <p className="hint">Checked saved revision {v.revision}. Errors block Run; warnings do not. Checks never change your graph.</p>
  </section>;
}
