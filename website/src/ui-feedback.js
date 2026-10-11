const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

export const spinner='<span class="loading-spinner" aria-hidden="true"></span>';
export const loadingMarkup=message=>`<div class="loading-state" role="status">${spinner}<span>${escape(message)}</span></div>`;

// Each navigation owns its indicator; a late response cannot dismiss a newer one.
export function createPageLoading(app,indicator){
 let generation=0;
 function reset(){generation++;indicator.hidden=true;app.removeAttribute('aria-busy');}
 function start(message){
  const current=++generation;
  indicator.querySelector('[data-loading-label]').textContent=message;
  indicator.hidden=false;app.setAttribute('aria-busy','true');
  return ()=>{if(current===generation)reset();};
 }
 return {start,reset};
}

export async function fetchJSON(url,options={},timeoutMs=20000){
 const controller=new AbortController();
 const abort=()=>controller.abort();
 let timedOut=false;
 if(options.signal?.aborted)abort();
 else options.signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 try{
  const response=await fetch(url,{...options,signal:controller.signal});
  const data=await response.json();
  if(!response.ok){const error=Error(data.error||'The request could not be completed. Please try again.');error.status=response.status;throw error;}
  return data;
 }catch(error){
  if(timedOut)throw Error('The request timed out. Check your connection and try again.');
  throw error;
 }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
