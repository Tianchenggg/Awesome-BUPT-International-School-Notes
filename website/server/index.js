import { database } from './db.js';
import { courseIds } from './courses.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kinds=new Set(['question','notes-request','discussion']);
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(status,message)=>{throw new HttpError(status,message)};
async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
function text(value,max,label,required=true){if(typeof value!=='string')fail(400,`${label} is required.`);const s=value.trim();if((required&&!s)||s.length>max)fail(400,`${label} must contain ${required?'1':'0'}–${max} characters.`);return s;}
function pageNumber(url){const value=url.searchParams.get('page')||'0';if(!/^\d{1,4}$/.test(value)||Number(value)>2000)fail(400,'Invalid page.');return Number(value);}
async function owner(request,required=false){const token=request.headers.get('X-Forum-Token')||'';if(!/^[a-f0-9]{64}$/.test(token)){if(required)fail(400,'Your browser could not prepare this post. Refresh and try again.');return '';}return hash(token);}
async function body(request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail(415,'Send this post as JSON.');
 if(Number(request.headers.get('Content-Length'))>40000)fail(413,'This post is too long.');
 const reader=request.body?.getReader();if(!reader)fail(400,'A message is required.');let length=0;const chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>40000){await reader.cancel();fail(413,'This post is too long.');}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{fail(400,'The post could not be read.');}
 if(!data||Array.isArray(data)||typeof data!=='object')fail(400,'Invalid post.');if(data.website)fail(400,'The post could not be submitted.');return data;
}
function publicThread(row,viewer){const {owner_hash,payload_hash,...data}=row;return {...data,canDelete:!!viewer&&viewer===owner_hash&&!row.deleted};}
function publicReply(row,viewer){const {owner_hash,payload_hash,...data}=row;return {...data,canDelete:!!viewer&&viewer===owner_hash&&!row.deleted};}
async function permit(db,request,viewer){
 const now=Date.now(),window=Math.floor(now/600000);const network=await hash(`${window}:${request.headers.get('CF-Connecting-IP')||'local'}`);
 const buckets=[{key:`browser:${window}:${viewer}`,limit:12},{key:`network:${window}:${network}`,limit:100}];
 const results=await db.batch(buckets.map(b=>db.prepare('INSERT INTO forum_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count').bind(b.key,(window+2)*600000,b.limit)));
 if(results.some(r=>!r.results.length))fail(429,'You have posted several messages recently. Please wait a few minutes and try again.');
 await db.prepare('DELETE FROM forum_limits WHERE expires_at < ?').bind(now).run();
}
async function existingSubmission(db,table,id,viewer,payloadHash){
 const row=await db.prepare(`SELECT id, owner_hash, payload_hash FROM ${table} WHERE id=?`).bind(id).first();if(!row)return null;
 if(row.owner_hash!==viewer||row.payload_hash!==payloadHash)fail(409,'This submission has changed. Start a new post.');return row.id;
}
export async function forum(request,env){
 const url=new URL(request.url),path=url.pathname;const db=database(env),viewer=await owner(request),method=request.method;
 if(method!=='GET'){
  const origin=request.headers.get('Origin');if((origin&&origin!==url.origin)||request.headers.get('Sec-Fetch-Site')==='cross-site')fail(403,'Open the forum on this website to post.');
 }
 if(path==='/api/forum/threads'&&method==='GET'){
  const course=url.searchParams.get('course')||'',kind=url.searchParams.get('kind')||'',q=text(url.searchParams.get('q')||'',120,'Search',false),page=pageNumber(url);
  if(course&&course!=='general'&&!courseIds.includes(course))fail(400,'Unknown course.');if(kind&&!kinds.has(kind))fail(400,'Unknown discussion type.');
  const conditions=['t.deleted=0'],values=[];if(course){conditions.push('t.course=?');values.push(course);}if(kind){conditions.push('t.kind=?');values.push(kind);}if(q){conditions.push('(instr(lower(t.subject),lower(?))>0 OR instr(lower(t.message),lower(?))>0)');values.push(q,q);}
  const rows=(await db.prepare(`SELECT t.id,t.course,t.kind,t.subject,t.author,t.created_at,t.updated_at,
    (SELECT count(*) FROM forum_replies r WHERE r.thread_id=t.id AND r.deleted=0) AS replies,
    COALESCE((SELECT r.author FROM forum_replies r WHERE r.thread_id=t.id AND r.deleted=0 ORDER BY r.created_at DESC,r.id DESC LIMIT 1),t.author) AS last_author
    FROM forum_threads t WHERE ${conditions.join(' AND ')} ORDER BY t.updated_at DESC,t.id DESC LIMIT 21 OFFSET ?`).bind(...values,page*20).all()).results;
  return json({threads:rows.slice(0,20),page,hasMore:rows.length>20});
 }
 const threadMatch=path.match(/^\/api\/forum\/threads\/([a-f0-9-]+)$/i),replyListMatch=path.match(/^\/api\/forum\/threads\/([a-f0-9-]+)\/replies$/i),replyMatch=path.match(/^\/api\/forum\/replies\/([a-f0-9-]+)$/i);
 if(threadMatch&&method==='GET'){
  const thread=await db.prepare('SELECT * FROM forum_threads WHERE id=?').bind(threadMatch[1]).first();if(!thread)fail(404,'This discussion could not be found.');const page=pageNumber(url);
  const replies=(await db.prepare('SELECT * FROM forum_replies WHERE thread_id=? ORDER BY created_at,id LIMIT 51 OFFSET ?').bind(thread.id,page*50).all()).results;
  return json({thread:publicThread(thread,viewer),replies:replies.slice(0,50).map(r=>publicReply(r,viewer)),page,hasMore:replies.length>50});
 }
 if((path==='/api/forum/threads'||replyListMatch)&&method==='POST'){
  const viewer=await owner(request,true),data=await body(request);if(!UUID.test(data.id||''))fail(400,'Invalid submission ID.');
  const author=text(data.author||'Anonymous',40,'Display name'),message=text(data.message,10000,'Message');let subject,course,kind;
  if(!replyListMatch){subject=text(data.subject,160,'Subject');course=text(data.course,100,'Course');kind=text(data.kind,20,'Discussion type');if(course!=='general'&&!courseIds.includes(course))fail(400,'Choose an available course.');if(!kinds.has(kind))fail(400,'Choose a discussion type.');}
  const payloadHash=await hash(JSON.stringify({author,message,subject,course,kind,thread:replyListMatch?.[1]}));const table=replyListMatch?'forum_replies':'forum_threads';
  const result=async()=>({id:data.id,threadId:replyListMatch?.[1]||data.id,...(replyListMatch?{replyPage:Math.floor(((await db.prepare('SELECT count(*) AS n FROM forum_replies WHERE thread_id=? AND (created_at < (SELECT created_at FROM forum_replies WHERE id=?) OR (created_at=(SELECT created_at FROM forum_replies WHERE id=?) AND id<=?))').bind(replyListMatch[1],data.id,data.id,data.id).first()).n-1)/50)}:{})});
  if(await existingSubmission(db,table,data.id,viewer,payloadHash))return json(await result(),200);
  await permit(db,request,viewer);const now=Date.now();
  if(replyListMatch){
   const results=await db.batch([
    db.prepare('INSERT INTO forum_replies (id,thread_id,message,author,owner_hash,payload_hash,created_at) SELECT ?,id,?,?,?,?,? FROM forum_threads WHERE id=? AND deleted=0 ON CONFLICT(id) DO NOTHING RETURNING id').bind(data.id,message,author,viewer,payloadHash,now,replyListMatch[1]),
    db.prepare('UPDATE forum_threads SET updated_at=MAX(updated_at,?) WHERE id=? AND EXISTS (SELECT 1 FROM forum_replies WHERE id=? AND owner_hash=? AND payload_hash=?)').bind(now,replyListMatch[1],data.id,viewer,payloadHash)
   ]);
   if(!results[0].results.length&&!await existingSubmission(db,table,data.id,viewer,payloadHash))fail(409,'This discussion was removed and no longer accepts replies.');
  }else{
   await db.prepare('INSERT INTO forum_threads (id,course,kind,subject,message,author,owner_hash,payload_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(data.id,course,kind,subject,message,author,viewer,payloadHash,now,now).run();
  }
  await existingSubmission(db,table,data.id,viewer,payloadHash);return json(await result(),201);
 }
 if((threadMatch||replyMatch)&&method==='DELETE'){
  const viewer=await owner(request,true),id=(threadMatch||replyMatch)[1];
  const sql=threadMatch?"UPDATE forum_threads SET deleted=1,subject='Discussion removed',message='',author='Anonymous' WHERE id=? AND owner_hash=? RETURNING id":"UPDATE forum_replies SET deleted=1,message='',author='Anonymous' WHERE id=? AND owner_hash=? RETURNING id";
  const result=await db.prepare(sql).bind(id,viewer).all();if(!result.results.length)fail(403,'Only the browser that posted this message can remove it.');return json({removed:true});
 }
 fail(404,'This forum page could not be found.');
}
export default {async fetch(request,env){
 try {if(new URL(request.url).pathname.startsWith('/api/forum/'))return await forum(request,env);return await env.ASSETS.fetch(request);}
 catch(error){if(error instanceof HttpError)return json({error:error.message},error.status);console.error('Forum request failed',{path:new URL(request.url).pathname,error:error.message});return json({error:'The forum is temporarily unavailable. Your message has not been cleared. Please try again.'},503);}
}};
