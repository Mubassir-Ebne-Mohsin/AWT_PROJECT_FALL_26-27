const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
async function head(file,count){let out='';const lines=readline.createInterface({input:fs.createReadStream(file),crlfDelay:Infinity});let n=0;for await(const line of lines){out+=line+'\n';if(++n>=count){lines.close();break;}}return out;}
(async()=>{
 const reference=await head(path.join(root,'nest-boilerplate/nest-boilerplate/docs/stressforge/reference/architecture-stress-test.html'),85);
 const port=await head(path.join(root,'web/src/styles/proto.css'),80);
 const tokens=text=>[...text.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/g)].filter(m=>!m[1].startsWith('--font-')).map(m=>[m[1],m[2].trim()]);
 const expected=tokens(reference),actual=tokens(port);assert.deepEqual(actual,expected);
 const layout=fs.readFileSync(path.join(root,'web/src/app/layout.tsx'),'utf8');for(const name of ['Archivo','Instrument_Sans','JetBrains_Mono'])assert.ok(layout.includes(name));
 const evidence={tokenOccurrences:expected.length,lightAndDarkValuesMatch:true,fontFamiliesViaNextFont:['Archivo','Instrument Sans','JetBrains Mono'],scope:'CSS source equality excluding intentional next/font variable substitution; visual acceptance recorded separately'};
 fs.writeFileSync(path.join(__dirname,'m9-token-check.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
