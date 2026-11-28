// Task-owned local-only preview server. Exposes four explicitly whitelisted static assets.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../web/public/region-lab-preview');
const files={'index.html':'text/html; charset=utf-8','region-lab.css':'text/css; charset=utf-8','region-lab.js':'text/javascript; charset=utf-8','prototype-data.js':'text/javascript; charset=utf-8'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
 if(url.pathname==='/'){res.writeHead(302,{Location:'/region-lab-preview/index.html'});return res.end();}
 if(['/dashboard','/evaluation/simulator'].includes(url.pathname)){res.writeHead(302,{Location:'http://localhost:3000'+url.pathname});return res.end();}
 const file=url.pathname.startsWith('/region-lab-preview/')?url.pathname.slice('/region-lab-preview/'.length):'';
 if(!Object.hasOwn(files,file)){res.writeHead(404);return res.end('Not found');}
 const data=fs.readFileSync(path.join(root,file));res.writeHead(200,{'Content-Type':files[file],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"});res.end(req.method==='HEAD'?undefined:data);
});
server.listen(3015,'127.0.0.1',()=>console.log('Region Lab UI preview: http://127.0.0.1:3015/region-lab-preview/index.html'));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
