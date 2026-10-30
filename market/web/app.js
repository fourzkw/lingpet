import {$,api,notice,text,btn,initPreview,repositoryLinks,petStats} from './common.js';
const detail=initPreview(),statuses={queued:'排队校验',validating:'正在校验',pending:'等待自动校验',approved:'已上架',rejected:'已驳回',unpublished:'已下架',failed:'校验失败'};
let tab='market';
async function setTab(t){if(!['market','submit','mine'].includes(t))return;tab=t;for(const n of ['market','submit','mine'])$(n).hidden=n!==t;for(const b of document.querySelectorAll('[data-tab]')){b.classList.toggle('active',b.dataset.tab===t);b.setAttribute('aria-pressed',String(b.dataset.tab===t));};notice('');await load();}
let loadRevision=0;
const browseControls={sort:'marketSort',style:'marketStyle',interaction:'marketInteraction',recent:'marketRecent'};
function resetBrowse(){ $('search').value='';for(const [key,id]of Object.entries(browseControls))$(id).value=key==='sort'?'updated':'';return load(); }
async function load(){
 if(tab==='mine'){savedReceipts();return;}if(tab!=='market')return;
 const revision=++loadRevision,query=$('search').value.trim(),params=new URLSearchParams({q:query});for(const [key,id]of Object.entries(browseControls))if($(id).value)params.set(key,$(id).value);const filtered=!!query||['style','interaction','recent'].some(key=>params.has(key));const address=new URL(location.href);for(const key of ['q',...Object.keys(browseControls)]){address.searchParams.delete(key);if(params.get(key))address.searchParams.set(key,params.get(key));}history.replaceState(null,'',address);$('cards').setAttribute('aria-busy','true');$('resultCount').textContent='正在寻找可爱的伙伴…';
 try{
 const rows=await api('/api/pets?'+params);if(revision!==loadRevision)return;
 $('cards').replaceChildren();$('resultCount').textContent='显示 '+rows.length+' 位伙伴 · '+$('marketSort').selectedOptions[0].textContent+(query?' · 搜索「'+query+'」':'');
 for(const r of rows){
  const c=document.createElement('article');c.className='card pet-card';
  const cover=btn('',()=>detail(r));cover.className='pet-cover';cover.setAttribute('aria-label','查看 '+r.pet.name);
  const im=document.createElement('img');im.src='/api/versions/'+r.id+'/preview/cover.png';im.alt=r.pet.name;im.loading='lazy';im.addEventListener('error',()=>{im.src='/brand.svg';},{once:true});
  const badge=text('span','封面展示');badge.className='pet-badge';cover.append(badge,im);
  const info=document.createElement('div');info.className='pet-card-info';const description=text('p',r.pet.description||'一位等待与你相遇的桌面伙伴。');description.className='pet-card-description';
  const footer=document.createElement('div');footer.className='pet-card-footer';footer.append(text('span','v'+r.pet.version+' · '+(r.preview?.variants||['封面展示']).map(v=>v==='original'?'原图':v==='pixel'?'像素':v).join(' / ')),btn('认识一下 ↗',()=>detail(r)));
  info.append(text('h2',r.pet.name),text('p','by '+r.pet.author),description,petStats(r),footer);c.append(cover,info);$('cards').append(c);
 }
 if(!rows.length){const empty=document.createElement('div');empty.className='empty-market';const icon=document.createElement('img');icon.src='/brand.svg';icon.alt='';empty.append(icon,text('h2',filtered?'还没找到匹配的伙伴':'这里正等待第一位伙伴'),text('p',filtered?'试试其他关键词，或清除筛选看看。':'分享你的创作，让这间小小集市热闹起来。'));empty.append(btn(filtered?'清除筛选 ↗':'分享我的作品 ↗',()=>filtered?resetBrowse():setTab('submit')));$('cards').append(empty);}
 }catch(error){if(revision!==loadRevision)return;$('cards').replaceChildren();$('resultCount').textContent='暂时无法读取伙伴列表';const empty=document.createElement('div');empty.className='empty-market';empty.append(text('h2','伙伴们还在路上'),text('p',error.message),btn('重新加载 ↻',()=>load()));$('cards').append(empty);notice(error.message);}
 finally{if(revision===loadRevision)$('cards').setAttribute('aria-busy','false');}
}

function record(r,append=false){const root=$('myRecords');if(!append)root.replaceChildren();const row=document.createElement('article');row.className='record';const info=document.createElement('div');info.append(text('strong',(r.pet?.name||r.assetName)+' · '+statuses[r.status]),text('p',r.repository+' / '+r.tag),text('p',r.error||r.reason||r.reviews?.at(-1)?.reason||''));info.append(repositoryLinks(r));row.append(info);if(r.status==='approved')row.append(btn('查看作品',()=>detail(r)));root.append(row);}
function readReceipts(){try{const v=JSON.parse(localStorage.getItem('lingpet-submission-receipts')||'[]');return Array.isArray(v)?v.filter(r=>typeof r.repository==='string').slice(0,50):[];}catch{return [];}}
function savedReceipts(){const root=$('savedReceipts');root.replaceChildren();for(const r of readReceipts())root.append(btn(r.repository+' · '+r.id.slice(0,8),()=>{$('lookupRepository').value=r.repository;return lookup();}));}
async function lookup(){const value=await api('/api/submissions/lookup',{repository:$('lookupRepository').value.trim()});$('myRecords').replaceChildren();for(const r of value.records)record(r,true);if(!value.records.length)$('myRecords').append(text('p','该仓库暂无投稿记录。'));notice('投稿状态已更新');}
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>setTab(b.dataset.tab).catch(e=>notice(e.message));
$('searchButton').onclick=()=>load().catch(e=>notice(e.message));$('search').onkeydown=e=>{if(e.key==='Enter')load().catch(e=>notice(e.message));};
for(const id of Object.values(browseControls))$(id).onchange=()=>load().catch(e=>notice(e.message));
$('resetBrowse').onclick=()=>resetBrowse().catch(e=>notice(e.message));
const initialBrowse=new URL(location.href).searchParams;$('search').value=initialBrowse.get('q')||'';for(const [key,id]of Object.entries(browseControls)){const value=initialBrowse.get(key);if(value&&[...$(id).options].some(o=>o.value===value))$(id).value=value;}
$('submitForm').onsubmit=async e=>{
 e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;
 try{const receipt=await api('/api/submissions',Object.fromEntries(new FormData(e.target)));try{const list=readReceipts();for(const row of receipt.records??[receipt]){const entry={id:row.id,repository:row.record.repository};if(!list.some(old=>old.id===entry.id))list.unshift(entry);}localStorage.setItem('lingpet-submission-receipts',JSON.stringify(list.slice(0,50)));}catch{}
 $('lookupRepository').value=receipt.record.repository;await setTab('mine');await lookup();notice(receipt.records?`已发现 ${receipt.total} 个形象，新增 ${receipt.created} 个校验任务。每个形象独立校验、独立展示。`:receipt.existing?'该版本已提交，可直接查询进度。':'已提交，系统自动读取并校验，通过后立即上架。可使用仓库链接查询结果。');}
 catch(error){notice(error.message);}finally{b.disabled=false;}
};
$('lookupForm').onsubmit=e=>{e.preventDefault();lookup().catch(e=>notice(e.message));};
await load().catch(e=>notice(e.message));
const initialVersion=new URL(location.href).searchParams.get('version');
if(initialVersion&&/^[a-f0-9]{48}$/.test(initialVersion))try{await detail(await api('/api/versions/'+initialVersion));}catch(e){notice(e.message);}
