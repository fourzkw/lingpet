import {CHARACTERS,VARIANTS,characterInfo,appearanceInfo} from '../src/characters.js';
import {PET_SCALES,scaleLabel,petIsVisible,visibilityPatch} from '../src/pet-display.js';

// The caller binds these actions to the clicked pet, never the editor selection.
export function petMenuTemplate(pet,{stateLabel='',demo=false,update,openSettings,endDemo}){
  const character=characterInfo(pet.character),skin=appearanceInfo(pet);
  return [
    {label:pet.name+(stateLabel?' · '+stateLabel:''),enabled:false},
    {type:'separator'},
    {id:'workbench',label:'打开工作台…',click:openSettings},
    {id:'character',label:'切换角色',submenu:CHARACTERS.filter(c=>c.appearances.length).map(character=>({id:'character-'+character.id,label:character.name,type:'radio',checked:pet.character===character.id,click:()=>update({character:character.id})}))},
    {id:'appearance',label:'切换形象 · '+skin.name,submenu:character.appearances.map(item=>({id:'appearance-'+item.id,label:item.name,type:'radio',checked:item.id===skin.id,click:()=>update({appearance:item.id})}))},
    {id:'variant',label:'显示版本',submenu:VARIANTS.map(item=>({id:'variant-'+item.id,label:item.name,type:'radio',enabled:skin.variants.includes(item.id),checked:(pet.variant??'pixel')===item.id,click:()=>update({variant:item.id})}))},
    {id:'scale',label:'桌宠大小',submenu:PET_SCALES.map(scale=>({label:scaleLabel(scale),type:'radio',checked:pet.scale===scale,click:()=>update({scale})}))},
    {type:'separator'},
    {id:'always-on-top',label:'始终置顶',type:'checkbox',checked:pet.alwaysOnTop,click:item=>update({alwaysOnTop:item.checked})},
    {id:'show-label',label:'显示状态提示',type:'checkbox',checked:pet.showLabel,click:item=>update({showLabel:item.checked})},
    {id:'follow',label:'会话跟随',submenu:[
      {label:'自动跟随所有来源',type:'radio',checked:pet.follow.mode==='global',click:()=>update({follow:{mode:'global'}})},
      ...[['dsh','DSH'],['cursor','Cursor'],['codex','Codex']].map(([source,name])=>({label:'仅跟随 '+name,type:'radio',checked:pet.follow.mode==='source'&&pet.follow.source===source,click:()=>update({follow:{mode:'source',source}})})),
      ...(pet.follow.mode==='session'?[{label:'已固定当前会话',type:'radio',checked:true,enabled:false}]:[]),
      {type:'separator'},{label:'选择指定会话…',click:openSettings},
    ]},
    ...(demo?[{id:'end-demo',label:'结束试映，恢复实时状态',click:endDemo}]:[]),
    {type:'separator'},
    {id:'visibility',label:petIsVisible(pet)?'隐藏桌宠':'显示桌宠',sublabel:'可从托盘或工作台显示',click:()=>update(visibilityPatch(!petIsVisible(pet)))},
  ];
}
