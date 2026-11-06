// In-memory faults only; never edits application sources.
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"../../.."),svc="nest-boilerplate/nest-boilerplate/src/modules/notifications/notifications.service.ts";
const cases={
 recipient:[[svc,"WHERE u.id = ANY($3::uuid[])","WHERE $3::uuid[] IS NOT NULL"]],
 self:[[svc,"AND u.id <> $4::uuid","AND $4::uuid IS NOT NULL"]],
 access:[[svc,"const allowed = staffKind ? row.staff : row.author_id === userId;","const allowed = true;"]],
 privacy:[
  ["nest-boilerplate/nest-boilerplate/src/database/migrations/1794800000000-Notifications.ts","read_at timestamptz NULL)","read_at timestamptz NULL, message text)"],
  [svc,"INSERT INTO notifications(user_id, kind, ref_id)","INSERT INTO notifications(user_id, kind, ref_id, message)"],
  [svc,"SELECT u.id, $1::varchar, $2::uuid FROM users u","SELECT u.id, $1::varchar, $2::uuid, (SELECT title FROM support_tickets WHERE id=$2::uuid) FROM users u"],
 ],
 stale:[["web/src/components/notifications/use-notifications.ts","if (!s.alive || seq !== s.seq || controller.signal.aborted) return;","/* deliberately accept a stale read */"]],
};
const kind=process.env.SF_NOTIFICATIONS_MUTATION,edits=cases[kind];if(!edits)throw Error("Unknown notification mutation");
const original=fs.readFileSync;let applied=0;
fs.readFileSync=function(file,...args){let data=original.call(this,file,...args);if(typeof file!=="string")return data;
 for(const [relative,before,after] of edits){if(path.resolve(file).toLowerCase()!==path.resolve(root,relative).toLowerCase())continue;
  const text=String(data).replaceAll("\r\n","\n");if(!text.includes(before))continue;applied++;
  const result=text.replaceAll(before,after);data=typeof data==="string"?result:Buffer.from(result);
 }return data;
};
process.on("exit",()=>console.log("MUTATION_APPLIED",kind,applied));
