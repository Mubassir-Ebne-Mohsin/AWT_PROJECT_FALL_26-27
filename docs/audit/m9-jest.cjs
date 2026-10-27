const path=require('node:path');
const backend=path.resolve(__dirname,'../../nest-boilerplate/nest-boilerplate');
const action=process.argv[2];
const config=action==='unit'?{...require(path.join(backend,'package.json')).jest,rootDir:path.join(backend,'src')}:{...require(path.join(backend,'test/jest-e2e.json')),rootDir:backend};
const args=['--config',JSON.stringify(config),'--runInBand',...process.argv.slice(3)];
require(path.join(backend,'node_modules/jest')).run(args);
