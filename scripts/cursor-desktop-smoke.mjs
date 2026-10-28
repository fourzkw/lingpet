import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {startCursorService} from '../src/cursor-service.js';
import {PACKAGE_ROOT} from '../src/paths.js';

export async function checkCursorDesktop({dashboard,dir,store,out,expect}){
  const service=await startCursorService(dir,{autoStart:false,ownerCheck:async()=>true});
  if(!service)throw new Error('Isolated Cursor bridge already running');
  const run=(hook,extra={})=>new Promise((resolve,reject)=>{
    const env={...process.env,ELECTRON_RUN_AS_NODE:'1',BOARD_PET_DATA_DIR:dir};
    const child=spawn(process.execPath,[path.join(PACKAGE_ROOT,'bin/cursor-hook.js'),hook],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let error='';child.stderr.on('data',v=>error+=v);child.on('error',reject);child.on('exit',code=>code?reject(new Error(error||'Hook failed')):resolve());
    child.stdin.end(JSON.stringify({conversation_id:'cursor-desktop-smoke',generation_id:'generation-1',hook_event_name:hook,...extra}));
  });
  async function waitState(state){
    for(let i=0;i<100;i++){if(store.current().source==='cursor'&&store.current().state===state)return true;await new Promise(resolve=>setTimeout(resolve,20));}
    return false;
  }
  try{
    await run('beforeSubmitPrompt',{prompt:'This content must not cross the bridge'});
    expect(await waitState('thinking'),'Cursor hook reaches real desktop as thinking');
    for(const tool_use_id of ['a','b'])await run('preToolUse',{tool_use_id});
    await run('postToolUse',{tool_use_id:'a'});
    expect(await waitState('working'),'Cursor parallel tools keep desktop working');
    await new Promise(resolve=>setTimeout(resolve,100));
    expect(await dashboard.webContents.executeJavaScript("document.getElementById('currentSource').textContent.startsWith('Cursor')"),'workbench identifies Cursor source');
    await dashboard.webContents.executeJavaScript("document.getElementById('sourceFilter').value='cursor';document.getElementById('sourceFilter').dispatchEvent(new Event('change'))");
    expect(await dashboard.webContents.executeJavaScript("[...document.querySelectorAll('.session')].every(s=>s.textContent.includes('Cursor'))&&document.querySelectorAll('.session').length===1"),'workbench filters sessions by Cursor');
    await new Promise(resolve=>setTimeout(resolve,500));
    await writeFile(path.join(out,'cursor-workbench.png'),(await dashboard.webContents.capturePage()).toPNG());
    await run('postToolUseFailure',{tool_use_id:'b'});expect(await waitState('thinking'),'Cursor tool failure does not fail whole turn');
    await run('stop',{status:'completed'});expect(await waitState('done'),'Cursor completed turn celebrates');
    await service.close();expect(store.current().state==='offline','Cursor bridge disconnect reaches desktop');
    expect(!JSON.stringify(store.snapshot()).includes('This content must not cross'),'Cursor prompt never reaches desktop snapshot');
    await dashboard.webContents.executeJavaScript("document.getElementById('sourceFilter').value='';document.getElementById('sourceFilter').dispatchEvent(new Event('change'))");
  }finally{await service.close();}
}
