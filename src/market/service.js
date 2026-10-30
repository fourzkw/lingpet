import {loadCustomAppearances} from '../creation/catalog.js';
import {readFile,rm} from 'node:fs/promises';
import {CreationStore,safeId} from '../creation/store.js';
import path from 'node:path';
import {save} from '../creation/store.js';
import {exportPetpack,installPetpack,LIMITS,resourceFiles,metadata} from './package.js';
import {withInstallLock} from '../install-lock.js';
import {STATES} from '../creation/store.js';
import pngjs from 'pngjs';
import {compareVersions} from '../shared-runtime.js';
import {CHARACTERS,appearanceName} from '../characters.js';
import {PACKAGE_ROOT} from '../paths.js';
import {CLAUDE_CLIPS} from '../../desktop/claude-actions.js';
export const DEFAULT_MARKET='https://lingpet.fourzkw.top';
function marketURL(raw){const u=new URL(raw);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!['https:','http:'].includes(u.protocol))throw new Error('市场地址需为 HTTP 或 HTTPS 根地址');return u.origin;}
export function githubDownloadURL(raw){const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','github-releases.githubusercontent.com'].includes(u.hostname))throw new Error('只允许 GitHub Release 下载地址');return u;}
async function bounded(res,max,onProgress){
 const length=Number(res.headers.get('content-length')),encoding=res.headers.get('content-encoding');
 if(length>max)throw new Error('响应体积超限');
 let total=Number.isSafeInteger(length)&&length>0&&(!encoding||encoding==='identity')?length:null;
 const chunks=[];let n=0,last=0;
 onProgress?.({transferred:0,total});
 for await(const chunk of res.body){n+=chunk.length;if(n>max){await res.body.cancel?.().catch(()=>{});throw new Error('响应体积超限');}chunks.push(chunk);if(total&&n>total)total=null;const now=Date.now();if(now-last>=100){last=now;onProgress?.({transferred:n,total});}}
 onProgress?.({transferred:n,total});return Buffer.concat(chunks);
}
export class MarketService{
 constructor(dir,{fetcher=fetch}={}){this.dir=dir;this.fetcher=fetcher;this.imageCache=new Map();this.imageBytes=0;this.installedCovers=new WeakMap();}
 async config(){try{return {url:marketURL(JSON.parse(await readFile(path.join(this.dir,'market.json'),'utf8')).url)};}catch(error){if(error.code==='ENOENT')return {url:DEFAULT_MARKET};throw error;}}
 async configure(url){const result={url:marketURL(url)};await save(path.join(this.dir,'market.json'),result);return result;}
 async api(route,body,origin){const url=origin??(await this.config()).url,res=await this.fetcher(url+route,{redirect:'error',signal:AbortSignal.timeout(route==='/api/submissions'?60000:15000),...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});const value=JSON.parse((await bounded(res,8*1024*1024)).toString('utf8'));if(!res.ok)throw new Error(value.error||'市场请求失败');return value;}
 async list(query='',filters={}){const params=new URLSearchParams({q:String(query).slice(0,100)});for(const key of ['sort','style','interaction','recent'])if(filters?.[key])params.set(key,String(filters[key]));const {url}=await this.config(),value=await this.api('/api/pets?'+params,undefined,url);if(!Array.isArray(value))throw new Error('无效市场响应');const installed=await this.installed();return {url,pets:value.slice(0,200).map(r=>({...r,installed:installed.some(e=>(e.marketSources||[e.source]).some(s=>s?.market===url&&s?.versionId===r.id))}))};}
 versionId(value){if(typeof value!=='string'||!/^[a-f0-9]{48}$/.test(value))throw new Error('无效市场版本编号');return value;}
 async detail(versionId){this.versionId(versionId);const record=await this.api('/api/versions/'+versionId);if(record.id!==versionId||record.status!=='approved')throw new Error('该版本尚未上架');metadata(record.pet);if(record.preview)resourceFiles(record.preview);if(record.preview&&(record.preview.tileSize>128||record.preview.original?.tileSize>128))throw new Error('市场预览尺寸超限');return record;}
 async image({versionId,cover=false,state='idle',variant='pixel'}){
  this.versionId(versionId);if(!STATES.includes(state)||!['original','pixel'].includes(variant))throw new Error('无效预览动作或显示版本');
  const {url}=await this.config(),file=cover?'cover.png':(variant==='original'?'original/':'')+'sprites/'+state+'.png',key=url+'/'+versionId+'/'+file;
  if(this.imageCache.has(key)){const value=this.imageCache.get(key);this.imageCache.delete(key);this.imageCache.set(key,value);return value;}
  const res=await this.fetcher(url+'/api/versions/'+versionId+'/preview/'+file,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!res.ok)throw new Error('预览图片暂不可用');
  const bytes=await bounded(res,8*1024*1024),maxPixels=cover?1024*1024:2*1024*1024;
  if(bytes.length<33||bytes.toString('hex',0,8)!=='89504e470d0a1a0a'||!bytes.readUInt32BE(16)||!bytes.readUInt32BE(20)||bytes.readUInt32BE(16)*bytes.readUInt32BE(20)>maxPixels)throw new Error('预览图片格式或尺寸无效');
  const image=pngjs.PNG.sync.read(bytes,{checkCRC:true});let output=bytes;
  if(cover){const scale=Math.min(1,192/image.width,192/image.height),width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale)),small=new pngjs.PNG({width,height});for(let y=0;y<height;y++)for(let x=0;x<width;x++){const source=(Math.min(image.height-1,Math.floor(y/scale))*image.width+Math.min(image.width-1,Math.floor(x/scale)))*4;image.data.copy(small.data,(y*width+x)*4,source,source+4);}output=pngjs.PNG.sync.write(small,{colorType:6});}
  const value='data:image/png;base64,'+output.toString('base64');this.imageCache.set(key,value);this.imageBytes+=value.length;
  while(this.imageCache.size>64||this.imageBytes>24*1024*1024){const oldest=this.imageCache.keys().next().value;this.imageBytes-=this.imageCache.get(oldest).length;this.imageCache.delete(oldest);}
  return value;
 }
 async receipts(){try{const value=JSON.parse(await readFile(path.join(this.dir,'market-receipts.json'),'utf8'));return Array.isArray(value)?value.filter(r=>typeof r.url==='string'&&/^[a-f0-9]{48}$/.test(r.id)&&typeof r.repository==='string').slice(0,100):[];}catch(error){if(error.code==='ENOENT')return [];throw error;}}
 async rememberReceipt(receipt){return withInstallLock(path.join(this.dir,'market-receipts.lock'),async()=>{const entries=await this.receipts();await save(path.join(this.dir,'market-receipts.json'),[receipt,...entries.filter(r=>r.id!==receipt.id||r.url!==receipt.url)].slice(0,100));});}
 async submit(details){
  const body={repository:details?.repository?.trim()};if(typeof body.repository!=='string'||!body.repository||body.repository.length>200)throw new Error('请填写有效的 GitHub 仓库链接');
  if(details?.tag||details?.assetName){body.tag=details.tag;body.assetName=details.assetName;for(const [key,max] of [['tag',100],['assetName',120]])if(typeof body[key]!=='string'||!body[key].trim()||body[key].length>max)throw new Error('请填写有效的 Release 标签和附件名');}
  const {url}=await this.config(),value=await this.api('/api/submissions',body,url);
  const rows=value.records??[value];if(!Array.isArray(rows)||!rows.length||rows.length>20)throw new Error('无效批量投稿结果');
  const receipts=rows.map(row=>{this.versionId(row.id);if(row.token!==undefined&&!/^[a-f0-9]{48}$/.test(row.token))throw new Error('无效投稿凭证');return {id:row.id,token:row.token,url,repository:row.record?.repository||body.repository,tag:row.record?.tag,assetName:row.record?.assetName,createdAt:new Date().toISOString()};});let warning;
  try{for(const receipt of receipts)await this.rememberReceipt(receipt);}catch{warning='投稿已提交，本机记录保存失败。仍可使用 GitHub 仓库链接查询。';}
  return {...value,receipt:receipts[0],receipts,warning};
 }
 async lookup({repository,id,token}){if(repository!==undefined){if(typeof repository!=='string'||!repository.trim()||repository.length>200)throw new Error('请填写有效的 GitHub 仓库链接');const value=await this.api('/api/submissions/lookup',{repository:repository.trim()});if(!Array.isArray(value.records))throw new Error('无效投稿查询结果');return value;}this.versionId(id);if(typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token))throw new Error('无效投稿凭证');const {url}=await this.config(),record=await this.api('/api/submissions/lookup',{id,token},url);if(record.id!==id)throw new Error('无效投稿查询结果');const receipt={id,token,url,repository:record.repository,tag:record.tag,assetName:record.assetName,createdAt:new Date().toISOString()};let warning;try{await this.rememberReceipt(receipt);}catch{warning='查询成功，但本机凭证保存失败。请立即保存凭证文件。';}return {record,receipt,warning};}
 async receiptForExport({id,token,url}){this.versionId(id);if(typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token))throw new Error('无效投稿凭证');url=marketURL(url);return (await this.receipts()).find(r=>r.id===id&&r.token===token&&r.url===url)||{id,token,url};}
 async install(versionId,{onProgress}={}){
  const report=value=>{try{onProgress?.(value);}catch{/* A closed progress view must not break installation. */}};
  report({phase:'connecting',transferred:0,total:null});
  try{
  if(!/^[a-f0-9]{48}$/.test(versionId))throw new Error('无效市场版本编号');const marketOrigin=(await this.config()).url,record=await this.api('/api/versions/'+versionId+'/install',undefined,marketOrigin);if(!record.pet||typeof record.pet.id!=='string'||!/^[a-z0-9][a-z0-9-]{2,63}$/.test(record.pet.id)||typeof record.pet.version!=='string'||!/^\d+\.\d+\.\d+$/.test(record.pet.version))throw new Error('无效市场作品记录');let url=githubDownloadURL(record.url),res;
  for(let i=0;i<6;i++){res=await this.fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(180000)});if([301,302,303,307,308].includes(res.status)){await res.body?.cancel();url=githubDownloadURL(new URL(res.headers.get('location'),url).href);continue;}break;}
  // GitHub attachments may be replaced; validate the downloaded package and its identity.
  if(res.status!==200)throw new Error('GitHub 下载失败或重定向过多');
  const bytes=await bounded(res,LIMITS.package,value=>report({phase:'downloading',...value}));
  report({phase:'verifying',transferred:bytes.length,total:bytes.length});
  const installed=await installPetpack(this.dir,bytes,{expectedIdentity:record.pet,source:{market:marketOrigin,versionId,github:record.source}});
  report({phase:'complete',transferred:bytes.length,total:bytes.length});return installed;
  }catch(error){report({phase:'error'});throw error;}
 }
 async installed(){return (await loadCustomAppearances(this.dir)).map(installedEntry);}
 async installedCover(entry){
  let pending=this.installedCovers.get(entry);
  if(!pending){pending=this.readInstalledCover(entry).catch(error=>{this.installedCovers.delete(entry);throw error;});this.installedCovers.set(entry,pending);}
  return pending;
 }
 async readInstalledCover(entry){
  try{return 'data:image/png;base64,'+(await readFile(path.join(entry.root,'cover.png'))).toString('base64');}catch(error){if(error.code!=='ENOENT')throw error;}
  const clip=entry.manifest.clips.idle,tile=entry.manifest.tileSize,frame=clip.frames[0],source=pngjs.PNG.sync.read(await readFile(path.join(entry.root,clip.file))),cover=new pngjs.PNG({width:tile,height:tile});
  pngjs.PNG.bitblt(source,cover,frame%entry.manifest.columns*tile,Math.floor(frame/entry.manifest.columns)*tile,tile,tile,0,0);return 'data:image/png;base64,'+pngjs.PNG.sync.write(cover,{colorType:6}).toString('base64');
 }
 async uninstall(appearanceId){
  const entry=(await this.installed()).find(e=>e.id===appearanceId);if(!entry)throw new Error('该形象未安装');
  const store=new CreationStore(this.dir);
  return store.lock(async()=>{for(const item of [entry,...entry.aliases||[]]){
   const id=safeId(item.id),base=path.resolve(this.dir,'appearances'),root=path.resolve(base,id),relative=path.relative(base,root);
   if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('资源路径越界');
   await rm(store.file('appearances',id),{force:true});await rm(root,{recursive:true,force:true});
  }return {removed:true};});
 }
 async library({checkUpdates=false,appearances,includeBuiltin=false}={}){
  // The desktop already validates and reloads these entries after resource changes.
  const entries=appearances===undefined?await this.installed():appearances.map(installedEntry),groups=new Map();
  if(includeBuiltin)for(const role of CHARACTERS)for(const skin of role.appearances.filter(a=>!a.custom)){
   const root=path.join(PACKAGE_ROOT,'assets',skin.asset,skin.asset==='claude'?'actions-v2':'actions-v1'),manifest=skin.asset==='claude'?{columns:8,tileSize:128,clips:{idle:{...CLAUDE_CLIPS.idle,file:'atlas.png'}}}:JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
   entries.push({id:skin.id,character:role.id,name:skin.name,variants:skin.variants,builtin:true,root,manifest,package:{id:'builtin-'+role.id+'-'+skin.id,name:skin.name,author:'LingPet',description:role.description,version:'0.0.0'}});
  }
  for(const entry of entries){const sources=entry.marketSources||[entry.source].filter(Boolean),repo=sources.find(s=>s.github?.repoId)?.github.repoId,key=entry.builtin?'builtin/'+entry.character+'/'+entry.id:repo?repo+'/'+entry.package.id:entry.localEntry?'local/'+entry.id:'local:'+entry.package.author+'/'+entry.package.id;let group=groups.get(key);if(!group){group={key,packageId:entry.package.id,name:entry.package.name,characterName:CHARACTERS.find(c=>c.id===entry.character)?.name||entry.characterName||entry.character,description:entry.package.description,author:entry.package.author,origin:entry.builtin?'builtin':entry.retainedBuiltin?'retained':entry.localEntry?'local':'package',cover:await this.installedCover(entry),versions:[],sources:[]};groups.set(key,group);}for(const pkg of (entry.packageVersions||[entry.package]).filter(p=>p.id===entry.package.id))group.versions.push({id:entry.id,character:entry.character,name:appearanceName(entry),version:pkg.version,variants:entry.variants,interactions:['click','pet'].filter(k=>entry.manifest.clips[k])});group.sources.push(...sources);}
  let records=[],error;
  if(checkUpdates)try{const {url}=await this.config();records=await this.api('/api/pets');if(!Array.isArray(records))throw new Error('无效市场响应');for(const group of groups.values())group.sources=group.sources.filter(s=>s.market===url);}catch(e){error=e.message;}
  for(const group of groups.values()){
    group.versions.sort((a,b)=>compareVersions(b.version,a.version));
    const source=group.sources.find(s=>s.github?.repoId);
    if(source){const repo=source.github.owner+'/'+source.github.repo,candidates=records.filter(r=>r.status==='approved'&&r.pet?.id===group.packageId&&r.repository?.toLowerCase()===repo.toLowerCase()&&/^\d+\.\d+\.\d+$/.test(r.pet.version));candidates.sort((a,b)=>compareVersions(b.pet.version,a.pet.version));const latest=candidates[0];if(latest&&compareVersions(latest.pet.version,group.versions[0].version)>0)group.update={version:latest.pet.version,versionId:latest.id};}
    delete group.sources;
  }
  return {groups:[...groups.values()],checked:checkUpdates,error};
 }
 export(pet,details){return exportPetpack({dataDir:this.dir,pet,details});}
}

function installedEntry(entry){
 if(entry.package)return entry;
 return {...entry,localEntry:true,package:{id:'local-'+entry.id,name:entry.name,version:'0.0.0',author:entry.retainedBuiltin?'LingPet':'本地创作',description:entry.retainedBuiltin?'从旧版保留的独立形象，已安装在用户形象库。':'本地创建或导入的形象。'}};
}
