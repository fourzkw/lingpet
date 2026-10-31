export const $=id=>document.getElementById(id);
export const labels={idle:"空闲",thinking:"思考",working:"工作",input:"等待输入",approval:"等待批准",done:"完成",error:"异常",sleep:"休眠"};
export function notice(t){$("notice").textContent=t;}
export async function api(path,body){const r=await fetch(path,body===undefined?{}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),v=await r.json();if(!r.ok)throw Error(v.error||"请求失败");return v;}
export function text(tag,t){const e=document.createElement(tag);e.textContent=t;return e;}
export function btn(t,fn){const b=document.createElement("button");b.textContent=t;b.onclick=()=>Promise.resolve(fn()).catch(e=>notice(e.message));return b;}
export function initPreview(){let revision=0;
 async function detail(r){
  const request=++revision,cover=$('detailCover');cover.hidden=true;cover.removeAttribute('src');cover.alt=r.pet.name+' 封面';
  $('detailTitle').textContent=r.pet.name+' · '+r.pet.version;$('detailDescription').textContent=r.pet.description;
  $('detailInfo').textContent='所属角色：'+(r.pet.character?.name||r.pet.name)+' / 形象名称：'+r.pet.name+' / 作者：'+r.pet.author+' / 授权：'+r.pet.license+' / '+(r.size/1048576).toFixed(1)+' MiB';$('hash').textContent='市场条目编号：'+r.id;$('detailInfo').append(petStats(r),repositoryLinks(r));
  $('download').hidden=true;$('download').removeAttribute('href');if(!$('detail').open)$('detail').showModal();
  cover.src='/api/versions/'+r.id+'/preview/cover.png?v='+encodeURIComponent(r.previewRevision||r.updatedAt||'');cover.hidden=false;
  if(r.status==='approved'){const v=await api('/api/versions/'+r.id+'/install');if(request!==revision||!$('detail').open)return;$('download').href=v.url;$('download').target='_blank';$('download').rel='noopener noreferrer';$('download').hidden=false;}
 }
 $('closeDetail').onclick=()=>{revision++;$('detail').close();};$('detail').addEventListener('close',()=>revision++);return detail;
}

export function repositoryLinks(record){
 const root=document.createElement('p'),repo=record.repository;
 if(typeof repo!=='string'||!/^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})$/.test(repo)||repo.includes('..'))return root;
 const base='https://github.com/'+repo;
 for(const [label,url]of [['GitHub 仓库',base],['对应 Release',base+'/releases/tag/'+encodeURIComponent(record.tag||'')]]){const a=text('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';root.append(a,document.createTextNode(' '));}return root;
}

export function petStats(record){
 const root=document.createElement('p');root.className='pet-stats';root.title='下载量为同一桌宠所有已上架版本分享包的 GitHub 下载次数之和（同一附件去重）；Star 为作者仓库获星数';
 const count=value=>Number.isSafeInteger(value)&&value>=0?value.toLocaleString('zh-CN'):'暂不可用';
 root.append(text('span','↓ 下载 '+count(record.stats?.downloads)),text('span','★ Star '+count(record.stats?.stars)));return root;
}
