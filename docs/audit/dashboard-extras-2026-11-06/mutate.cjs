// Transient, in-memory source mutations. Never edits application files or protected evidence.
const fs=require("node:fs"),path=require("node:path");
const cases={
 pdfprivacy:["../../web/src/lib/admin-summary.ts",'rows.forEach(([label, value], i)', 'text((m as unknown as {email: string}).email ?? "PUBLIC", 120, 9); rows.forEach(([label, value], i)'],
 wrongview:["../../web/src/components/admin/metrics-exports.tsx",'if (file.snapshotKey !== clicked.snapshotKey)', 'if (false)'],
 bucket:["src/modules/roles/admin-activity.ts","cells[row.bucket] = row.designs + row.runs","cells[(row.bucket + 1) % 168] = row.designs + row.runs"],
 weekday:["src/modules/roles/admin-activity.ts","extract(isodow FROM","extract(dow FROM"],
 upper:["src/modules/roles/admin-activity.ts","created_at < $2","created_at <= $2"],
 latest:["src/modules/roles/admin-metrics.service.ts","return adminMetricsSchema.parse(JSON.parse(entry.json));","return this.cached!.value;"],
 expiry:["src/modules/roles/admin-metrics.service.ts","now - entry.at >= 300000","now - entry.at >= 999999999"],
 privacy:["src/modules/roles/admin-metrics-export.service.ts","walk(adminMetricsSchema.parse(value),","walk(value,"],
 permission:["src/modules/roles/roles.controller.ts",'@Get("metrics/export")\n  @RequirePermission(Permission.ADMIN_METRICS_READ)','@Get("metrics/export")'],
};
const kind=process.env.SF_METRICS_MUTATION,change=cases[kind];if(!change)throw Error("Unknown mutation");
const target=path.resolve(__dirname,"../../../nest-boilerplate/nest-boilerplate",change[0]).replaceAll("\\","/").toLowerCase();
const original=fs.readFileSync;let applied=0;
fs.readFileSync=function(file,...args){const data=original.call(this,file,...args);if(typeof file!=="string"||path.resolve(file).replaceAll("\\","/").toLowerCase()!==target)return data;
 const text=String(data),normalized=text.replaceAll("\r\n","\n");if(!normalized.includes(change[1]))return data;applied++;
 const edited=normalized.replaceAll(change[1],change[2]);return typeof data==="string"?edited:Buffer.from(edited);
};
process.on("exit",()=>{original.call(fs,__filename);console.log("MUTATION_APPLIED",kind,applied);});
