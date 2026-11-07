// Functional in-memory faults only; application files remain byte-for-byte unchanged.
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'../../..');
const svc='nest-boilerplate/nest-boilerplate/src/modules/support/',migration='nest-boilerplate/nest-boilerplate/src/database/migrations/1794900000000-SupportExtras.ts';
const edits={
 personal:[[svc+'saved-replies.service.ts',"WHERE scope='team' OR owner_id=$1","WHERE scope='team' OR $1::uuid IS NOT NULL"]],
 privacy:[[svc+'support.service.ts','WHERE t.author_id=$2 AND (t.id=$1 OR t.merged_into_id=$1)','WHERE (t.author_id=$2 OR $2::uuid IS NOT NULL) AND (t.id=$1 OR t.merged_into_id=$1)']],
 cycle:[[svc+'merge.service.ts','if(id===targetId||source.merged_into_id||target.merged_into_id)','if(id===targetId && false)'],[svc+'merge.service.ts','if(n>0)','if(n<0)'],[migration,'ALTER TABLE support_tickets ADD CONSTRAINT support_merge_self CHECK(merged_into_id IS NULL OR merged_into_id<>id)','SELECT 1'],[migration,'CREATE TRIGGER support_merge_guard BEFORE INSERT OR UPDATE OF merged_into_id ON support_tickets FOR EACH ROW EXECUTE FUNCTION support_merge_guard()','SELECT 1']],
 send:[['web/src/components/support/ticket-detail.tsx','setText(appendSavedReply(draft.current,reply))','void replyInbox(id,reply,false);setText(appendSavedReply(draft.current,reply))']],
};const kind=process.env.SF_SUPPORT_E_MUTATION;if(!edits[kind])throw Error('Invalid E mutation');const read=fs.readFileSync;let applied=0;
fs.readFileSync=function(file,...args){let out=read.call(this,file,...args);if(typeof file==='string')for(const [relative,before,after] of edits[kind]){if(path.resolve(file).toLowerCase()===path.resolve(root,relative).toLowerCase()&&String(out).includes(before)){applied++;const next=String(out).replaceAll(before,after);out=typeof out==='string'?next:Buffer.from(next);}}return out;};process.on('exit',()=>console.log('MUTATION_APPLIED',kind,applied));
