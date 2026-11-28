// Explicit test fixture. Production executor never chooses this path.
process.once('message',message=>{
 switch(process.env.SF_TEST_FAULT){
  case 'spin': while(true){} // Parent watchdog must remain responsive.
  case 'crash': process.exit(17);break;
  case 'memory': {const held=[];while(true)held.push(new Array(1000000).fill(123.45));}
  case 'rss': process.send({type:'heartbeat',id:message.id,token:message.token,rssBytes:300*1024*1024});break;
  case 'invalid': process.send({type:'result',id:message.id,token:message.token,snapshotHash:message.snapshotHash,result:{engineVersion:'invented',repetitions:[]}});process.disconnect();break;
  case 'wrong-token': process.send({type:'result',id:message.id,token:'forged',snapshotHash:message.snapshotHash,result:{}});process.disconnect();break;
 }
});
