export const $=id=>document.getElementById(id);
export const labels={idle:"空闲",thinking:"思考",working:"工作",input:"等待输入",approval:"等待批准",done:"完成",error:"异常",sleep:"休眠"};
export function notice(t){$("notice").textContent=t;}
export async function api(path,body){const r=await fetch(path,body===undefined?{}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),v=await r.json();if(!r.ok)throw Error(v.error||"请求失败");return v;}
export function text(tag,t){const e=document.createElement(tag);e.textContent=t;return e;}
export function btn(t,fn){const b=document.createElement("button");b.textContent=t;b.onclick=()=>Promise.resolve(fn()).catch(e=>notice(e.message));return b;}
export function initPreview(){let current,start=0,images=new Map();
async function detail(r){
 current=r;images.clear();$('detailTitle').textContent=r.pet.name+' · '+r.pet.version;$('detailDescription').textContent=r.pet.description;
 $('detailInfo').replaceChildren();$('detailInfo').textContent='作者：'+r.pet.author+' / 授权：'+r.pet.license+' / '+(r.size/1048576).toFixed(1)+' MiB';$('hash').textContent='市场条目编号：'+r.id;$('detailInfo').append(repositoryLinks(r));
 for(const id of ['state','variant']){$(id).replaceChildren();$(id).parentElement.hidden=!r.preview;}
 for(const [v,label]of Object.entries(r.preview?labels:{})){const o=text('option',label);o.value=v;$('state').append(o);}
 for(const v of r.preview?.variants||[]){const o=text('option',v==='original'?'原图':'像素');o.value=v;$('variant').append(o);}
 $('download').hidden=r.status!=='approved';
 if(r.status==='approved'){const v=await api('/api/versions/'+r.id+'/install');$('download').href=v.url;$('download').target='_blank';$('download').rel='noopener noreferrer';}
 start=performance.now();if(!$('detail').open)$('detail').showModal();if(r.preview){await ready();}else{const im=new Image();im.src='/api/versions/'+r.id+'/preview/cover.png';await im.decode();const ctx=$('animation').getContext('2d');ctx.clearRect(0,0,384,384);ctx.drawImage(im,0,0,384,384);}
}
async function ready(){if(!current?.preview)return;const state=$('state').value,v=$('variant').value,k=state+v;if(images.has(k))return;const im=new Image();im.src='/api/versions/'+current.id+'/preview/'+(v==='original'?'original/':'')+current.preview.clips[state].file;await im.decode();images.set(k,im);}
function frame(c,t){const sum=c.durations.reduce((a,b)=>a+b,0),pre=c.durations.slice(0,c.loopFrom||0).reduce((a,b)=>a+b,0);if(t>=sum){if(!c.loop)return c.frames.at(-1);t=pre+(t-sum)%(sum-pre);}for(let i=0;i<c.frames.length;i++){if(t<c.durations[i])return c.frames[i];t-=c.durations[i];}return c.frames.at(-1);}
function animate(now){requestAnimationFrame(animate);if(!current?.preview||!$('detail').open)return;const state=$('state').value,v=$('variant').value,im=images.get(state+v);if(!im)return;const m=current.preview,f=frame(m.clips[state],now-start),tile=v==='original'?m.original.tileSize:m.tileSize,ctx=$('animation').getContext('2d');ctx.clearRect(0,0,384,384);ctx.imageSmoothingEnabled=v==='original';ctx.drawImage(im,f%m.columns*tile,Math.floor(f/m.columns)*tile,tile,tile,0,0,384,384);}

$("closeDetail").onclick=()=>$("detail").close();for(const id of ["state","variant"])$(id).onchange=()=>{start=performance.now();ready().catch(e=>notice(e.message));};requestAnimationFrame(animate);return detail;}

export function repositoryLinks(record){
 const root=document.createElement('p'),repo=record.repository;
 if(typeof repo!=='string'||!/^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})$/.test(repo)||repo.includes('..'))return root;
 const base='https://github.com/'+repo;
 for(const [label,url]of [['GitHub 仓库',base],['对应 Release',base+'/releases/tag/'+encodeURIComponent(record.tag||'')]]){const a=text('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';root.append(a,document.createTextNode(' '));}return root;
}
