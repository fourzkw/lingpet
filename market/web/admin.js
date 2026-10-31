import {$,api,notice,text,btn,initPreview,repositoryLinks} from './common.js';
const detail=initPreview(),statuses={queued:'排队校验',validating:'正在校验',pending:'等待自动校验',approved:'已上架',rejected:'已驳回',unpublished:'已下架',failed:'校验失败',refreshed:'资料刷新完成'};
let account={},recordCache=[],announcementCache=[],editingAnnouncement=null,activePanel="overview",loading=null;
async function session(){
 account=await api('/api/me');const root=$('account');root.replaceChildren();$('loginPanel').hidden=!!account.admin;$('admin').hidden=!account.admin||account.mustChangePassword;
 if(account.admin){root.append(text('span',account.user+' '));if(!account.mustChangePassword){const rename=btn('修改用户名',showUsername);rename.id='changeUsername';root.append(rename);}root.append(btn('修改密码',showPassword),btn('退出管理',logout));if(account.mustChangePassword)showPassword();else await load(true).catch(e=>notice(e.message));}
 else{$('adminRecords').replaceChildren();}
}
function size(value){if(!value)return '0 B';const units=['B','KiB','MiB','GiB','TiB'];const n=Math.min(Math.floor(Math.log(value)/Math.log(1024)),units.length-1);return (value/1024**n).toFixed(n?1:0)+' '+units[n];}
function count(value){return Number(value?.count??value?.Count??0);}
function switchPanel(name){activePanel=name;for(const panel of ['overview','queue','review','announcements','releases','audit'])$('admin-'+panel).hidden=panel!==name;for(const b of document.querySelectorAll('[data-admin-panel]'))b.classList.toggle('active',b.dataset.adminPanel===name);}
async function load(force=false){
 if(!account.admin||account.mustChangePassword)return;
 if(loading){await loading;if(!force)return;}
 loading=(async()=>{
  const [records,stats,audit,queue,announcements]=await Promise.all([api('/api/admin/versions'),api('/api/admin/stats?days='+$('statsPeriod').value),api('/api/admin/audit'),api('/api/admin/queue'),api('/api/admin/announcements')]);
  if(!account.admin)return;recordCache=records;announcementCache=announcements;renderRecords();renderStats(stats);renderAudit(audit);renderQueue(queue);renderAnnouncements();
 })();try{await loading;}finally{loading=null;}
}
function renderStats(stats){
 const totals=stats.totals||{},daily=stats.daily||[],visits=count(totals['visit.home'])+count(totals['visit.market']),downloads=count(totals['download.desktop']),today=daily.at(-1)||{};
 $('serverInfo').textContent='服务 v'+stats.version+' · 客户端通过 GitHub Release 下载 · UTC+8';
 $('statsCards').replaceChildren();
 for(const [label,value]of [['累计访问次数',visits],['桌面版下载入口点击',downloads],['今日访问次数',(today.home||0)+(today.market||0)],['待处理投稿',(stats.submissions.pending||0)+(stats.submissions.queued||0)+(stats.submissions.validating||0)]]){
  const card=document.createElement('article');card.className='stat-card';card.append(text('p',label),text('strong',Number(value).toLocaleString()));$('statsCards').append(card);
 }
 $('statsSummary').textContent='投稿共 '+stats.submissionTotal+' 条 · 已上架 '+(stats.submissions.approved||0)+' 个桌宠版本';
 $('statsRows').replaceChildren();for(const row of [...daily].reverse()){const tr=document.createElement('tr');for(const v of [row.date,row.home,row.market,row.downloads,size(row.bytes)])tr.append(text('td',v));$('statsRows').append(tr);}
 $('hostStats').textContent='下载来源：fourzkw/lingpet · GitHub Release';
 $('exportStats').href='/api/admin/stats.csv?days='+$('statsPeriod').value;
}
function renderRecords(){
 const root=$('adminRecords'),filter=$('reviewStatus').value,q=$('reviewQuery').value.trim().toLowerCase();root.replaceChildren();
 const rows=recordCache.filter(r=>(!filter||r.status===filter)&&(!q||(r.repository+' '+r.tag+' '+(r.pet?.name||'')).toLowerCase().includes(q)));
 for(const r of rows){const row=document.createElement('article');row.className='record';const info=document.createElement('div'),actions=document.createElement('div');actions.className='actions';
 info.append(text('strong',(r.refreshOf?'资料刷新 · ':'')+(r.pet?.name||r.assetName)+' · '+statuses[r.status]),text('p',r.repository+' / '+r.tag+' · '+r.submitter),text('p',r.error||r.reviews?.at(-1)?.reason||''));
 info.append(repositoryLinks(r));
 if(r.pet)actions.append(btn(r.preview?'预览八动作':'查看介绍与封面',()=>detail(r)));
 if(r.status==='failed')actions.append(btn('重试读取资料',()=>review(r,'retry','')));
 if(r.status==='approved')actions.append(btn('下架',()=>reason(r,'unpublish')));
 row.append(info,actions);root.append(row);}
 if(!rows.length)root.append(text('p','没有匹配的投稿记录。'));
}
function renderQueue(queue){
 const date=value=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'尚未检查';
 const validations=queue.validations||[],checks=queue.checks||[];
 $('queueSummary').textContent='正在校验 '+validations.filter(r=>r.status==='validating').length+' 项 · 排队 '+validations.filter(r=>r.status!=='validating').length+' 项 · 正在检查 '+checks.filter(r=>r.status==='running').length+' 项 · 到期检查 '+checks.filter(r=>r.status==='due').length+' 项';
 $('queuePolicy').textContent='单任务串行处理，每项结束后间隔 '+queue.cooldownSeconds+' 秒。校验按提交先后执行，空闲时执行来源检查。'+(queue.intervalSeconds>0?'检查周期 '+(queue.intervalSeconds/3600)+' 小时；到期时间会因排队延后。':'定时检查已关闭。')+' 每 10 秒刷新，时间为 UTC+8。';
 $('queueUpdated').textContent='最后刷新：'+date(queue.updatedAt);
 const fill=(id,rows,values,columns,empty)=>{const root=$(id);root.replaceChildren();for(const r of rows){const tr=document.createElement('tr');for(const value of values(r))tr.append(text('td',value));root.append(tr);}if(!rows.length){const tr=document.createElement('tr'),td=text('td',empty);td.colSpan=columns;tr.append(td);root.append(tr);}};
 fill('validationQueueRows',[...validations].sort((a,b)=>Number(b.status==='validating')-Number(a.status==='validating')),r=>[r.status==='validating'?'执行中':'第 '+r.position+' 位',r.name+(r.version?' · '+r.version:''),r.repository,r.origin,statuses[r.status]||r.status,date(r.createdAt)],6,'暂无排队或正在校验的作品。');
 const labels={running:'正在检查',due:'等待执行',scheduled:'等待到期',disabled:'已关闭'};
 fill('sourceQueueRows',checks,r=>[r.status==='running'?'执行中':r.position?'第 '+r.position+' 位':'—',r.kind==='discovery'?'发现新版本':'来源有效性',r.name+(r.version?' · '+r.version:''),r.repository,labels[r.status]||r.status,date(r.lastCheck),r.status==='disabled'?'已关闭':r.nextCheck?date(r.nextCheck):'首次检查待执行',r.kind==='source'?r.missing+' / 3':'—',r.error||'—'],9,'暂无需要跟踪的已上架作品。');
}
const actionNames={'package.upload':'上传安装包','package.publish':'发布安装包','package.unpublish':'下架安装包','package.delete':'删除安装包','package.import':'导入原安装包','pet.approve':'历史审核通过','pet.auto-publish':'自动校验上架','pet.reject':'驳回桌宠','pet.unpublish':'下架桌宠','account.password':'修改密码','account.username':'修改用户名','announcement.create':'创建公告','announcement.update':'更新公告','announcement.publish':'发布公告','announcement.unpublish':'下架公告','announcement.delete':'删除公告'};
const announcementLevels={info:'普通',important:'重要',critical:'紧急'};
function renderAudit(rows){$('auditRows').replaceChildren();for(const a of rows){const tr=document.createElement('tr');for(const v of [new Date(a.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}),a.actor,actionNames[a.action]||a.action,a.detail||a.target])tr.append(text('td',v));$('auditRows').append(tr);}if(!rows.length){const tr=document.createElement('tr'),td=text('td','暂无操作记录');td.colSpan=4;tr.append(td);$('auditRows').append(tr);}}
function announcementFormat(value){if(!value)return '';const date=new Date(value);if(Number.isNaN(date.getTime()))return '';return date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});}
function announcementRange(a){return [a.minAppVersion&&('≥ '+a.minAppVersion),a.maxAppVersion&&('≤ '+a.maxAppVersion)].filter(Boolean).join(' · ')||'全部版本';}
function announcementWindow(a){return [a.startsAt&&('起 '+announcementFormat(a.startsAt)),a.endsAt&&('止 '+announcementFormat(a.endsAt))].filter(Boolean).join(' · ')||'长期有效';}
function announcementHost(a){try{return a.link?new URL(a.link).host.replace(/^www\./,''):'';}catch{return a.link||'';}}
function announcementChip(label,value,tone){
 const chip=document.createElement('span');chip.className='announcement-summary-chip';if(tone)chip.dataset.tone=tone;
 const count=document.createElement('strong');count.textContent=String(value);const name=document.createElement('span');name.textContent=label;
 chip.append(name,count);return chip;
}
function renderAnnouncements(){
 const root=$('announcementList');root.replaceChildren();
 const summary=$('announcementSummary');
 if(summary){
  if(!announcementCache.length)summary.replaceChildren();
  else{
   const published=announcementCache.filter(a=>a.published).length,forced=announcementCache.filter(a=>a.published&&a.forceShow).length;
   summary.replaceChildren(announcementChip('已发布',published),announcementChip('草稿',announcementCache.length-published),announcementChip('强弹',forced,'force'));
  }
 }
 for(const a of announcementCache){
  const card=document.createElement('article');card.className='announcement-card';card.dataset.level=a.level;card.dataset.state=a.published?'published':'draft';
  const head=document.createElement('div');head.className='announcement-card-head';
  const level=document.createElement('span');level.className='announcement-level-chip';level.dataset.level=a.level;level.textContent=announcementLevels[a.level]||a.level;
  const state=document.createElement('span');state.className='announcement-state-chip';state.textContent=a.published?'已发布':'草稿';
  head.append(level,state);
  if(a.forceShow){const force=document.createElement('span');force.className='announcement-force-chip';force.textContent='强弹';head.append(force);}
  const title=document.createElement('h3');title.className='announcement-card-title';title.textContent=a.title;
  const body=text('p',a.body.replace(/\n{2,}/g,'\n'));body.className='announcement-card-body';
  const meta=document.createElement('dl');meta.className='announcement-card-meta';
  const metaRow=(label,value)=>{const group=document.createElement('div');group.append(text('dt',label),text('dd',value));return group;};
  meta.append(metaRow('版本',announcementRange(a)),metaRow('展示',announcementWindow(a)));
  if(a.link)meta.append(metaRow('外链',(a.linkLabel||'了解详情')+' · '+announcementHost(a)));
  const foot=document.createElement('div');foot.className='announcement-card-foot';
  const stamp=text('span','更新于 '+announcementFormat(a.updatedAt)+(a.actor?' · '+a.actor:''));stamp.className='announcement-card-stamp';
  const actions=document.createElement('div');actions.className='actions';
  actions.append(btn('编辑',()=>openAnnouncement(a)));
  if(a.published)actions.append(btn('下架',async()=>{if(await confirmAction('下架公告','下架后客户端将不再展示该公告。')){await api('/api/admin/announcements/'+a.id+'/unpublish',{});notice('公告已下架');await load(true);}}));
  else actions.append(btn('发布',async()=>{await api('/api/admin/announcements/'+a.id+'/publish',{});notice('公告已发布');await load(true);}));
  const remove=btn('删除',async()=>{if(await confirmAction('删除公告','删除后不可恢复。')){await api('/api/admin/announcements/'+a.id+'/delete',{});notice('公告已删除');await load(true);}});remove.className='danger';actions.append(remove);
  foot.append(stamp,actions);
  card.append(head,title,body,meta,foot);root.append(card);
 }
 if(!announcementCache.length){
  const empty=document.createElement('div');empty.className='announcement-empty';
  const copy=document.createElement('div');copy.append(text('strong','还没有公告'),text('p','维护、活动或版本说明都可以在这里发布，发布后桌面端启动时自动拉取。'));
  const create=btn('＋ 新建第一条公告',()=>openAnnouncement());create.className='primary';
  empty.append(copy,create);root.append(empty);
 }
}
function openAnnouncement(row=null){
 editingAnnouncement=row;const form=$('announcementForm');form.reset();$('announcementError').textContent='';$('announcementDialogTitle').textContent=row?'编辑公告':'新建公告';
 if(row){form.elements.title.value=row.title;form.elements.body.value=row.body;form.elements.level.value=row.level||'info';form.elements.minAppVersion.value=row.minAppVersion||'';form.elements.maxAppVersion.value=row.maxAppVersion||'';form.elements.startsAt.value=row.startsAt||'';form.elements.endsAt.value=row.endsAt||'';form.elements.link.value=row.link||'';form.elements.linkLabel.value=row.linkLabel||'';form.elements.forceShow.checked=!!row.forceShow;form.elements.published.checked=!!row.published;}
 syncAnnouncementPreview();
 $('announcementDialog').showModal();
}
function syncAnnouncementPreview(){
 const form=$('announcementForm'),preview=$('announcementPreview');
 if(!form||!preview)return;
 const level=form.elements.level.value||'info';
 preview.dataset.level=level;
 $('previewLevel').textContent=announcementLevels[level]||'普通';
 $('previewTitle').textContent=form.elements.title.value.trim()||'公告标题';
 $('previewBody').textContent=form.elements.body.value.replace(/\s+/g,' ').trim()||'正文会显示在这里。';
 const link=form.elements.link.value.trim();
 $('previewLink').textContent=link?(form.elements.linkLabel.value.trim()||'了解详情'):'';
}
function confirmAction(title,message){return new Promise(resolve=>{const dialog=$('confirmAdmin');$('confirmTitle').textContent=title;$('confirmMessage').textContent=message;let done=false;const finish=value=>{if(done)return;done=true;dialog.close();dialog.removeEventListener('cancel',cancel);resolve(value);};const cancel=e=>{e.preventDefault();finish(false);};$('cancelAdminAction').onclick=()=>finish(false);$('confirmAdminAction').onclick=()=>finish(true);dialog.addEventListener('cancel',cancel);dialog.showModal();});}
for(const b of document.querySelectorAll('[data-admin-panel]'))b.onclick=()=>switchPanel(b.dataset.adminPanel);
$('newAnnouncement').onclick=()=>openAnnouncement();
$('announcementForm').addEventListener('input',syncAnnouncementPreview);$('announcementForm').addEventListener('change',syncAnnouncementPreview);
$('closeAnnouncement').onclick=$('cancelAnnouncement').onclick=()=>$('announcementDialog').close();
$('announcementForm').onsubmit=async e=>{
 e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;$('announcementError').textContent='';
 try{
  const data=Object.fromEntries(new FormData(e.target));
  const payload={title:data.title,body:data.body,level:data.level,minAppVersion:data.minAppVersion||'',maxAppVersion:data.maxAppVersion||'',startsAt:data.startsAt||'',endsAt:data.endsAt||'',link:data.link||'',linkLabel:data.linkLabel||'',forceShow:e.target.elements.forceShow.checked,published:e.target.elements.published.checked};
  if(editingAnnouncement)await api('/api/admin/announcements/'+editingAnnouncement.id,payload);else await api('/api/admin/announcements',payload);
  $('announcementDialog').close();notice(editingAnnouncement?'公告已更新':'公告已保存');await load(true);
 }catch(error){$('announcementError').textContent=error.message;}finally{b.disabled=false;}
};
$('statsPeriod').onchange=()=>load().catch(e=>notice(e.message));$('reviewStatus').onchange=renderRecords;$('reviewQuery').oninput=renderRecords;
async function review(r,action,reason){await api('/api/admin/versions/'+r.id+'/'+action,{reason});notice('审核记录已保存');await load(true);}
async function reason(r,a){const v=window.prompt('请填写'+(a==='reject'?'驳回':'下架')+'原因');if(v?.trim())await review(r,a,v.trim());}
$('refreshAdmin').onclick=()=>load().catch(e=>notice(e.message));
$('adminLoginForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;try{await api('/auth/admin',Object.fromEntries(new FormData(e.target)));e.target.reset();$('loginError').textContent='';notice('');await session();}catch(error){$('loginError').textContent=error.message;}finally{b.disabled=false;}};
function showPassword(){$('passwordIntro').textContent=account.mustChangePassword?'首次登录，请先修改初始密码，再进入审核后台。':'修改后其他已登录会话会失效，当前会话继续使用。';$('closePassword').hidden=!!account.mustChangePassword;$('passwordError').textContent='';if(!$('passwordDialog').open){$('passwordForm').reset();$('passwordDialog').showModal();}}
async function logout(){await api('/auth/logout',{});$('passwordDialog').close();$('passwordForm').reset();$('usernameDialog').close();$('usernameForm').reset();notice('');await session();}
$('closePassword').onclick=()=>$('passwordDialog').close();$('passwordLogout').onclick=()=>logout().catch(e=>notice(e.message));
$('passwordDialog').addEventListener('cancel',e=>{if(account.mustChangePassword)e.preventDefault();});
$('passwordForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;try{await api('/auth/password',Object.fromEntries(new FormData(e.target)));e.target.reset();$('passwordDialog').close();await session();notice('密码已修改，将在后续版本更新中保留。');}catch(error){$('passwordError').textContent=error.message;}finally{b.disabled=false;}};
function showUsername(){if(account.mustChangePassword){showPassword();return;}$('usernameForm').reset();$('currentUsername').textContent=account.user;$('usernameForm').elements.newUsername.value=account.user;$('usernameError').textContent='';$('usernameDialog').showModal();}
$('closeUsername').onclick=()=>{$('usernameDialog').close();$('usernameForm').reset();};
$('usernameForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;try{await api('/auth/username',Object.fromEntries(new FormData(e.target)));e.target.reset();$('usernameDialog').close();await session();notice('用户名已修改，后续登录请使用新用户名，密码保持不变。');}catch(error){$('usernameError').textContent=error.message;}finally{b.disabled=false;}};
await session();
setInterval(()=>load().catch(e=>notice(e.message)),10000);

