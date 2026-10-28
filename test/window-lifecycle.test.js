import test from 'node:test';
import assert from 'node:assert/strict';
import {liveContents,isWindowSender,loadPaintedWindow,showLoadedWindow} from '../desktop/window-lifecycle.js';
import {EventEmitter} from 'node:events';

function windowFixture(){
  let destroyed=false,contentsDestroyed=false;
  const contents={isDestroyed:()=>contentsDestroyed};
  return {
    win:{isDestroyed:()=>destroyed,get webContents(){
      if(destroyed)throw new Error('Object has been destroyed');
      return contents;
    }},contents,
    close:()=>{destroyed=true;contentsDestroyed=true;},
    destroyContents:()=>{contentsDestroyed=true;},
  };
}

test('closing settings does not throw or prevent IPC from the live pet',()=>{
  const pet=windowFixture(),settings=windowFixture();
  settings.close();
  assert.equal(liveContents(settings.win),null);
  assert.equal(isWindowSender({sender:pet.contents},settings.win,pet.win),true);
  assert.equal(isWindowSender({sender:pet.contents},pet.win,settings.win),true);
  assert.equal(isWindowSender({sender:settings.contents},pet.win,settings.win),false);
});

test('only live registered windows can send IPC, including after settings is reopened',()=>{
  const pet=windowFixture(),oldSettings=windowFixture(),newSettings=windowFixture(),outsider=windowFixture();
  oldSettings.close();
  assert.equal(isWindowSender({sender:newSettings.contents},pet.win,newSettings.win),true);
  assert.equal(isWindowSender({sender:oldSettings.contents},pet.win,newSettings.win),false);
  assert.equal(isWindowSender({sender:outsider.contents},pet.win,newSettings.win),false);
  assert.equal(isWindowSender({},pet.win,null),false);
  pet.close();newSettings.close();
  assert.equal(isWindowSender({sender:outsider.contents},pet.win,newSettings.win),false);
  assert.equal(liveContents(undefined),null);
});

test('a destroyed renderer is rejected even while its BrowserWindow remains alive',()=>{
  const pet=windowFixture();pet.destroyContents();
  assert.equal(liveContents(pet.win),null);
  assert.equal(isWindowSender({sender:pet.contents},pet.win),false);
});

function loadingWindow(){
  const win=Object.assign(new EventEmitter(),windowFixture().win);
  let resolve,reject;
  win.loadFile=()=>new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {win,loaded:()=>resolve(),failed:()=>reject(new Error('missing page'))};
}

for(const first of ['load','paint'])test(`window display waits for navigation and first paint (${first} first)`,async()=>{
  const fixture=loadingWindow();let ready=false;
  const pending=loadPaintedWindow(fixture.win,'settings.html').then(()=>{ready=true;});
  if(first==='load')fixture.loaded();else fixture.win.emit('ready-to-show');
  await new Promise(resolve=>setImmediate(resolve));assert.equal(ready,false);
  if(first==='load')fixture.win.emit('ready-to-show');else fixture.loaded();
  await pending;assert.equal(ready,true);
  assert.equal(fixture.win.listenerCount('closed'),0);
  assert.equal(fixture.win.listenerCount('ready-to-show'),0);
});

test('failed navigation and closing before paint reject readiness and clean listeners',async()=>{
  for(const failure of ['load','close']){
    const fixture=loadingWindow(),pending=loadPaintedWindow(fixture.win,'settings.html');
    if(failure==='load')fixture.failed();else fixture.win.emit('closed');
    await assert.rejects(pending);
    assert.equal(fixture.win.listenerCount('closed'),0);
    assert.equal(fixture.win.listenerCount('ready-to-show'),0);
  }
});

test('reopening restores a minimized window and ignores a destroyed window',()=>{
  const fixture=windowFixture(),calls=[];
  Object.assign(fixture.win,{isMinimized:()=>true,restore:()=>calls.push('restore'),show:()=>calls.push('show'),focus:()=>calls.push('focus')});
  showLoadedWindow(fixture.win);assert.deepEqual(calls,['restore','show','focus']);
  fixture.close();showLoadedWindow(fixture.win);assert.equal(calls.length,3);
});
