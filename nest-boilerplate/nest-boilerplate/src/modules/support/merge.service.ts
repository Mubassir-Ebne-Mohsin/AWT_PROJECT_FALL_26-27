import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppException } from "@/common/errors";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { mergeRequestSchema,unmergeRequestSchema } from "@/common/contracts/phase3/support-extras.schema";
import { NotificationsService } from "@/modules/notifications/notifications.service";
const now="date_trunc('milliseconds',clock_timestamp())";
const conflict=(message:string)=>new AppException("CONFLICT",message,{reason:"MERGE_CHANGED"});
@Injectable()
export class MergeService {
 constructor(private readonly db:DataSource,private readonly notices:NotificationsService){}
 async change(u:AuthUser,id:string,raw:unknown,undo=false){
  const schema=undo?unmergeRequestSchema:mergeRequestSchema;const parsed=schema.safeParse(raw);if(!parsed.success)throw new AppException("VALIDATION_FAILED","Select a report and refresh its current version");
  const p=parsed.data;const targetId='targetId' in p?p.targetId:null;
  await this.db.transaction(async m=>{
   await m.query("SELECT pg_advisory_xact_lock(hashtext('sf-support-merge'))");
   const rows=await m.query("SELECT * FROM support_tickets WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[[id,...(targetId?[targetId]:[])]]);
   const source=rows.find((r:any)=>r.id===id),target=rows.find((r:any)=>r.id===targetId);
   if(!source||(!undo&&!target))throw new AppException("NOT_FOUND","Report not found");
   if(new Date(source.updated_at).toISOString()!==p.expectedUpdatedAt)throw conflict("This report changed. Refresh before merging or unmerging.");
   if(undo){if(!source.merged_into_id)throw conflict("This report is no longer merged");}
   else {
    if(id===targetId||source.merged_into_id||target.merged_into_id)throw conflict("Cannot merge into itself or create a merge chain or cycle");
    if('targetUpdatedAt' in p && new Date(target.updated_at).toISOString()!==p.targetUpdatedAt)throw conflict("The surviving report changed. Search again.");
    const [{n}]=await m.query("SELECT count(*)::int AS n FROM support_tickets WHERE merged_into_id=$1",[id]);if(n>0)throw conflict("A report with duplicates cannot itself be merged");
   }
   const linkedId=undo?source.merged_into_id:targetId;
   const code=undo?null:`SF-${target.ref}`;
   await m.query(`UPDATE support_tickets SET merged_into_id=$2,status=$3::varchar,resolved_at=CASE WHEN $3::varchar='resolved' THEN ${now} ELSE NULL END,updated_at=GREATEST(${now},updated_at+interval '1 millisecond') WHERE id=$1`,[id,undo?null:targetId,undo?'open':'resolved']);
   const body=undo?'System: Merge reversed. This report is open again.':`System: Merged into ${code}. Your conversation remains private; you can continue writing here or follow the surviving-report link.`;
   await m.query(`INSERT INTO support_messages(ticket_id,author_id,author_kind,internal,body,created_at) VALUES($1,NULL,'support',false,$2,${now})`,[id,body]);
   await m.query(`INSERT INTO support_activity(at,ticket_id,ticket_ref,action,actor_kind,actor_id,actor_email,from_value,to_value) VALUES(${now},$1,$2,$3,'support',$4,$5,$6,$7)`,[id,source.ref,undo?'unmerge':'merge',u.id,u.email,undo?linkedId:null,undo?null:linkedId]);
   await this.notices.emit(m,'report_status',id,u.id,source.author_id?[source.author_id]:[]);
  });
 }
}
