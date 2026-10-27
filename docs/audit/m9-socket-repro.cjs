// Only the dedicated M9 Redis endpoint is used; kill only this helper's own connection.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..');
const backendRequire=createRequire(path.join(root,'nest-boilerplate/nest-boilerplate/package.json'));
const {createClient,SocketClosedUnexpectedlyError}=backendRequire('redis');
(async()=>{
 const client=createClient({url:'redis://127.0.0.1:6399'}),admin=client.duplicate();
 client.on('error',()=>{});admin.on('error',()=>{});
 try {
  await client.connect();await admin.connect();const id=await client.clientId();
  const pending=client.blPop('sf:m9:socket-test',5).catch(e=>e);
  await new Promise(r=>setTimeout(r,50));await admin.sendCommand(['CLIENT','KILL','ID',String(id)]);
  const error=await pending;assert.ok(error instanceof SocketClosedUnexpectedlyError);
  const {AllExceptionsFilter}=backendRequire('./dist/common/filters/all-exceptions.filter');
  let status,body;const response={status(s){status=s;return this},json(b){body=b}};
  new AllExceptionsFilter().catch(error,{switchToHttp:()=>({getResponse:()=>response})});
  const evidence={operation:'disconnect only own blocked audit Redis connection',name:error.name,errorClass:error.constructor.name,status,code:body.error.code};
  fs.writeFileSync(path.join(__dirname,'m9-socket-fixed.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence));assert.equal(status,503);assert.equal(body.error.code,'UNAVAILABLE');
 } finally {if(client.isOpen)client.destroy();if(admin.isOpen)admin.destroy();}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
