// Characters own appearances; appearances declare the render variants available.
export const VARIANTS=[{id:'original',name:'原图'},{id:'pixel',name:'像素'}];
export const BUILTIN_CHARACTERS=[
  {id:'claude',name:'Claude',description:'Claude',tag:'CLAUDE',appearances:[
    {id:'classic',name:'Claude',asset:'claude',variants:['pixel'],pixelSize:128},
  ]},
  {id:'deepseek',name:'DeepSeek',description:'鲸鱼娘',tag:'DEEPSEEK',appearances:[
    {id:'whale',name:'鲸鱼娘',asset:'deepseek-h3',variants:['original','pixel'],pixelSize:192,doneMs:5250},
  ]},
  {id:'chatgpt',name:'ChatGPT',description:'白羽龙姬 / 云羽龙姬',tag:'CHATGPT',appearances:[
    {id:'white-dragon',name:'白羽龙姬',asset:'chatgpt-white-dragon-h3',variants:['original','pixel'],pixelSize:192,doneMs:5250},
    {id:'cloud-dragon',name:'云羽龙姬',asset:'chatgpt-dragon',variants:['original','pixel'],pixelSize:192,doneMs:5250},
  ]},
];
export const CHARACTERS=structuredClone(BUILTIN_CHARACTERS);
let bundled=new Set(BUILTIN_CHARACTERS.flatMap(c=>c.appearances.map(a=>a.asset))),savedEntries=[],savedRoles=[];
export function configureBundledAssets(assets){bundled=new Set(assets);setCustomAppearances(savedEntries,savedRoles);}
// These unfinished media jobs were stopped by the user. Retain their design
// metadata without advertising unavailable assets in the installed workbench.
export const DRAFT_APPEARANCES=[
  {character:'chatgpt',id:'white-dragon-v2',name:'白羽龙姬 · 新生',asset:'chatgpt-q-v2',variants:['original','pixel'],pixelSize:192,doneMs:5250},
];
export const CHARACTER_IDS=CHARACTERS.map(character=>character.id);
export function appearanceName(entry){return entry.package&&entry.name===entry.package.name+' · '+entry.package.version?entry.package.name:entry.name;}
export function setCustomAppearances(entries=[],roles=[]){
  savedEntries=entries;savedRoles=roles;
  CHARACTERS.splice(0,CHARACTERS.length,...structuredClone(BUILTIN_CHARACTERS).map(c=>({...c,appearances:c.appearances.filter(a=>bundled.has(a.asset))})).filter(c=>c.appearances.length));
  for(const base of BUILTIN_CHARACTERS)if(entries.some(e=>e.character===base.id)&&!CHARACTERS.some(c=>c.id===base.id))CHARACTERS.push({...base,appearances:[]});
  for(const role of roles)if(/^custom-[a-z0-9-]{3,64}$/.test(role.id)&&!CHARACTERS.some(c=>c.id===role.id))CHARACTERS.push({...role,customRole:true,tag:'CUSTOM',appearances:[]});
  for(const entry of entries)if(entry.community&&/^community-[a-z0-9-]{3,64}$/.test(entry.character)&&!CHARACTERS.some(c=>c.id===entry.character))CHARACTERS.push({id:entry.character,name:entry.characterName||entry.package?.name||'社区桌宠',description:entry.characterDescription||'社区作品',tag:'COMMUNITY',community:true,appearances:[]});
  CHARACTER_IDS.splice(0,CHARACTER_IDS.length,...CHARACTERS.map(c=>c.id));
  for(const character of CHARACTERS){
    character.appearances=character.appearances.filter(a=>!a.custom);
    for(const entry of entries.filter(e=>e.character===character.id)){
      if(character.appearances.some(a=>a.id===entry.id))throw new Error('自定义形象不能覆盖内置形象');
      character.appearances.push({id:entry.id,name:appearanceName(entry),packageVersion:entry.package?.version,asset:'custom:'+entry.id,variants:entry.variants,pixelSize:entry.pixelSize,doneMs:entry.doneMs,custom:true});
    }
  }
}
export function characterInfo(id){
  if(id==='chatgpt-dragon'){const role=CHARACTERS.find(c=>c.id==='chatgpt');if(role)return {...role,...role.appearances.find(a=>a.id==='cloud-dragon')};}
  return CHARACTERS.find(character=>character.id===id)??CHARACTERS[0];
}
export function appearanceInfo(pet={}){
  const character=characterInfo(pet.character);
  return character.appearances.find(item=>item.id===pet.appearance)??(pet.character==='chatgpt-dragon'?character.appearances.find(a=>a.id==='cloud-dragon'):character.appearances[0]);
}
export function appearanceSelection(value={},current={}){
  for(const key of ['character','appearance','variant'])if(key in value&&typeof value[key]!=='string')throw new Error('无效的外观选择');
  const raw=value.character??current.character??'claude',id=raw==='chatgpt-dragon'?'chatgpt':raw;
  if(!CHARACTER_IDS.includes(id))throw new Error('未知角色');
  const character=characterInfo(id);if(!character.appearances.length)throw new Error('请先为该角色导入完整形象');const same=id===(current.character==='chatgpt-dragon'?'chatgpt':current.character);
  const appearance=value.appearance??(value.character==='chatgpt-dragon'?'cloud-dragon':same?current.appearance:undefined)??character.appearances[0].id;
  const skin=character.appearances.find(item=>item.id===appearance);if(!skin)throw new Error('该角色没有此形象');
  const variant=value.variant??(skin.variants.includes(current.variant)?current.variant:skin.variants.includes('pixel')?'pixel':skin.variants[0]);if(!skin.variants.includes(variant))throw new Error('该形象没有此版本');
  return {character:id,appearance,variant};
}
export function appearanceLabel(pet){return characterInfo(pet.character).name+' · '+appearanceInfo(pet).name+' · '+(pet.variant==='original'?'原图':'像素');}
export function nextCharacter(id){const current=id==='chatgpt-dragon'?'chatgpt':id;const ids=CHARACTERS.filter(c=>c.appearances.length).map(c=>c.id);return ids[(ids.indexOf(current)+1)%ids.length];}
