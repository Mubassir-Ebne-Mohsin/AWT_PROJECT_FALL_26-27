// Restore only test-overwritten artifacts from this task's exact entry copies, never Git HEAD.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,"../../.."),backup=fs.readFileSync(path.join(process.env.TEMP,"sf-notifications-preserve-location.txt"),"utf8").trim();
const original=JSON.parse(fs.readFileSync(path.join(backup,"manifest.json"),"utf8"));
const hash=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const restored=[];
for(const [relative,sha] of Object.entries(original)){
 const destination=path.resolve(root,relative);if(!destination.startsWith(root+path.sep))throw Error("Unsafe preservation target");
 if(hash(destination)!==sha){
  if(!(relative.startsWith("docs/audit/")&&relative.endsWith(".png"))&&relative!=="docs/contracts/m11-runtime.openapi.json")throw Error("Protected source unexpectedly changed: "+relative);
  const source=path.join(backup,relative);if(hash(source)!==sha)throw Error("Backup mismatch");
  fs.copyFileSync(source,destination);restored.push(relative);
 }
 if(hash(destination)!==sha)throw Error("Preservation failed");
}
fs.writeFileSync(path.join(__dirname,"preservation-entry.json"),JSON.stringify(original,null,2)+"\n");
const result={filesVerified:Object.keys(original).length,pngsVerified:Object.keys(original).filter(p=>p.endsWith(".png")).length,restored,
 m2:hash(path.join(root,"docs/audit/m2-profile-source.json")),runtime:hash(path.join(root,"docs/contracts/m11-runtime.openapi.json")),config:hash(path.join(root,"web/next.config.ts"))};
fs.writeFileSync(path.join(__dirname,"preservation.json"),JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify(result));
