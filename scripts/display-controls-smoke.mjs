import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {PACKAGE_ROOT} from '../src/paths.js';

export async function runDisplayControlsSmoke(win){
  const result=await win.webContents.executeJavaScript(`(async()=>{
    const check=(value,message)=>{if(!value)throw new Error(message);};
    const $=id=>document.getElementById(id),wait=ms=>new Promise(r=>setTimeout(r,ms));
    const original=await window.pet.get(),follow=JSON.stringify(original.settings.follow);
    check(!document.querySelector('#petEnabled'),'no enabled switch');
    check(![...document.querySelectorAll('button')].some(b=>b.textContent==='新建角色'),'no create character button');
    check($('scale').type==='range'&&$('scale').min==='0'&&$('scale').max==='8'&&$('scale').step==='1','nine step range');
    check(document.querySelectorAll('.scale-ticks span').length===9,'nine visible ruler ticks');
    await window.pet.manage({action:'create',value:{name:'旧版暂停兼容验证',enabled:false,petVisible:true,follow:original.settings.follow}});await wait(120);
    const temporary=(await window.pet.get()).activePetId;
    check($('showPet').textContent.includes('显示'),'legacy paused pet is hidden');
    await $('showPet').onclick();
    let value=await window.pet.get();check(value.settings.enabled&&value.settings.petVisible,'one show action recovers paused pet');
    await $('showPet').onclick();value=await window.pet.get();
    check(value.settings.enabled&&!value.settings.petVisible,'hide preserves enabled session tracking');
    check(JSON.stringify(value.settings.follow)===follow,'follow preserved');
    await $('showPet').onclick();
    await window.pet.manage({action:'remove',id:temporary});
    await window.pet.manage({action:'select',id:original.activePetId});await wait(100);
    for(const [step,scale] of [[0,.5],[4,1],[8,1.5]]){
      $('scale').value=String(step);$('scale').oninput();
      await window.pet.settings({showLabel:original.settings.showLabel});await wait(100);
      check($('scale').value===String(step),'broadcast must preserve pending slider edit');
      await $('scale').onchange();
      check((await window.pet.get()).settings.scale===scale,'slider commits '+scale);
      check($('scaleValue').textContent.includes(String(scale*100)+'%'),'slider label reflects saved scale');
    }
    await window.pet.settings({scale:1});await wait(100);
    check($('scale').value==='4'&&$('scaleValue').textContent.includes('正常'),'middle step is normal');
    $('scale').scrollIntoView({block:'center'});
    return {checks:['one show/hide control including legacy paused recovery','hidden pet retains session following','nine ruler steps commit 50%, 100%, 150%','live broadcasts preserve pending slider edits'],original:original.settings};
  })()`);
  const out=path.join(PACKAGE_ROOT,'artifacts/display-controls-smoke');await mkdir(out,{recursive:true});
  for(const width of [1130,850]){
    win.setSize(width,850);await new Promise(r=>setTimeout(r,200));
    await win.webContents.executeJavaScript("document.getElementById('scale').scrollIntoView({block:'center'})");
    await writeFile(path.join(out,`workbench-${width}.png`),(await win.webContents.capturePage()).toPNG());
  }
  win.setSize(850,680);await new Promise(r=>setTimeout(r,200));
  await win.webContents.executeJavaScript('window.scrollTo(0,0)');
  assert.ok(await win.webContents.executeJavaScript("document.getElementById('showPet').getBoundingClientRect().bottom<=innerHeight"),'visibility control stays visible at minimum size');
  await writeFile(path.join(out,'workbench-minimum.png'),(await win.webContents.capturePage()).toPNG());
  result.checks.push('show/hide stays visible at minimum window size');
  await win.webContents.executeJavaScript(`window.pet.settings(${JSON.stringify(result.original)})`);
  return result.checks;
}
