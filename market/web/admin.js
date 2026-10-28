import {$,api,notice,text,btn,initPreview,repositoryLinks} from './common.js';
const detail=initPreview(),statuses={queued:'排队校验',validating:'正在校验',pending:'等待审核',approved:'已上架',rejected:'已驳回',unpublished:'已下架',failed:'校验失败'};
let account={},recordCache=[],releaseCache=[],activePanel="overview",loading=null,uploadXHR=null;
async function session(){
 account=await api('/api/me');const root=$('account');root.replaceChildren();$('loginPanel').hidden=!!account.admin;$('admin').hidden=!account.admin||account.mustChangePassword;
 if(account.admin){root.append(text('span',account.user+' '));if(!account.mustChangePassword){const rename=btn('修改用户名',showUsername);rename.id='changeUsername';root.append(rename);}root.append(btn('修改密码',showPassword),btn('退出管理',logout));if(account.mustChangePassword)showPassword();else await load(true).catch(e=>notice(e.message));}
 else{$('adminRecords').replaceChildren();}
}
const hostLabels={dsh:'DSH',cursor:'Cursor',codex:'Codex'};
function size(value){if(!value)return '0 B';const units=['B','KiB','MiB','GiB','TiB'];const n=Math.min(Math.floor(Math.log(value)/Math.log(1024)),units.length-1);return (value/1024**n).toFixed(n?1:0)+' '+units[n];}
function count(value){return Number(value?.count??value?.Count??0);}
function switchPanel(name){activePanel=name;for(const panel of ['overview','review','releases','audit'])$('admin-'+panel).hidden=panel!==name;for(const b of document.querySelectorAll('[data-admin-panel]'))b.classList.toggle('active',b.dataset.adminPanel===name);}
async function load(force=false){
 if(!account.admin||account.mustChangePassword)return;
 if(loading){await loading;if(!force)return;}
 loading=(async()=>{
  releaseCache=await api('/api/admin/releases');
  const [records,stats,audit]=await Promise.all([api('/api/admin/versions'),api('/api/admin/stats?days='+$('statsPeriod').value),api('/api/admin/audit')]);
  if(!account.admin)return;recordCache=records;renderRecords();renderReleases();renderStats(stats);renderAudit(audit);
 })();try{await loading;}finally{loading=null;}
}
function renderStats(stats){
 const totals=stats.totals||{},daily=stats.daily||[],visits=count(totals['visit.home'])+count(totals['visit.market']),downloads=['dsh','cursor','codex'].reduce((n,h)=>n+count(totals['download.'+h]),0),today=daily.at(-1)||{};
 $('serverInfo').textContent='服务 v'+stats.version+' · 已发布安装包 '+stats.published+'/3 · 统计日期 UTC+8';
 $('statsCards').replaceChildren();
 for(const [label,value]of [['累计访问次数',visits],['累计下载请求',downloads],['今日访问次数',(today.home||0)+(today.market||0)],['待处理投稿',(stats.submissions.pending||0)+(stats.submissions.queued||0)+(stats.submissions.validating||0)]]){
  const card=document.createElement('article');card.className='stat-card';card.append(text('p',label),text('strong',Number(value).toLocaleString()));$('statsCards').append(card);
 }
 $('statsSummary').textContent='投稿共 '+stats.submissionTotal+' 条 · 已上架 '+(stats.submissions.approved||0)+' 个桌宠版本 · 安装包 '+stats.releaseTotal+' 个版本 · 可用版本文件合计 '+size(stats.packageBytes);
 $('statsRows').replaceChildren();for(const row of [...daily].reverse()){const tr=document.createElement('tr');for(const v of [row.date,row.home,row.market,row.downloads,size(row.bytes)])tr.append(text('td',v));$('statsRows').append(tr);}
 $('hostStats').replaceChildren();for(const host of ['dsh','cursor','codex']){const card=document.createElement('div');card.append(text('strong',hostLabels[host]),text('p',count(totals['download.'+host]).toLocaleString()+' 次下载请求'));$('hostStats').append(card);}
 $('exportStats').href='/api/admin/stats.csv?days='+$('statsPeriod').value;
}
function renderRecords(){
 const root=$('adminRecords'),filter=$('reviewStatus').value,q=$('reviewQuery').value.trim().toLowerCase();root.replaceChildren();
 const rows=recordCache.filter(r=>(!filter||r.status===filter)&&(!q||(r.repository+' '+r.tag+' '+(r.pet?.name||'')).toLowerCase().includes(q)));
 for(const r of rows){const row=document.createElement('article');row.className='record';const info=document.createElement('div'),actions=document.createElement('div');actions.className='actions';
 info.append(text('strong',(r.pet?.name||r.assetName)+' · '+statuses[r.status]),text('p',r.repository+' / '+r.tag+' · '+r.submitter),text('p',r.error||r.reviews?.at(-1)?.reason||''));
 info.append(repositoryLinks(r));
 if(r.pet)actions.append(btn(r.preview?'预览八动作':'查看介绍与封面',()=>detail(r)));
 if(r.status==='failed')actions.append(btn('重试读取资料',()=>review(r,'retry','')));
 if(r.status==='pending')actions.append(btn('通过',()=>review(r,'approve','')),btn('驳回',()=>reason(r,'reject')));
 if(r.status==='approved')actions.append(btn('下架',()=>reason(r,'unpublish')));
 row.append(info,actions);root.append(row);}
 if(!rows.length)root.append(text('p','没有匹配的投稿记录。'));
}
function renderReleases(){
 const root=$('releaseRecords'),host=$('releaseHostFilter').value;root.replaceChildren();const rows=releaseCache.filter(r=>!host||r.id===host);
 for(const r of rows){
  const row=document.createElement('article');row.className='release-record';
  const heading=document.createElement('div');heading.className='release-heading';const title=text('strong',hostLabels[r.id]+' · v'+r.version),badge=text('span',r.published?'当前发布':r.available?'待发布 / 历史版本':'文件不可用');badge.className='release-badge'+(r.published?' published':'');heading.append(title,badge);
  const info=text('p',size(r.size)+' · '+new Date(r.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+' · '+r.actor+(r.managed?'':' · 从原下载清单导入'));
  const actions=document.createElement('div');actions.className='actions';
  if(r.published)actions.append(btn('下架',()=>releaseAction(r,'unpublish')));else{if(r.available)actions.append(btn('设为当前发布版本',()=>releaseAction(r,'publish')));actions.append(btn('删除此版本',()=>releaseAction(r,'delete')));}
  const meta=document.createElement('details');meta.append(text('summary','文件信息和校验值'),text('p',r.file),text('code',r.sha256));
  row.append(heading,info);if(r.notes)row.append(text('p',r.notes));row.append(meta,actions);root.append(row);
 }
 if(!rows.length)root.append(text('p','还没有安装包版本。上传后可在这里发布到首页。'));
}
const actionNames={'package.upload':'上传安装包','package.publish':'发布安装包','package.unpublish':'下架安装包','package.delete':'删除安装包','package.import':'导入原安装包','pet.approve':'通过桌宠审核','pet.reject':'驳回桌宠','pet.unpublish':'下架桌宠','account.password':'修改密码','account.username':'修改用户名'};
function renderAudit(rows){$('auditRows').replaceChildren();for(const a of rows){const tr=document.createElement('tr');for(const v of [new Date(a.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}),a.actor,actionNames[a.action]||a.action,a.detail||a.target])tr.append(text('td',v));$('auditRows').append(tr);}if(!rows.length){const tr=document.createElement('tr'),td=text('td','暂无操作记录');td.colSpan=4;tr.append(td);$('auditRows').append(tr);}}
function confirmAction(title,message){return new Promise(resolve=>{const dialog=$('confirmAdmin');$('confirmTitle').textContent=title;$('confirmMessage').textContent=message;let done=false;const finish=value=>{if(done)return;done=true;dialog.close();dialog.removeEventListener('cancel',cancel);resolve(value);};const cancel=e=>{e.preventDefault();finish(false);};$('cancelAdminAction').onclick=()=>finish(false);$('confirmAdminAction').onclick=()=>finish(true);dialog.addEventListener('cancel',cancel);dialog.showModal();});}
async function releaseAction(r,action){
 const messages={publish:'将 '+hostLabels[r.id]+' v'+r.version+' 设为下载首页当前版本？原版本会保留，可随时切回。',unpublish:'下架后，下载首页将停止提供此客户端安装包，直到发布其他版本。',delete:r.managed?'删除此历史版本及其安装包文件？该操作无法撤销。':'移除此导入的历史版本记录？服务器原文件会保留。'};
 if(!await confirmAction({publish:'发布安装包',unpublish:'下架安装包',delete:'删除历史版本'}[action],messages[action]))return;
 await api('/api/admin/releases/'+r.releaseId+'/'+action,{});notice('安装包操作已完成');await load(true);
}
for(const b of document.querySelectorAll('[data-admin-panel]'))b.onclick=()=>switchPanel(b.dataset.adminPanel);
$('statsPeriod').onchange=()=>load().catch(e=>notice(e.message));$('reviewStatus').onchange=renderRecords;$('reviewQuery').oninput=renderRecords;$('releaseHostFilter').onchange=renderReleases;
function fileAccept(){$('installerFile').accept={dsh:'.tgz',cursor:'.vsix',codex:'.zip'}[$('uploadHost').value];}
$('uploadHost').onchange=()=>{$('installerFile').value='';fileAccept();};
$('cancelUpload').onclick=()=>uploadXHR?.abort();
$('packageUploadForm').onsubmit=async e=>{
 e.preventDefault();if(uploadXHR)return;
 const form=e.target,file=$('installerFile').files[0];if(!file||file.size>1073741824){$('uploadStatus').textContent='请选择不超过1GiB的安装包。';return;}
 const body=new FormData(form);for(const input of form.elements)input.disabled=true;$('cancelUpload').hidden=false;$('cancelUpload').disabled=false;$('uploadProgress').hidden=false;$('uploadProgress').value=0;$('uploadStatus').textContent='正在上传…';
 try{
  await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();uploadXHR=xhr;xhr.open('POST','/api/admin/releases/upload');xhr.timeout=930000;
   xhr.upload.onprogress=event=>{if(event.lengthComputable){const value=Math.round(event.loaded/event.total*100);$('uploadProgress').value=value;$('uploadStatus').textContent='正在上传 '+value+'%';}};
   xhr.upload.onload=()=>{$('uploadStatus').textContent='上传完成，正在校验和保存，请稍候…';};
   xhr.onload=()=>{let value;try{value=JSON.parse(xhr.responseText);}catch{reject(Error('上传失败（HTTP '+xhr.status+'），请检查服务器上传限制。'));return;}if(xhr.status>=200&&xhr.status<300)resolve(value);else reject(Error(value.error||'上传失败'));};
   xhr.onerror=()=>reject(Error('网络连接中断，请重新上传。'));xhr.onabort=()=>reject(Error('已取消上传'));xhr.ontimeout=()=>reject(Error('上传超时，请检查连接后重试。'));xhr.send(body);
  });
  form.reset();fileAccept();$('uploadStatus').textContent='已保存为待发布版本。请在下方确认版本后点击「设为当前发布版本」。';await load(true);
 }catch(error){$('uploadStatus').textContent=error.message;}
 finally{uploadXHR=null;for(const input of form.elements)input.disabled=false;$('cancelUpload').hidden=true;$('uploadProgress').hidden=true;}
};

