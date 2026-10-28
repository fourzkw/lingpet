import {applyTheme} from './theme.js';
import {PET_SCALES,scaleStep,scaleLabel} from '../src/pet-display.js';
const api=window.quickControls,$=id=>document.getElementById(id);
let editing=false,saving=Promise.resolve(),revision=0;
for(let i=0;i<9;i++){const tick=document.createElement('span');tick.className=i===4?'normal':'';$('ticks').append(tick);}
function renderScale(step){$('scale').value=String(step);$('scaleValue').value=scaleLabel(PET_SCALES[step]);$('scale').setAttribute('aria-valuetext',`第 ${step+1} 档，共 9 档，${scaleLabel(PET_SCALES[step])}`);[...$('ticks').children].forEach((tick,index)=>tick.classList.toggle('selected',index===step));}
function error(error){$('error').textContent=error.message;$('error').hidden=false;}
async function act(id,checked){try{await api.act({id,checked});await refresh();}catch(e){error(e);}}
function renderItems(items,parent){
  for(const item of items){
    if(item.type==='separator'){if(parent.children.length)parent.append(document.createElement('hr'));continue;}
    if(!item.enabled&&item.type==='normal'&&!item.children)continue;
    if(item.children){const details=document.createElement('details'),summary=document.createElement('summary'),children=document.createElement('div');details.dataset.id=item.id;summary.textContent=item.label;children.className='children';renderItems(item.children,children);details.append(summary,children);parent.append(details);continue;}
    const button=document.createElement('button');button.textContent=item.label;button.dataset.action=item.id;button.disabled=!item.enabled;
    if(['radio','checkbox'].includes(item.type)){button.setAttribute('role',item.type==='radio'?'menuitemradio':'menuitemcheckbox');button.setAttribute('aria-checked',String(item.checked));if(item.checked){const mark=document.createElement('span');mark.className='check';mark.textContent='✓';button.append(mark);}}
    button.onclick=()=>act(item.id,!item.checked);parent.append(button);
  }
}
async function refresh(){
  const request=++revision,value=await api.get();if(request!==revision)return;
  applyTheme(value.theme);$('petName').textContent=value.name;
  if(!editing)renderScale(scaleStep(value.scale));
  // Session ticks update the size without replacing controls under the pointer.
  const signature=JSON.stringify(value.items);if($('actions').dataset.signature===signature)return;
  const open=new Set([...document.querySelectorAll('details[open]')].map(node=>node.dataset.id));
  const focused=document.activeElement?.dataset.action;
  $('actions').replaceChildren();renderItems(value.items,$('actions'));$('actions').dataset.signature=signature;
  for(const node of document.querySelectorAll('details'))node.open=open.has(node.dataset.id);
  if(focused)[...document.querySelectorAll('[data-action]')].find(node=>node.dataset.action===focused)?.focus();
}
$('scale').oninput=()=>{
  editing=true;const step=Number($('scale').value);renderScale(step);
  // Serialize writes so rapid dragging cannot leave an older value saved last.
  saving=saving.then(()=>api.act({id:'scale',step})).catch(error);
};
$('scale').onchange=async()=>{await saving;editing=false;await refresh();};
$('scale').onblur=async()=>{await saving;editing=false;await refresh();};
$('close').onclick=()=>api.close();document.addEventListener('keydown',event=>{if(event.key==='Escape')api.close();});
document.addEventListener('contextmenu',event=>event.preventDefault());
api.onUpdate(()=>refresh().catch(error));await refresh();
