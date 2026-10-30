import {navigate} from './navigation.js';
import {appearanceInfo} from '../src/characters.js';
import {createMarketDownload} from './market-download.js';
const statusNames={queued:'排队校验',validating:'正在校验',pending:'等待自动校验',approved:'已上架',rejected:'已驳回',unpublished:'已下架',failed:'校验失败'};
export function initMarketUI({snapshot,update,toast}){
 const $=id=>document.getElementById(id),call=body=>window.pet.market(body);let exportPetId=null,busy=false,listing=[],listGeneration=0,previewGeneration=0,selected=null,activeTab='discover',marketUrl='';
 const status=value=>$('marketStatus').textContent=value;
 const download=createMarketDownload({host:$('marketStatus'),call,subscribe:window.pet.onMarketProgress});
 const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node;};
 const button=(label,fn,kind='secondary')=>{const b=text('button',label);b.className='button '+kind;b.onclick=()=>Promise.resolve().then(fn).catch(e=>status(e.message));return b;};
 const browseBar=document.createElement('div');browseBar.className='market-toolbar market-browse-filters';
 const browseControls={};
 for(const [key,label,options]of [
  ['sort','排序',[['updated','最近更新'],['downloads','下载最多'],['stars','仓库 Star 最多'],['name','名称顺序'],['size','包体积从小到大']]],
  ['style','画面',[['','全部画面'],['original','含原图'],['pixel','含像素'],['both','原图与像素都有']]],
  ['interaction','互动',[['','全部互动'],['any','有互动动作'],['click','支持点击'],['pet','支持摸头'],['both','点击与摸头都有']]],
  ['recent','更新',[['','不限时间'],['7','近 7 天'],['30','近 30 天'],['90','近 90 天']]]
 ]){const wrap=text('label',label),select=document.createElement('select');select.id='marketBrowse-'+key;select.setAttribute('aria-label',label);for(const [value,name]of options){const option=text('option',name);option.value=value;select.append(option);}select.onchange=()=>void list();browseControls[key]=select;wrap.append(select);browseBar.append(wrap);}
 function resetBrowse(){ $('marketQuery').value='';for(const [key,select]of Object.entries(browseControls))select.value=key==='sort'?'updated':'';return list(); }
 browseBar.append(button('重置筛选',resetBrowse));$('market-discover').querySelector('.market-search').after(browseBar);
 $('marketQuery').placeholder='搜索名称、作者、角色、ID 或仓库';
 const count=value=>Number.isSafeInteger(value)&&value>=0?value.toLocaleString('zh-CN'):'暂不可用';
 const stats=record=>{const row=document.createElement('p');row.className='market-pet-stats';row.title='下载量为当前版本分享包的 GitHub 下载次数；Star 为作者仓库获星数';row.append(text('span','↓ 下载 '+count(record.stats?.downloads)),text('span','★ Star '+count(record.stats?.stars)));return row;};
 const installedTab=button('已安装',()=>tab('installed'));installedTab.dataset.marketTab='installed';installedTab.setAttribute('role','tab');installedTab.setAttribute('aria-selected','false');document.querySelector('.market-page-tabs').children[0].after(installedTab);
 const installedView=document.createElement('section');installedView.id='market-installed';installedView.hidden=true;const installedToolbar=document.createElement('div');installedToolbar.className='market-toolbar';installedToolbar.append(button('检查作品更新',()=>library(true)),button('刷新本机版本',()=>library(false)));const installedList=document.createElement('div');installedList.id='installedLibrary';installedList.className='market-list';installedView.append(installedToolbar,installedList);$('marketView').append(installedView);
 function showPets(){navigate('pets');}
 function setMarketView(){navigate('market');}
 function updateTarget(){const current=snapshot(),pet=current.pets?.find(p=>p.id===current.activePetId);$('marketExportCurrent').disabled=!pet;$('marketExportHint').textContent=pet?'当前导出对象：'+pet.name:'请先添加或选择一只桌宠。';}
 async function tab(name){activeTab=name;for(const value of ['discover','submit','receipts','installed'])$('market-'+value).hidden=value!==name;for(const b of document.querySelectorAll('[data-market-tab]')){b.setAttribute('aria-selected',String(b.dataset.marketTab===name));b.tabIndex=b.dataset.marketTab===name?0:-1;}updateTarget();if(name==='receipts')await savedReceipts();else if(name==='installed')await library(false);}
 let libraryGeneration=0;
 async function library(checkUpdates){
  const generation=++libraryGeneration;status(checkUpdates?'正在检查同一作者仓库的已上架更新…':'正在读取本机版本…');
  let timeout;
  try{
  const result=await Promise.race([call({action:'library',checkUpdates}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('读取超时，请点击「刷新本机版本」重试')),checkUpdates?20000:15000);})]);if(generation!==libraryGeneration)return;installedList.replaceChildren();
  for(const group of result.groups){
   const card=document.createElement('article');card.className='market-card';
   const art=document.createElement('div');art.className='market-cover';const image=document.createElement('img');image.alt=group.name+' 封面';image.src=group.cover;art.append(image);
   const heading=document.createElement('div');heading.className='market-card-title';const version=text('small',group.origin==='builtin'?'默认内置':group.origin==='retained'?'升级保留':group.origin==='local'?'本地形象':'v'+group.versions[0].version);version.className='market-version';heading.append(text('strong',group.name),version);
   const description=text('p',group.description||'这位伙伴还没有介绍。');description.className='market-card-description';card.append(art,heading,description,text('p',group.author||'本地导入'));
   const select=document.createElement('select');select.setAttribute('aria-label',group.name+' 已安装版本');
   for(const version of group.versions){const option=text('option',(group.origin==='package'?'v'+version.version:version.name)+' · '+(version.interactions.length===2?'含点击与摸头':'互动 '+version.interactions.length+'/2'));option.value=version.id;select.append(option);}if(group.versions.some(v=>v.id===result.activeAppearance))select.value=result.activeAppearance;
   card.append(text('small','所属角色：'+group.characterName));
   const usage=snapshot().pets.filter(p=>group.versions.some(v=>v.id===p.appearance&&v.character===p.character));card.append(text('p',usage.length?'正在使用：'+usage.map(p=>p.name).join('、'):'已保存在形象库，可离线切换'));if(group.versions.length>1)card.append(select);
   const actions=document.createElement('div');actions.className='dialog-actions';const apply=button(group.versions.length>1?'切换／回退到所选版本':'应用此形象',async()=>{const petId=snapshot().activePetId;if(!petId)throw new Error('请先添加一只桌宠');const value=await call({action:'use-version',petId,appearanceId:select.value,character:group.versions.find(v=>v.id===select.value).character});update(value.snapshot);toast('已切换，其他桌宠保持原样');await library(false);});apply.disabled=!snapshot().activePetId;actions.append(apply);
   if(group.update){card.append(text('p','发现新版本 v'+group.update.version));const install=button('下载更新到形象库',async()=>{install.disabled=true;try{status('正在下载更新，旧版本会保留…');await download({action:'install',versionId:group.update.versionId,mode:'library'});await library(false);status('新版已加入形象库；选择版本后可切换当前桌宠。');}finally{install.disabled=false;}},'primary');actions.append(install);}
   if(group.origin!=='builtin')actions.append(button('卸载形象',async()=>{const value=await call({action:'uninstall',appearanceId:select.value});if(value.cancelled)return;update(value.snapshot);await library(false);toast('形象已卸载');},'danger'));card.append(actions);installedList.append(card);
  }
  if(!result.groups.length)installedList.append(text('p','暂无已安装的扩展形象。默认内置 Claude 像素形象；其他形象可从市场安装或导入。'));
  status(result.error?'更新检查失败，可继续使用本机版本：'+result.error:checkUpdates?'检查完成。可下载发现的新版本；本机旧版本会保留。':'已安装版本可离线切换；回退只影响当前选中的桌宠。');
  }catch(error){if(generation===libraryGeneration)status('读取已安装版本失败：'+error.message);}finally{clearTimeout(timeout);}
 }
 function resetDetail(){marketView.classList.remove('detail-open');previewGeneration++;selected=null;$('marketDetail').hidden=true;$('marketList').hidden=false;$('market-search-placeholder')?.remove();}
 async function covers(generation,cards){let position=0;async function worker(){while(position<cards.length&&generation===listGeneration){const {record,image,placeholder}=cards[position++];try{const source=await call({action:'image',versionId:record.id,cover:true});if(generation!==listGeneration)return;image.src=source;image.hidden=false;placeholder.hidden=true;}catch{if(generation===listGeneration)placeholder.textContent='暂无封面';}}}await Promise.all([worker(),worker(),worker()]);}
 async function list(){
  if(busy)return;const generation=++listGeneration;resetDetail();status('正在连接市场…');$('marketList').replaceChildren();
  try{
   const result=await call({action:'list',query:$('marketQuery').value,filters:Object.fromEntries(Object.entries(browseControls).map(([key,select])=>[key,select.value]))});if(generation!==listGeneration)return;listing=result.pets;marketUrl=result.url;$('marketConnection').textContent='社区市场 · 已连接';const cards=[];
   for(const record of listing){
    const card=document.createElement('article');card.className='market-card';const art=document.createElement('div');art.className='market-cover';const image=document.createElement('img');image.alt=record.pet.name+' 封面';image.hidden=true;const placeholder=text('span','正在载入封面…');art.append(image,placeholder);
    const title=text('strong',record.pet.name),version=text('span','v'+record.pet.version);version.className='market-version';const heading=document.createElement('div');heading.className='market-card-title';heading.append(title,version);
    const description=text('p',record.pet.description||'这位伙伴还没有介绍。');description.className='market-card-description';const author=text('p',record.pet.author+' · '+(record.preview?.variants||[]).map(v=>v==='original'?'原图':'像素').join(' / '));
    const actions=document.createElement('div');actions.className='dialog-actions';actions.append(button('查看作品',()=>showDetail(record.id)),button(record.installed?'加入角色库':'安装桌宠',()=>perform({action:'install',versionId:record.id}),'primary'));
    card.append(art,heading,description,author,stats(record));if(record.installed){const badge=text('small','已在本机形象库');badge.className='market-installed';card.append(badge);}card.append(actions);$('marketList').append(card);cards.push({record,image,placeholder});
   }
   if(!listing.length){const empty=document.createElement('div');empty.className='market-empty';empty.append(text('h2','还没有找到匹配的伙伴'),text('p','试试其他关键词，或清除筛选看看。'),button('清除筛选',resetBrowse));$('marketList').append(empty);}
   status(listing.length?'显示 '+listing.length+' 个作品 · '+browseControls.sort.selectedOptions[0].textContent:'暂无匹配的已上架作品。');void covers(generation,cards);
  }catch(error){if(generation===listGeneration){marketConnection.textContent='市场连接不可用';status('市场暂不可用：'+error.message+'。你仍可导入本地分享包。');}}
 }
 async function showDetail(versionId){
  const generation=++previewGeneration;status('正在读取作品信息…');
  try{const record=await call({action:'detail',versionId});if(generation!==previewGeneration)return;selected=record;marketView.classList.add('detail-open');$('marketList').hidden=true;$('marketDetail').hidden=false;
   $('marketDetailName').textContent=record.pet.name;$('marketDetailAuthor').textContent=record.pet.author+' · v'+record.pet.version;$('marketDetailDescription').textContent=record.pet.description||'暂无介绍';$('marketDetailHash').textContent=record.sha256||'轻量投稿不下载分享包，不记录包哈希';
   $('marketDetailMeta').replaceChildren();for(const [key,value]of [['下载量',count(record.stats?.downloads)],['Star',count(record.stats?.stars)],['授权',record.pet.license],['资源包',(record.size/1048576).toFixed(1)+' MiB'],['显示版本',(record.preview?.variants||[]).map(v=>v==='original'?'原图':'像素').join(' / ')]])$('marketDetailMeta').append(text('dt',key),text('dd',value));
   const links=document.createElement('dd');links.append(button('GitHub 仓库',()=>call({action:'github',repository:record.repository,tag:record.tag,target:'repository'})),button('对应 Release',()=>call({action:'github',repository:record.repository,tag:record.tag,target:'release'})));$('marketDetailMeta').append(text('dt','作品来源'),links);
   const cover=$('marketDetailCover');cover.hidden=true;cover.removeAttribute('src');cover.alt=record.pet.name+' 封面';status('展示仓库介绍与封面，完整动作安装后可在工作台试映。');try{const source=await call({action:'image',versionId:record.id,cover:true});if(generation!==previewGeneration)return;cover.src=source;cover.hidden=false;}catch(error){if(generation===previewGeneration)status('封面载入失败：'+error.message);}
  }catch(error){status(error.message);}
 }
 async function perform(body){
  if(busy)return;const id=snapshot().activePetId,mode='library';busy=true;$('marketShowInstalled').hidden=true;
  const controls=[...$('market-discover').querySelectorAll('button,select,input')];for(const b of controls)b.disabled=true;status(body.action==='install'?'正在准备下载资源包…':'正在导入并校验资源包…');
  try{const result=await (body.action==='install'?download:call)({...body,mode,petId:id});if(result.cancelled){status('已取消');return;}if(result.snapshot)update(result.snapshot);status('安装完成：'+result.appearance.package.name+'。'+(mode==='new'?'已新增桌宠。':mode==='apply'?'已应用到当前桌宠，跟随设置保留。':'已加入形象库，在工作台选择角色即可使用。'));$('marketShowInstalled').textContent='管理已安装桌宠 →';$('marketShowInstalled').hidden=false;updateTarget();toast('桌宠已安装');}
  catch(error){status(error.message);}finally{busy=false;for(const b of controls)b.disabled=false;}
 }
 async function showMarket(){setMarketView();updateTarget();try{const config=await call({action:'config'});marketUrl=config.url;$('marketConnection').textContent='正在连接社区市场…';if(activeTab==='discover')await list();else await tab(activeTab);}catch(error){status(error.message);}}
 function receiptView(value){$('marketLookupRepository').value=value.repository;}
 function resultView(record,append=false){const box=$('marketLookupResult');if(!append)box.replaceChildren();const item=document.createElement('div');item.className='market-query-result';item.append(text('strong',(record.pet?.name||record.assetName||'投稿')+' · '+(statusNames[record.status]||record.status)),text('p',record.repository+' / '+record.tag),text('p',record.error||record.reason||record.reviews?.at(-1)?.reason||'暂时没有补充说明。'));box.append(item);}
 async function savedReceipts(){
  const entries=await call({action:'receipts'});const root=$('marketSavedReceipts');root.replaceChildren();const rows=entries.filter(r=>r.url===marketUrl);
  for(const r of rows){const row=document.createElement('article');row.className='market-saved-receipt';const info=document.createElement('div');info.append(text('strong',r.repository||'投稿记录'),text('p',(r.tag||'')+' · '+r.id.slice(0,12)+'…'));row.append(info,button('查询',async()=>{receiptView(r);await lookup();}));root.append(row);}
  if(!rows.length)root.append(text('p','还没有当前市场的本机投稿记录。'));
 }
 async function lookup(){const result=await call({action:'lookup',repository:$('marketLookupRepository').value.trim()});$('marketLookupResult').replaceChildren();for(const record of result.records)resultView(record,true);if(!result.records.length)$('marketLookupResult').append(text('p','该仓库暂无投稿记录。'));status('投稿状态已更新');await savedReceipts();}
 $('showMyPets').onclick=showPets;$('closeMarket').onclick=showPets;$('openMarket').onclick=showMarket;$('marketShowInstalled').onclick=()=>tab('installed').catch(e=>status(e.message));
 for(const b of document.querySelectorAll('[data-market-tab]'))b.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=[...document.querySelectorAll('[data-market-tab]')];const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(tabs.indexOf(b)+(event.key==='ArrowLeft'?tabs.length-1:1))%tabs.length;tabs[index].click();tabs[index].focus();};
 for(const b of document.querySelectorAll('[data-market-tab]'))b.onclick=()=>tab(b.dataset.marketTab).catch(e=>status(e.message));
 $('searchMarket').onclick=list;$('marketQuery').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void list();}};$('importPetpack').onclick=()=>perform({action:'import'});
 $('marketBackToList').onclick=()=>{resetDetail();status('');};$('marketDetailInstall').onclick=()=>selected&&perform({action:'install',versionId:selected.id});
 $('marketExportCurrent').onclick=()=>$('exportPet').click();$('marketRefreshReceipts').onclick=()=>savedReceipts().catch(e=>status(e.message));
 $('marketSubmitForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;status('正在发现并提交作品…');try{const result=await call({action:'submit',details:Object.fromEntries(new FormData(e.target))});receiptView(result.receipt);await tab('receipts');await lookup();status(result.warning||(result.records?`已发现 ${result.total} 个形象，新增 ${result.created} 个校验任务。每个形象独立校验、独立展示。`:result.existing?'该版本已提交，可直接查询进度。':'已提交，系统自动读取并校验，通过后立即上架。可使用仓库链接查询结果。'));}catch(error){status(error.message);}finally{b.disabled=false;}};
 $('marketLookupForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await lookup();}catch(error){status(error.message);}finally{b.disabled=false;}};
 $('exportPet').onclick=()=>{const data=snapshot();exportPetId=data.activePetId;if(!exportPetId)return;const skin=appearanceInfo(data.settings),form=$('exportForm');form.elements.id.value=('my-'+data.settings.character+'-'+skin.id).slice(0,64).replace(/-+$/,'');form.elements.namedItem('name').value=skin.name;form.elements.version.value='1.0.0';$('exportStatus').textContent='只导出形象与动作素材，不包含会话和本机配置。';$('exportDialog').showModal();};$('cancelExport').onclick=()=>$('exportDialog').close();
 $('exportForm').onsubmit=async e=>{e.preventDefault();$('confirmExport').disabled=true;$('exportStatus').textContent='正在打包素材…';try{const details=Object.fromEntries(new FormData(e.target)),result=await call({action:'export',petId:exportPetId,details});if(result.cancelled){$('exportStatus').textContent='已取消保存';return;}$('exportStatus').textContent='已导出：'+result.path+'\n上传到 GitHub Release 后，在「投稿作品」提交仓库链接。';toast('分享包已导出');}catch(error){$('exportStatus').textContent=error.message;}finally{$('confirmExport').disabled=false;}};
 return {showPets,showMarket};
}
