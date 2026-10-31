import {normalizeTheme} from './ui-themes.js';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {appearanceSelection} from './characters.js';
import {normalizePetScale} from './pet-display.js';
import {INTERACTION_SETTINGS} from './animation-kinds.js';

export const DEFAULT_PET={name:'默认桌宠',character:'claude',appearance:'classic',variant:'pixel',scale:1,resolution:32,alwaysOnTop:true,showLabel:false,enabled:true,petVisible:true,...INTERACTION_SETTINGS,follow:{mode:'none'}};
export function validateFollow(value){
  if(value?.mode==='none')return {mode:'none',...(value.autoConnect===true?{autoConnect:true}:{})};
  if(value?.mode==='global')return {mode:'global'};
  if(value?.mode==='source'&&['dsh','cursor','codex'].includes(value.source))return {mode:'source',source:value.source};
  if(value?.mode==='session'&&['dsh','cursor','codex'].includes(value.source)&&typeof value.scopeId==='string'&&value.scopeId&&value.scopeId.length<=256&&typeof value.sessionId==='string'&&value.sessionId&&value.sessionId.length<=256)return {mode:'session',source:value.source,scopeId:value.scopeId,sessionId:value.sessionId};
  throw new Error('无效的跟随规则');
}
export function petPatch(value,current={}){
  if(!value||typeof value!=='object')throw new Error('无效的桌宠配置');const patch={};
  if('name'in value){if(typeof value.name!=='string'||!value.name.trim()||value.name.length>40)throw new Error('桌宠名称需为 1–40 个字符');patch.name=value.name.trim();}
  if(['character','appearance','variant'].some(key=>key in value))Object.assign(patch,appearanceSelection(value,current));
  if('scale'in value){if(!Number.isFinite(value.scale)||value.scale<.5||value.scale>1.5)throw new Error('无效大小');patch.scale=normalizePetScale(value.scale);}
  for(const field of ['enabled','petVisible','alwaysOnTop','showLabel','clickResponse','headPat','interactionHints'])if(field in value){if(typeof value[field]!=='boolean')throw new Error('无效开关');patch[field]=value[field];}
  if('patSensitivity'in value){if(!['gentle','normal','sensitive'].includes(value.patSensitivity))throw new Error('无效互动灵敏度');patch.patSensitivity=value.patSensitivity;}
  for(const field of ['x','y'])if(field in value){if(!Number.isFinite(value[field])||Math.abs(value[field])>100000)throw new Error('无效位置');patch[field]=value[field];}
  if('follow'in value){
    patch.follow=validateFollow(value.follow);
    // Use the mode's default on entering/leaving standalone, unless the same
    // request explicitly sets the label. Loading saved choices preserves them.
    if(!('showLabel'in value)&&patch.follow.mode!==current.follow?.mode&&(!current.follow||patch.follow.mode==='none'||current.follow.mode==='none'))patch.showLabel=patch.follow.mode!=='none';
  }
  return patch;
}
// Retired choices migrate only when loading saved settings. New selections
// still go through strict validation, so removed characters cannot reappear.
function migrateRetiredAppearance(value){
  if(value?.character==='gemini')return {...value,character:'chatgpt',appearance:'cloud-dragon'};
  if(value?.character==='deepseek'&&value.appearance==='whale-classic')return {...value,appearance:'whale'};
  return value;
}
export function migratePetConfig(raw){
  if(raw?.schemaVersion===2){
    if(!Array.isArray(raw.pets))throw new Error('桌宠配置列表损坏');
    const ids=new Set();
    return {schemaVersion:2,global:{launchAtLogin:Boolean(raw.global?.launchAtLogin),theme:normalizeTheme(raw.global?.theme)},pets:raw.pets.map(value=>{
      if(typeof value.id!=='string'||!value.id||value.id.length>80||ids.has(value.id))throw new Error('桌宠 ID 无效或重复');ids.add(value.id);
      return {...DEFAULT_PET,...petPatch({...migrateRetiredAppearance(value),follow:value.follow??{mode:'global'}}),id:value.id};
    })};
  }
  const fresh=!raw||Object.keys(raw).length===0;
  raw=migrateRetiredAppearance(raw);
  const safe={};for(const key of Object.keys(DEFAULT_PET))if(raw?.[key]!==undefined&&key!=='follow')safe[key]=raw[key];
  return {schemaVersion:2,global:{launchAtLogin:Boolean(raw?.launchAtLogin),theme:normalizeTheme(raw?.theme)},pets:[{...DEFAULT_PET,...petPatch({...safe,follow:raw?.follow&&typeof raw.follow==='object'?raw.follow:fresh?{mode:'none',autoConnect:true}:{mode:'global'},...(Number.isFinite(raw?.x)?{x:raw.x}:{}),...(Number.isFinite(raw?.y)?{y:raw.y}:{})}),id:randomUUID()}]};
}
export class PetRegistry extends EventEmitter{
  constructor(raw){super();this.config=migratePetConfig(raw);}
  get pets(){return this.config.pets;}
  get(id){return this.pets.find(p=>p.id===id);}
  require(id){const pet=this.get(id);if(!pet)throw new Error('桌宠不存在');return pet;}
  update(id,value){const pet=this.require(id);Object.assign(pet,petPatch(value,pet));this.emit('change');return pet;}
  create(value={}){const pet={...DEFAULT_PET,...petPatch(value),id:randomUUID()};this.pets.push(pet);this.emit('change');return pet;}
  // Only the initial waiting pet reacts to an ordinary connection. An explicit
  // installation may activate the selected standalone pet; existing bindings stay intact.
  connectAgent(source,{petId,installed=false}={}){
    if(!['dsh','cursor','codex'].includes(source)||installed&&!petId)return false;
    const targets=petId?[this.get(petId)].filter(Boolean):this.pets;
    let changed=false;
    for(const pet of targets)if(pet.follow.mode==='none'&&(pet.follow.autoConnect===true||installed)){
      Object.assign(pet,petPatch({follow:{mode:'source',source}},pet));changed=true;
    }
    if(changed)this.emit('change');return changed;
  }
  duplicate(id){const original=this.require(id);return this.create({...original,follow:original.follow.mode==='none'?{mode:'none'}:original.follow,name:original.name.slice(0,35)+' 副本',...(Number.isFinite(original.x)?{x:original.x+40}:{}),...(Number.isFinite(original.y)?{y:original.y+40}:{})});}
  remove(id){this.require(id);this.config.pets=this.pets.filter(p=>p.id!==id);this.emit('change');}
}