async function review(r,action,reason){await api('/api/admin/versions/'+r.id+'/'+action,{reason});notice('审核记录已保存');await load(true);}
async function reason(r,a){const v=window.prompt('请填写'+(a==='reject'?'驳回':'下架')+'原因');if(v?.trim())await review(r,a,v.trim());}
$('refreshAdmin').onclick=()=>load().catch(e=>notice(e.message));
$('adminLoginForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;try{await api('/auth/admin',Object.fromEntries(new FormData(e.target)));e.target.reset();$('loginError').textContent='';notice('');await session();}catch(error){$('loginError').textContent=error.message;}finally{b.disabled=false;}};
function showPassword(){$('passwordIntro').textContent=account.mustChangePassword?'首次登录，请先修改初始密码，再进入审核后台。':'修改后其他已登录会话会失效，当前会话继续使用。';$('closePassword').hidden=!!account.mustChangePassword;$('passwordError').textContent='';if(!$('passwordDialog').open){$('passwordForm').reset();$('passwordDialog').showModal();}}
async function logout(){uploadXHR?.abort();await api('/auth/logout',{});$('passwordDialog').close();$('passwordForm').reset();$('usernameDialog').close();$('usernameForm').reset();notice('');await session();}
$('closePassword').onclick=()=>$('passwordDialog').close();$('passwordLogout').onclick=()=>logout().catch(e=>notice(e.message));
$('passwordDialog').addEventListener('cancel',e=>{if(account.mustChangePassword)e.preventDefault();});
$('passwordForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;try{await api('/auth/password',Object.fromEntries(new FormData(e.target)));e.target.reset();$('passwordDialog').close();await session();notice('密码已修改，将在后续版本更新中保留。');}catch(error){$('passwordError').textContent=error.message;}finally{b.disabled=false;}};
function showUsername(){if(account.mustChangePassword){showPassword();return;}$('usernameForm').reset();$('currentUsername').textContent=account.user;$('usernameForm').elements.newUsername.value=account.user;$('usernameError').textContent='';$('usernameDialog').showModal();}
$('closeUsername').onclick=()=>{$('usernameDialog').close();$('usernameForm').reset();};
$('usernameForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;try{await api('/auth/username',Object.fromEntries(new FormData(e.target)));e.target.reset();$('usernameDialog').close();await session();notice('用户名已修改，后续登录请使用新用户名，密码保持不变。');}catch(error){$('usernameError').textContent=error.message;}finally{b.disabled=false;}};
await session();
setInterval(()=>load().catch(e=>notice(e.message)),10000);

