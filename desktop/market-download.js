export function createMarketDownload({host,call,subscribe}){
 const panel=document.createElement('div');panel.className='market-download-progress';panel.hidden=true;panel.setAttribute('role','status');panel.setAttribute('aria-live','polite');
 const label=document.createElement('p'),bar=document.createElement('progress');bar.max=100;bar.setAttribute('aria-label','资源包下载进度');panel.append(label,bar);host.after(panel);
 let active=null;
 const size=bytes=>(Math.max(0,Number(bytes)||0)/1048576).toFixed(1)+' MiB';
 function render(value){
  bar.removeAttribute('value');
  const route=value.route||'GitHub 直连';
  if(value.phase==='connecting')label.textContent='正在连接 '+route+'…';
  else if(value.phase==='downloading'){
   if(value.total>0){const percent=Math.min(100,Math.floor(value.transferred/value.total*100));bar.value=percent;label.textContent='正在下载资源包 ['+route+'] '+percent+'%（'+size(value.transferred)+' / '+size(value.total)+'）';}
   else label.textContent='正在下载资源包 ['+route+']，已下载 '+size(value.transferred)+'（总大小未知）';
  }else if(value.phase==='verifying')label.textContent='下载完成，正在校验并安装资源包…';
  else if(value.phase==='complete'){bar.value=100;label.textContent='资源包安装完成';}
  else if(value.phase==='error')label.textContent='资源包安装失败';
 }
 subscribe(value=>{if(value.requestId===active)render(value);});
 return async body=>{
  if(active)throw Error('已有资源包正在安装，请等待完成。');
  active=crypto.randomUUID();panel.hidden=false;render({phase:'connecting'});
  try{return await call({...body,requestId:active});}finally{active=null;panel.hidden=true;}
 };
}
