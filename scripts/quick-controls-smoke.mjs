import assert from 'node:assert/strict';
import {BrowserWindow} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {PACKAGE_ROOT,dataDirectory} from '../src/paths.js';
import {readEndpoint,request} from '../src/bridge-client.js';

export async function runQuickControlsSmoke(petWindow){
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const original=await petWindow.webContents.executeJavaScript('window.pet.get()');
  const endpoint=await readEndpoint(dataDirectory()),manage=body=>request(endpoint,'/pets/manage',body);
  const created=await manage({action:'create',value:{name:'不应被调整的桌宠'}});
  const other=created.pets.at(-1);await pause(500);
  const open=async()=>{
    await petWindow.webContents.executeJavaScript("document.getElementById('pet').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))");
    let popup;
    for(let i=0;i<100;i++){popup=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='桌宠快捷栏');if(popup?.isVisible())break;await pause(30);}
    assert.ok(popup?.isVisible(),'right click opens painted popup');
    await popup.webContents.executeJavaScript("import('./quick-controls.js').then(()=>true)");return popup;
  };
  const popup=await open();
  assert.ok(!BrowserWindow.getAllWindows().some(w=>w.getTitle().includes('多桌宠工作台')),'right click does not open workbench');
  const layout=await popup.webContents.executeJavaScript("({type:document.getElementById('scale').type,ticks:document.querySelectorAll('#ticks span').length,bottom:document.getElementById('scale').getBoundingClientRect().bottom,height:innerHeight})");
  assert.equal(layout.type,'range');assert.equal(layout.ticks,9);assert.ok(layout.bottom<layout.height);
  for(const [key,scale] of [['Home',.5],['End',1.5],['Left',1.375]]){
    await popup.webContents.executeJavaScript("document.getElementById('scale').focus()");
    popup.webContents.sendInputEvent({type:'keyDown',keyCode:key});popup.webContents.sendInputEvent({type:'keyUp',keyCode:key});await pause(200);
    const value=await petWindow.webContents.executeJavaScript('window.pet.get()');
    assert.equal(value.settings.scale,scale,'keyboard updates clicked pet');assert.equal(value.pets.find(p=>p.id===other.id).scale,1,'other pet unaffected');
    assert.equal(popup.isVisible(),true,'adjusting size leaves popup open');
  }
  const rect=await popup.webContents.executeJavaScript("(()=>{const r=document.getElementById('scale').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),left:Math.round(r.x+8)}})()");
  popup.webContents.sendInputEvent({type:'mouseDown',x:rect.x,y:rect.y,button:'left',clickCount:1});
  popup.webContents.sendInputEvent({type:'mouseMove',x:rect.left,y:rect.y,button:'left',buttons:['left']});
  popup.webContents.sendInputEvent({type:'mouseUp',x:rect.left,y:rect.y,button:'left',clickCount:1});await pause(300);
  assert.equal((await petWindow.webContents.executeJavaScript('window.pet.get()')).settings.scale,.5,'native pointer drag commits smallest size');
  await petWindow.webContents.executeJavaScript('window.pet.settings({scale:1})');await pause(150);
  assert.equal(await popup.webContents.executeJavaScript("document.getElementById('scale').value"),'4','external update syncs slider');
  const out=path.join(PACKAGE_ROOT,'artifacts/quick-controls-smoke');await mkdir(out,{recursive:true});
  await writeFile(path.join(out,'inline-slider.png'),(await popup.webContents.capturePage()).toPNG());
  popup.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});await pause(150);assert.ok(popup.isDestroyed());
  const reopened=await open();assert.equal(await reopened.webContents.executeJavaScript("document.getElementById('scale').value"),'4','reopening retains size');
  petWindow.focus();await pause(150);assert.ok(reopened.isDestroyed(),'outside focus dismisses popup');
  await petWindow.webContents.executeJavaScript(`window.pet.settings({scale:${original.settings.scale}})`);
  await manage({action:'remove',id:other.id});
  return ['right-click popup shows inline nine-step ruler immediately','native keyboard and pointer adjust only the clicked pet without closing popup','size sync, Escape, outside focus dismissal and reopen work'];
}
