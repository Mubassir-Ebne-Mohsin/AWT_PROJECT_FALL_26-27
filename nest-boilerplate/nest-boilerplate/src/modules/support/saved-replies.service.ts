import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { z } from "zod";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { AppException } from "@/common/errors";
import { savedReplyInputSchema, savedReplyEditSchema, savedReplyDeleteSchema, savedReplyPreviewRequestSchema, savedReplySchema, savedRepliesSchema, savedReplyPreviewSchema } from "@/common/contracts/phase3/support-extras.schema";
const stamp = "date_trunc('milliseconds',clock_timestamp())";
const missing = () => new AppException("NOT_FOUND","Saved reply not found");
const stale = () => new AppException("CONFLICT","This saved reply changed. Refresh before trying again.",{reason:"SAVED_REPLY_CHANGED"});
const invalid = () => new AppException("VALIDATION_FAILED","Check the reply title, body and fields");
@Injectable()
export class SavedRepliesService {
  constructor(private readonly db: DataSource) {}
  private parse<T>(schema:z.ZodType<T>,raw:unknown):T {const p=schema.safeParse(raw);if(!p.success)throw invalid();return p.data;}
  private dto(r:any){return savedReplySchema.parse({id:r.id,title:r.title,body:r.body,scope:r.scope,createdAt:new Date(r.created_at).toISOString(),updatedAt:new Date(r.updated_at).toISOString()});}
  private async audit(m:EntityManager,u:AuthUser,action:string,id:string){await m.query(`INSERT INTO support_activity(at,ticket_id,ticket_ref,action,actor_kind,actor_id,actor_email,to_value) VALUES(${stamp},NULL,NULL,$1,'support',$2,$3,$4)`,[action,u.id,u.email,id]);}
  async list(userId:string){const rows=await this.db.query("SELECT * FROM support_saved_replies WHERE scope='team' OR owner_id=$1 ORDER BY scope,title,id",[userId]);return savedRepliesSchema.parse(rows.map((r:any)=>this.dto(r)));}
  async create(u:AuthUser,raw:unknown){const p=this.parse(savedReplyInputSchema,raw);return this.db.transaction(async m=>{
    await m.query("SELECT pg_advisory_xact_lock(hashtext('sf-support-saved'))");
    const [{n}]=await m.query("SELECT count(*)::int AS n FROM support_saved_replies WHERE scope=$1::varchar AND ($1::varchar='team' OR owner_id=$2)",[p.scope,u.id]);
    if(n >= (p.scope==='team'?100:50))throw new AppException("CONFLICT","The saved reply limit has been reached",{reason:"SAVED_REPLY_LIMIT"});
    const [row]=await m.query("INSERT INTO support_saved_replies(owner_id,scope,title,body) VALUES($1,$2,$3,$4) RETURNING *",[u.id,p.scope,p.title,p.body]);await this.audit(m,u,'saved_create',row.id);return this.dto(row);
  });}
  private async editable(m:EntityManager,userId:string,id:string,at:string){const [r]=await m.query("SELECT * FROM support_saved_replies WHERE id=$1 AND (scope='team' OR owner_id=$2) FOR UPDATE",[id,userId]);if(!r)throw missing();if(new Date(r.updated_at).toISOString()!==at)throw stale();return r;}
  async edit(u:AuthUser,id:string,raw:unknown){const p=this.parse(savedReplyEditSchema,raw);return this.db.transaction(async m=>{await this.editable(m,u.id,id,p.expectedUpdatedAt);const [r]=await m.query(`WITH changed AS (UPDATE support_saved_replies SET title=$2,body=$3,updated_at=GREATEST(${stamp},updated_at+interval '1 millisecond') WHERE id=$1 RETURNING *) SELECT * FROM changed`,[id,p.title,p.body]);await this.audit(m,u,'saved_update',id);return this.dto(r);});}
  async remove(u:AuthUser,id:string,raw:unknown){const p=this.parse(savedReplyDeleteSchema,raw);return this.db.transaction(async m=>{await this.editable(m,u.id,id,p.expectedUpdatedAt);await m.query("DELETE FROM support_saved_replies WHERE id=$1",[id]);await this.audit(m,u,'saved_delete',id);return {deleted:true as const};});}
  async preview(u:AuthUser,id:string,raw:unknown){const p=this.parse(savedReplyPreviewRequestSchema,raw);return this.db.transaction('REPEATABLE READ',async m=>{
    const [r]=await m.query("SELECT * FROM support_saved_replies WHERE id=$1 AND (scope='team' OR owner_id=$2)",[id,u.id]);if(!r)throw missing();if(new Date(r.updated_at).toISOString()!==p.expectedUpdatedAt)throw stale();
    const [t]=await m.query("SELECT t.ref,u.display_name FROM support_tickets t LEFT JOIN users u ON u.id=t.author_id WHERE t.id=$1",[p.ticketId]);if(!t)throw new AppException("NOT_FOUND","Report not found");
    // Function replacement never interprets $ sequences or recursively expands inserted names.
    const body=r.body.replace(/\{(code|name)\}/g,(_:string,key:string)=>key==='code'?`SF-${t.ref}`:(t.display_name??'there'));
    const result=savedReplyPreviewSchema.safeParse({body});if(!result.success)throw new AppException("VALIDATION_FAILED","Expanded reply is over 4000 characters. Shorten the template first.");return result.data;
  });}
}
