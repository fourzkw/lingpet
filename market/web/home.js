const root=document.getElementById('downloadCards'),status=document.getElementById('downloadStatus');
const hosts=[{id:'dsh',name:'DSH',kind:'.tgz 插件包',description:'在 DSH 中启用桌宠，让伙伴跟随会话状态。'},{id:'cursor',name:'Cursor',kind:'.vsix 编辑器扩展',description:'从侧边栏管理灵伴，跟随 Cursor Agent 工作。'},{id:'codex',name:'Codex',kind:'.zip 本地插件市场',description:'通过本地插件接入，管理桌宠与会话跟随。'}];
function element(tag,content){const e=document.createElement(tag);e.textContent=content;return e;}
function render(downloads){
 root.replaceChildren();root.setAttribute('aria-busy','false');
 for(const host of hosts){
  const d=downloads.find(d=>d.id===host.id),card=document.createElement('article');card.className='download-card';const icon=element('span',{dsh:'D',cursor:'↗',codex:'>_'}[host.id]);icon.className='download-host-icon';icon.setAttribute('aria-hidden','true');card.append(icon);
  const top=element('p',host.kind);top.className='download-kind';card.append(top,element('h3',host.name),element('p',host.description));
  const meta=element('p',d?.available?'v'+d.version+' · '+(d.size/1048576).toFixed(1)+' MB · Windows':'安装包待发布');meta.className='download-meta';card.append(meta);
  if(d?.available&&d.url==='/downloads/'+host.id){const a=element('a','下载 '+host.name+' 版本 ↓');a.className='button primary';a.href=d.url;a.id='download-'+host.id;card.append(a);const hash=document.createElement('details');hash.append(element('summary','SHA-256 校验值'),element('code',d.sha256));card.append(hash);}
  else{const b=element('button','待发布');b.disabled=true;card.append(b);}
  const help=element('a','查看安装指引');help.className='install-link';help.href='#install';card.append(help);root.append(card);
 }
}
try{const response=await fetch('/api/downloads');if(!response.ok)throw Error('下载信息暂不可用');const result=await response.json();if(!Array.isArray(result.downloads))throw Error('下载信息格式错误');render(result.downloads);status.textContent=result.downloads.some(d=>d.available)?'请选择对应版本下载。':'安装包正在准备中，可先浏览桌宠市场。';}
catch(error){render([]);status.textContent=error.message+'，请稍后刷新。';}
