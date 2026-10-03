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
await fs.rm(path.join(root,'dist'),{recursive:true,force:true});
const out=path.join(root,'dist/client');
await fs.mkdir(out,{recursive:true});
for(const d of ['data','media','vendor']) await fs.mkdir(path.join(out,d),{recursive:true});
const chapterLabels=JSON.parse(await fs.readFile(path.join(root,'content/chapter-labels-en.json'),'utf8'));
const metadata=[
 ['Cloud Computing','CC','Systems','Cloud architectures, virtualization and distributed systems'],
 ['Communications and Networks','CN','Networks','Network protocols, transmission mechanisms and communication principles'],
 ['Cryptography and Network Security','CS','Networks','Cryptographic algorithms, authentication and network security'],
 ['Digital Circuit Design','DC','Hardware','Combinational logic, sequential circuits and state machines'],
 ['Discrete Mathematics','DM','Mathematics','Logic, sets, relations and graph theory'],
 ['Embedded Systems','ES','Hardware','Processors, embedded development and real-time systems'],
 ['Information Processing for the Internet of Things','IP','Intelligence','Data mining, information retrieval and image processing'],
 ['Java Programming','JP','Software','Java, object-oriented programming and program design'],
 ['Machine Learning','ML','Intelligence','Learning algorithms, model evaluation and worked examples'],
 ['Middleware','MW','Systems','Middleware, communication, concurrency and services'],
 ['Operating Systems','OS','Systems','Process scheduling, memory management and thread synchronization'],
 ['Probability and Stochastic Processes','PS','Mathematics','Random variables, probability distributions and stochastic processes'],
 ['RFID','RF','Hardware','Radio-frequency identification, coding and communication protocols'],
 ['Signals and Systems','SS','Mathematics','Signal analysis, system transforms and sampling'],
 ['Smart Infrastructure','SI','Intelligence','Smart infrastructure, data processing and analysis'],
 ['Software Engineering','SE','Software','Software processes, requirements, design and modeling exercises'],
 ['毛概','政','Humanities','Core theories and course revision outlines'],
];
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const mediaMap=new Map();let mathCount=0;const formulaErrors=[];
const renderMath=(tex,displayMode)=>{mathCount++;try{return katex.renderToString(tex,{displayMode,throwOnError:true,strict:'ignore',trust:false,maxExpand:1000})}catch(e){formulaErrors.push({tex,error:e.message});return `<code>${esc(tex)}</code>`}};
async function html(md,course,quiz=false){
 const replacements=[];
 const stash=(tex,display)=>{const token=`<span data-bupt-math="${replacements.length}"></span>`;replacements.push(renderMath(tex,display));return token};
 md=md.replace(/(^|\n)([ \t]*)```math\s*\n([\s\S]*?)\n\2```/g,(_,lead,indent,tex)=>lead+indent+stash(tex.trim(),true));
 md=md.replace(/\$`([^`]+)`\$/g,(_,tex)=>stash(tex,false));
 if(quiz){
  // Literal code and escaped currency must never enter the formula parser.
  const code=[];const protect=value=>{const key=`BUPTLITERALCODE${code.length}END`;code.push(value);return key};
  md=md.replace(/(^|\n)([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2\3[ \t]*(?=\n|$)/g,protect).replace(/(`+)[^`]*?\1/g,protect);
  md=md.replace(/(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$/g,(_,tex)=>stash(tex,true)).replace(/(?<![\\$])\$([^\n$]+?)(?<!\\)\$(?!\$)/g,(_,tex)=>stash(tex,false));
  md=md.replace(/BUPTLITERALCODE(\d+)END/g,(_,i)=>code[+i]);
 }
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
 renderer.image=({href,text})=>`<img loading="lazy" src="${esc(localImages.get(href)||href)}" alt="${esc(text||'Course illustration')}">`;
 renderer.code=({text,lang})=>lang==='mermaid'?`<pre class="mermaid" data-mermaid="true">${esc(text)}</pre>`:`<pre><code class="language-${esc(lang||'text')}">${esc(text)}</code></pre>`;
 let result=marked.parse(md,{gfm:true,renderer});
 result=result.replace(/<span data-bupt-math="(\d+)"><\/span>/g,(_,i)=>replacements[+i]);
 return result;
}
function sections(text){
 const lines=text.split('\n');const count=lines.filter(s=>/^## /.test(s)).length;const splitLevel=count<4?3:2;
 const result=[];let current={title:'课程导读',body:[],startLine:1};let fence=null;
 for(const [lineIndex,line] of lines.entries()){
  const f=line.match(/^\s*(`{3,}|~{3,})/);if(f){if(!fence)fence=f[1][0];else if(f[1][0]===fence)fence=null;}
  const heading=!fence&&line.match(/^(#{1,6}) (.+)/);
  if(heading&&heading[1].length===1)continue;
  if(heading&&heading[1].length<=splitLevel){current.endLine=lineIndex;if(current.body.join('\n').trim())result.push(current);current={title:heading[2],body:[],startLine:lineIndex+1};}
  else current.body.push(heading?`${heading[1]} <span id="source-line-${lineIndex+1}"></span>${heading[2]}`:line);
 }
 current.endLine=lines.length;if(current.body.join('\n').trim())result.push(current);
 return result;
}
let questions=[];questions=JSON.parse(await fs.readFile(path.join(root,'content/questions.json'),'utf8'));
const questionIds=new Set();
const index=[];
for(const [name,short,category,description] of metadata){
 const file=(await fs.readdir(path.join(source,name))).find(x=>x.endsWith('.md'));
 const raw=await fs.readFile(path.join(source,name,file),'utf8');
 const id=name==='毛概'?'mao-gai':name.toLowerCase().replaceAll(' ','-');
 const chunks=sections(raw);const chapters=[];
 for(const [i,section] of chunks.entries())chapters.push({id:`section-${i+1}`,title:section.title,displayTitle:chapterLabels[id]?.[`section-${i+1}`]||section.title,html:await html(section.body.join('\n'),name),minutes:Math.max(1,Math.round(section.body.join('\n').length/900))});
 const quiz=[];
 for(const [i,q] of questions.filter(q=>q.course===name).entries()){
  const match=q.sourceLine?chunks.findIndex(s=>q.sourceLine>=s.startLine&&q.sourceLine<=s.endLine):chunks.findIndex(s=>s.title===q.sourceHeading||s.body.some(l=>l.replace(/^#+\s*/,'').replace(/<span[^>]*><\/span>/g,'').trim()===q.sourceHeading));
  if(match<0)throw Error(`Question source missing: ${name} / ${q.sourceHeading}`);
  const questionId=q.id||`${id}-${crypto.createHash('sha256').update(q.prompt).digest('hex').slice(0,16)}`;
  if(questionIds.has(questionId))throw Error(`Duplicate question ID: ${questionId}`);questionIds.add(questionId);
  if(!q.prompt?.trim()||!q.answer?.trim())throw Error(`Empty question: ${questionId}`);
  const sourceLines=raw.split('\n');
  if(q.sourceLine&&(!Number.isInteger(q.sourceLine)||q.sourceLine<1||q.sourceEnd<q.sourceLine||q.sourceEnd>sourceLines.length))throw Error(`Invalid source range: ${questionId}`);
  const sourceHeadingLine=q.sourceLine?sourceLines.slice(0,q.sourceLine).findLastIndex(l=>/^#{2,6} /.test(l))+1:0;
  if(sourceHeadingLine&&sourceLines[sourceHeadingLine-1].replace(/^#+\s*/,'')!==q.sourceHeading)throw Error(`Outdated source heading: ${questionId}`);
  const sourceAnchor=sourceHeadingLine>chunks[match].startLine?`source-line-${sourceHeadingLine}`:null;
  quiz.push({...q,id:questionId,sourceAnchor,promptHtml:await html(q.prompt,name,true),answerHtml:await html(q.answer,name,true),sectionId:chapters[match].id});
 }
 const course={id,name:name==='毛概'?'Mao Zedong Thought and Socialism with Chinese Characteristics':name,short:name==='毛概'?'MT':short,category,description,sourceFile:`${name}/${file}`,chapters,questions:quiz};
 await fs.writeFile(path.join(out,'data',id+'.json'),JSON.stringify(course));
 index.push({...course,chapters:chapters.length,questions:quiz.length});
}
await fs.writeFile(path.join(out,'data/index.json'),JSON.stringify(index));
for(const f of ['index.html','app.js','forum.js','styles.css','font.css'])await fs.copyFile(path.join(root,'src',f),path.join(out,f));
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

await fs.mkdir(path.join(root,'dist/server'),{recursive:true});
for(const f of ['index.js','db.js'])await fs.copyFile(path.join(root,'server',f),path.join(root,'dist/server',f));
await fs.writeFile(path.join(root,'dist/server/courses.js'),'export const courseIds = '+JSON.stringify(index.map(c=>c.id))+';\n');

const localConfig=JSON.parse(await fs.readFile(path.join(root,'wrangler.json'),'utf8'));localConfig.main='index.js';localConfig.assets.directory='../client';localConfig.d1_databases[0].migrations_dir='../../drizzle';await fs.writeFile(path.join(root,'dist/server/wrangler.json'),JSON.stringify(localConfig,null,2));
