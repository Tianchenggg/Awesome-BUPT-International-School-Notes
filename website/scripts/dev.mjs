import {spawnSync,spawn} from 'node:child_process';
const env={...process.env,CLOUDFLARE_CF_FETCH_ENABLED:'false',WRANGLER_SEND_METRICS:'false'};
const cli='node_modules/wrangler/bin/wrangler.js';
const migration=spawnSync(process.execPath,[cli,'d1','migrations','apply','DB','--local'],{stdio:'inherit',env});
if(migration.status!==0)process.exit(migration.status||1);
const preview=spawn(process.execPath,[cli,'dev','--local','--ip','127.0.0.1','--port','4173','--inspector-port','0'],{stdio:'inherit',env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>preview.kill(signal));preview.on('exit',code=>process.exit(code||0));
