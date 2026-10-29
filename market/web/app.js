import {$,api,notice,text,btn,initPreview,repositoryLinks,petStats} from './common.js';
import {attachCardPreview} from './card-preview.js';
const detail=initPreview(),statuses={queued:'排队校验',validating:'正在校验',pending:'等待审核',approved:'已上架',rejected:'已驳回',unpublished:'已下架',failed:'校验失败'};
let tab='market';
async function setTab(t){if(!['market','submit','mine'].includes(t))return;tab=t;for(const n of ['market','submit','mine'])$(n).hidden=n!==t;for(const b of document.querySelectorAll('[data-tab]')){b.classList.toggle('active',b.dataset.tab===t);b.setAttribute('aria-pressed',String(b.dataset.tab===t));};notice('');await load();}
let loadRevision=0;
async function load(){
 if(tab==='mine'){savedReceipts();return;}if(tab!=='market')return;
 const revision=++loadRevision,query=$('search').value.trim();$('cards').setAttribute('aria-busy','true');$('resultCount').textContent='正在寻找可爱的伙伴…';
 try{
 const rows=await api('/api/pets?q='+encodeURIComponent(query));if(revision!==loadRevision)return;
 $('cards').replaceChildren();$('resultCount').textContent=query?'找到 '+rows.length+' 位伙伴 · 搜索「'+query+'」':'共 '+rows.length+' 位伙伴 · 每一位都有自己的模样';
 for(const r of rows){
  const c=document.createElement('article');c.className='card pet-card';
  const cover=btn('',()=>detail(r));cover.className='pet-cover';cover.setAttribute('aria-label','预览 '+r.pet.name);
  const im=document.createElement('img');im.src='/api/versions/'+r.id+'/preview/cover.png';im.alt=r.pet.name;im.loading='lazy';im.addEventListener('error',()=>{im.src='/brand.svg';},{once:true});
  const badge=text('span',r.preview?'可预览动作':'封面展示');badge.className='pet-badge';cover.append(badge,im);attachCardPreview(cover,r);
  const info=document.createElement('div');info.className='pet-card-info';const description=text('p',r.pet.description||'一位等待与你相遇的桌面伙伴。');description.className='pet-card-description';
  const footer=document.createElement('div');footer.className='pet-card-footer';footer.append(text('span','v'+r.pet.version+' · '+(r.preview?.variants||['封面展示']).map(v=>v==='original'?'原图':v==='pixel'?'像素':v).join(' / ')),btn('认识一下 ↗',()=>detail(r)));
  info.append(text('h2',r.pet.name),text('p','by '+r.pet.author),description,petStats(r),footer);c.append(cover,info);$('cards').append(c);
 }
 if(!rows.length){const empty=document.createElement('div');empty.className='empty-market';const icon=document.createElement('img');icon.src='/brand.svg';icon.alt='';empty.append(icon,text('h2',query?'还没找到这位伙伴':'这里正等待第一位伙伴'),text('p',query?'试试其他名称、作者，或清空搜索看看。':'分享你的创作，让这间小小集市热闹起来。'));empty.append(btn(query?'查看全部伙伴 ↗':'分享我的作品 ↗',()=>{if(query){$('search').value='';return load();}return setTab('submit');}));$('cards').append(empty);}
 }catch(error){if(revision!==loadRevision)return;$('cards').replaceChildren();$('resultCount').textContent='暂时无法读取伙伴列表';const empty=document.createElement('div');empty.className='empty-market';empty.append(text('h2','伙伴们还在路上'),text('p',error.message),btn('重新加载 ↻',()=>load()));$('cards').append(empty);notice(error.message);}
 finally{if(revision===loadRevision)$('cards').setAttribute('aria-busy','false');}
}

function record(r){const root=$('myRecords');root.replaceChildren();const row=document.createElement('article');row.className='record';const info=document.createElement('div');info.append(text('strong',(r.pet?.name||r.assetName)+' · '+statuses[r.status]),text('p',r.repository+' / '+r.tag),text('p',r.error||r.reviews?.at(-1)?.reason||''));info.append(repositoryLinks(r));row.append(info);if(r.preview&&r.status==='approved')row.append(btn('预览八动作',()=>detail(r)));root.append(row);}
function readReceipts(){try{const v=JSON.parse(localStorage.getItem('lingpet-submission-receipts')||'[]');return Array.isArray(v)?v.filter(r=>/^[a-f0-9]{48}$/.test(r.id)&&/^[a-f0-9]{48}$/.test(r.token)).slice(0,50):[];}catch{return [];}}
function savedReceipts(){const root=$('savedReceipts');root.replaceChildren();for(const r of readReceipts())root.append(btn(r.repository+' · '+r.id.slice(0,8),()=>{$('lookupId').value=r.id;$('lookupToken').value=r.token;return lookup();}));}
async function lookup(){record(await api('/api/submissions/lookup',{id:$('lookupId').value.trim(),token:$('lookupToken').value.trim()}));notice('投稿状态已更新');}
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>setTab(b.dataset.tab).catch(e=>notice(e.message));
$('searchButton').onclick=()=>load().catch(e=>notice(e.message));$('search').onkeydown=e=>{if(e.key==='Enter')load().catch(e=>notice(e.message));};
$('submitForm').onsubmit=async e=>{
 e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;
 try{const receipt=await api('/api/submissions',Object.fromEntries(new FormData(e.target)));try{const list=readReceipts();list.unshift({id:receipt.id,token:receipt.token,repository:receipt.record.repository});localStorage.setItem('lingpet-submission-receipts',JSON.stringify(list.slice(0,50)));}catch{}
 $('lookupId').value=receipt.id;$('lookupToken').value=receipt.token;$('receiptId').textContent=receipt.id;$('receiptToken').textContent=receipt.token;$('receipt').hidden=false;await setTab('mine');record(receipt.record);notice('已提交。请保存投稿编号和私密凭证。');}
 catch(error){notice(error.message);}finally{b.disabled=false;}
};
$('lookupForm').onsubmit=e=>{e.preventDefault();lookup().catch(e=>notice(e.message));};
$('saveReceipt').onclick=()=>{const content=JSON.stringify({id:$('receiptId').textContent,token:$('receiptToken').textContent,market:location.origin},null,2),url=URL.createObjectURL(new Blob([content],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='lingpet-submission-'+$('receiptId').textContent.slice(0,8)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
await load().catch(e=>notice(e.message));
const initialVersion=new URL(location.href).searchParams.get('version');
if(initialVersion&&/^[a-f0-9]{48}$/.test(initialVersion))try{await detail(await api('/api/versions/'+initialVersion));}catch(e){notice(e.message);}
