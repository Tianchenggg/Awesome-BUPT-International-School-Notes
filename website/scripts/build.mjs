import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { marked, Renderer } from 'marked';
import katex from 'katex';
// Match intentional bold phrases beside CJK punctuation, as GitHub does.
marked.use({extensions:[{name:'strongCompat',level:'inline',start(src){return src.indexOf('**')},tokenizer(src){const m=/^\*\*(?=\S)([^\n]*?\S)\*\*/.exec(src);if(m)return {type:'strongCompat',raw:m[0],tokens:this.lexer.inlineTokens(m[1])}},renderer(token){return `<strong>${this.parser.parseInline(token.tokens)}</strong>`}}]});

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const parent=path.resolve(root,'..');
const source=process.env.NOTES_ROOT || (await fs.stat(path.join(parent,'Cloud Computing')).catch(()=>null)?parent:path.join(parent,'Awesome-BUPT-International-School-Notes'));
const out=path.join(root,'dist');
await fs.mkdir(out,{recursive:true});
for(const d of ['data','media','vendor']) await fs.mkdir(path.join(out,d),{recursive:true});
const metadata=[
 ['Cloud Computing','CC','Systems','云计算架构、虚拟化与分布式系统'],
 ['Communications and Networks','CN','Networks','网络协议、传输机制与通信原理'],
 ['Cryptography and Network Security','CS','Networks','密码算法、身份认证与网络安全'],
 ['Digital Circuit Design','DC','Hardware','组合逻辑、时序电路与状态机'],
 ['Discrete Mathematics','DM','Mathematics','逻辑、集合、关系与图论'],
 ['Embedded Systems','ES','Hardware','处理器、嵌入式开发与实时系统'],
 ['Information Processing for the Internet of Things','IP','Intelligence','数据挖掘、信息检索与图像处理'],
 ['Java Programming','JP','Software','Java 语言、面向对象与程序设计'],
 ['Machine Learning','ML','Intelligence','学习算法、模型评估与计算例题'],
 ['Middleware','MW','Systems','中间件、通信、并发与服务'],
 ['Operating Systems','OS','Systems','进程调度、内存管理与线程同步'],
 ['Probability and Stochastic Processes','PS','Mathematics','随机变量、概率分布与随机过程'],
 ['RFID','RF','Hardware','射频识别、编码与通信协议'],
 ['Signals and Systems','SS','Mathematics','信号分析、系统变换与采样'],
 ['Smart Infrastructure','SI','Intelligence','智慧基础设施、数据处理与分析'],
 ['Software Engineering','SE','Software','软件过程、需求、设计与建模题目'],
 ['毛概','政','Humanities','理论知识点与课程复习提纲'],
];
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const mediaMap=new Map();let mathCount=0;const formulaErrors=[];
const renderMath=(tex,displayMode)=>{mathCount++;try{return katex.renderToString(tex,{displayMode,throwOnError:true,strict:'ignore',trust:false,maxExpand:1000})}catch(e){formulaErrors.push({tex,error:e.message});return `<code>${esc(tex)}</code>`}};
async function html(md,course,quiz=false){
 const replacements=[];
 const stash=(tex,display)=>{const token=`<span data-bupt-math="${replacements.length}"></span>`;replacements.push(renderMath(tex,display));return token};
 md=md.replace(/(^|\n)([ \t]*)```math\s*\n([\s\S]*?)\n\2```/g,(_,lead,indent,tex)=>lead+indent+stash(tex.trim(),true));
 md=md.replace(/\$`([^`]+)`\$/g,(_,tex)=>stash(tex,false));
 if(quiz){md=md.replace(/\$\$([\s\S]+?)\$\$/g,(_,tex)=>stash(tex,true)).replace(/(?<!\$)\$([^\n$]+)\$(?!\$)/g,(_,tex)=>stash(tex,false));}
 // Resolve images using the Markdown parser (including nested parentheses in paths).
 const images=[];const localImages=new Map();
 const tokens=marked.lexer(md,{gfm:true});marked.walkTokens(tokens,t=>{if(t.type==='image')images.push(t)});
 for(const image of images){
  const url=image.href;if(/^(https?:|data:)/.test(url))continue;
  const absolute=path.resolve(source,course,decodeURIComponent(url));
  if(!absolute.startsWith(path.resolve(source)+path.sep))throw Error('Invalid asset path');
  let name=mediaMap.get(absolute);if(!name){name=crypto.createHash('sha1').update(path.relative(source,absolute)).digest('hex').slice(0,16)+path.extname(absolute);await fs.copyFile(absolute,path.join(out,'media',name));mediaMap.set(absolute,name);}
  localImages.set(url,`media/${name}`);
 }
 const renderer=new Renderer();
 renderer.image=({href,text})=>`<img loading="lazy" src="${esc(localImages.get(href)||href)}" alt="${esc(text||'课程插图')}">`;
 renderer.code=({text,lang})=>lang==='mermaid'?`<pre class="mermaid" data-mermaid="true">${esc(text)}</pre>`:`<pre><code class="language-${esc(lang||'text')}">${esc(text)}</code></pre>`;
 let result=marked.parse(md,{gfm:true,renderer});
 result=result.replace(/<span data-bupt-math="(\d+)"><\/span>/g,(_,i)=>replacements[+i]);
 return result;
}
function sections(text){
 const lines=text.split('\n');const count=lines.filter(s=>/^## /.test(s)).length;const splitLevel=count<4?3:2;
 const result=[];let current={title:'课程导读',body:[]};let fence=null;
 for(const line of lines){
  const f=line.match(/^\s*(`{3,}|~{3,})/);if(f){if(!fence)fence=f[1][0];else if(f[1][0]===fence)fence=null;}
  const heading=!fence&&line.match(/^(#{1,6}) (.+)/);
  if(heading&&heading[1].length===1)continue;
  if(heading&&heading[1].length<=splitLevel){if(current.body.join('\n').trim())result.push(current);current={title:heading[2],body:[]};}
  else current.body.push(line);
 }
 if(current.body.join('\n').trim())result.push(current);
 return result;
}
let questions=[];try{questions=JSON.parse(await fs.readFile(path.join(root,'content/questions.json'),'utf8'))}catch{}
const index=[];
for(const [name,short,category,description] of metadata){
 const file=(await fs.readdir(path.join(source,name))).find(x=>x.endsWith('.md'));
 const raw=await fs.readFile(path.join(source,name,file),'utf8');
 const id=name==='毛概'?'mao-gai':name.toLowerCase().replaceAll(' ','-');
 const chunks=sections(raw);const chapters=[];
 for(const [i,section] of chunks.entries())chapters.push({id:`section-${i+1}`,title:section.title,html:await html(section.body.join('\n'),name),minutes:Math.max(1,Math.round(section.body.join('\n').length/900))});
 const quiz=[];
 for(const [i,q] of questions.filter(q=>q.course===name).entries()){
  const match=chunks.findIndex(s=>s.title===q.sourceHeading||s.body.some(l=>l.replace(/^#+\s*/,'').trim()===q.sourceHeading));
  if(match<0)throw Error(`Question source missing: ${name} / ${q.sourceHeading}`);
  quiz.push({id:`${id}-q${i+1}`,...q,promptHtml:await html(q.prompt,name,true),answerHtml:await html(q.answer,name,true),sectionId:chapters[match].id});
 }
 const course={id,name,short,category,description,sourceFile:`${name}/${file}`,chapters,questions:quiz};
 await fs.writeFile(path.join(out,'data',id+'.json'),JSON.stringify(course));
 index.push({...course,chapters:chapters.length,questions:quiz.length});
}
await fs.writeFile(path.join(out,'data/index.json'),JSON.stringify(index));
for(const f of ['index.html','app.js','styles.css','font.css'])await fs.copyFile(path.join(root,'src',f),path.join(out,f));
await fs.cp(path.join(root,'src/assets'),path.join(out,'assets'),{recursive:true});
// Ship only the browser runtime, styles and fonts, keeping production output small.
await fs.rm(path.join(out,'vendor'),{recursive:true,force:true});
await fs.mkdir(path.join(out,'vendor/katex'),{recursive:true});
await fs.copyFile(path.join(root,'node_modules/katex/dist/katex.min.css'),path.join(out,'vendor/katex/katex.min.css'));
await fs.cp(path.join(root,'node_modules/katex/dist/fonts'),path.join(out,'vendor/katex/fonts'),{recursive:true});
await fs.mkdir(path.join(out,'vendor/mermaid'),{recursive:true});
await fs.copyFile(path.join(root,'node_modules/mermaid/dist/mermaid.esm.min.mjs'),path.join(out,'vendor/mermaid/mermaid.esm.min.mjs'));
await fs.cp(path.join(root,'node_modules/mermaid/dist/chunks/mermaid.esm.min'),path.join(out,'vendor/mermaid/chunks/mermaid.esm.min'),{recursive:true,filter:s=>!s.endsWith('.map')});
await fs.writeFile(path.join(out,'_headers'),'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
if(formulaErrors.length){console.error(formulaErrors.slice(0,20));throw Error(`${formulaErrors.length} invalid formulas`)}
console.log(JSON.stringify({courses:index.length,chapters:index.reduce((a,c)=>a+c.chapters,0),questions:questions.length,formulas:mathCount,images:mediaMap.size}));
