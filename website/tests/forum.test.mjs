import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../dist/server/index.js';
function setup(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
 const db={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return {results:sqlite.prepare(sql).all(...this.args)};},async run(){const result=sqlite.prepare(sql).run(...this.args);return {success:true,meta:{changes:result.changes}};}};},async batch(statements){sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.all());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const alice='a'.repeat(64),bob='b'.repeat(64);
 async function request(path,method='GET',data,token,extra={}){const response=await worker.fetch(new Request('https://forum.test/api/forum/'+path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{'X-Forum-Token':token}:{}),...extra},...(data?{body:JSON.stringify(data)}:{})}),{DB:db});return {status:response.status,data:await response.json()};}
 const topic=(overrides={})=>({id:crypto.randomUUID(),course:'cloud-computing',kind:'notes-request',subject:'求 Cloud Computing 复习笔记',message:'请问有人整理过这部分吗？ https://example.com/notes',author:'Student A',...overrides});
 return {request,topic,alice,bob,sqlite};
}
test('anonymous public discussion and replies persist across independent visitors; deleting own topic retains replies',async()=>{
 const {request,topic,alice,bob,sqlite}=setup();const data=topic();assert.equal((await request('threads','POST',data,alice)).status,201);
 const list=await request('threads');assert.equal(list.data.threads[0].subject,data.subject);assert.ok(!JSON.stringify(list.data).includes('owner_hash'));
 const reply={id:crypto.randomUUID(),message:'我这里有一份，可以参考。',author:'Student B'};assert.equal((await request(`threads/${data.id}/replies`,'POST',reply,bob)).status,201);
 const detail=await request(`threads/${data.id}`);assert.equal(detail.data.replies[0].message,reply.message);assert.equal(detail.data.thread.canDelete,false);
 assert.equal((await request(`threads/${data.id}`,'DELETE',null,bob)).status,403);
 assert.equal((await request(`threads/${data.id}`,'GET',null,alice)).data.thread.canDelete,true);
 assert.equal((await request(`threads/${data.id}`,'DELETE',null,alice)).status,200);
 const removed=await request(`threads/${data.id}`);assert.equal(removed.data.thread.deleted,1);assert.equal(removed.data.thread.message,'');assert.equal(removed.data.replies.length,1);
 assert.equal((await request(`threads/${data.id}/replies`,'POST',{...reply,id:crypto.randomUUID()},bob)).status,409);assert.equal((await request('threads')).data.threads.length,0);sqlite.close();
});
test('idempotent retry creates one topic/reply and rejects changed payload or stolen IDs',async()=>{
 const {request,topic,alice,bob,sqlite}=setup();const data=topic();await request('threads','POST',data,alice);
 assert.equal((await request('threads','POST',data,alice)).status,200);assert.equal((await request('threads','POST',data,bob)).status,409);assert.equal((await request('threads','POST',{...data,message:'changed'},alice)).status,409);
 const reply={id:crypto.randomUUID(),author:'B',message:'Reply'};await request(`threads/${data.id}/replies`,'POST',reply,bob);assert.equal((await request(`threads/${data.id}/replies`,'POST',reply,bob)).status,200);
 assert.equal((await request(`threads/${data.id}`)).data.replies.length,1);sqlite.close();
});
test('server validates post size, course, token, source, and method',async()=>{
 const {request,topic,alice,sqlite}=setup();assert.equal((await request('threads','POST',topic())).status,400);assert.equal((await request('threads','POST',topic({course:'fake'}),alice)).status,400);assert.equal((await request('threads','POST',topic({message:'x'.repeat(10001)}),alice)).status,400);assert.equal((await request('threads','POST',topic(),alice,{Origin:'https://evil.test'})).status,403);assert.equal((await request('threads','POST',topic({website:'spam'}),alice)).status,400);assert.equal((await request('threads','PATCH',topic(),alice)).status,404);assert.equal((await request('threads?page=-1')).status,400);sqlite.close();
});
test('browser rate limit is atomic and retries are accepted after reaching it',async()=>{
 const {request,topic,alice,sqlite}=setup();const first=topic();await request('threads','POST',first,alice);for(let i=0;i<11;i++)assert.equal((await request('threads','POST',topic(),alice)).status,201);
 const result=await request('threads','POST',topic(),alice);assert.equal(result.status,429);assert.equal((await request('threads','POST',first,alice)).status,200);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM forum_threads').get().n,12);sqlite.close();
});
test('filtered pagination is bounded and messages remain text without leaking capabilities',async()=>{
 const {request,topic,sqlite}=setup();for(let i=0;i<23;i++)await request('threads','POST',topic({subject:'Topic '+i,message:'<img src=x onerror=alert(1)> javascript:alert(1)'}),i.toString(16).padStart(64,'0'));
 const page=await request('threads?course=cloud-computing&kind=notes-request');assert.equal(page.data.threads.length,20);assert.equal(page.data.hasMore,true);
 assert.equal((await request('threads?page=1')).data.threads.length,3);assert.equal((await request('threads?q=Topic%2022')).data.threads.length,1);
 const detail=await request('threads/'+page.data.threads[0].id);assert.equal(detail.data.thread.message,'<img src=x onerror=alert(1)> javascript:alert(1)');assert.ok(!JSON.stringify(detail.data).includes('owner_hash'));assert.ok(!JSON.stringify(detail.data).includes('payload_hash'));sqlite.close();
});
