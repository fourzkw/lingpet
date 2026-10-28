import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {PACKAGE_ROOT} from '../src/paths.js';
import {request,readEndpoint} from '../src/bridge-client.js';

export async function runDesktopSmoke({app,petWindow,openSettings,getSettingsWindow,dir,store}){
  const out=path.join(PACKAGE_ROOT,'artifacts','desktop-smoke');await mkdir(out,{recursive:true});
  const results=[],failures=[];
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function ready(win){if(win.webContents.isLoading())await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));await pause(600);}
  function expect(value,message){results.push({message,pass:Boolean(value)});if(!value)failures.push(message);}
  try{
    await ready(petWindow);openSettings();const dashboard=getSettingsWindow();await ready(dashboard);
    dashboard.webContents.on('console-message',event=>{if(/error|failed/i.test(event.message))failures.push(event.message);});
    const assetReady=await dashboard.webContents.executeJavaScript(`(async()=>{try{const {readyPixelAssets}=await import('./pixel-pet.js');await readyPixelAssets();return 'ready';}catch(error){return error.stack||String(error);}})()`);
    expect(assetReady==='ready',`pixel action assets load: ${assetReady}`);
    const endpoint=await readEndpoint(dir);await request(endpoint,'/register',{instanceId:'desktop-smoke'});
    const emit=async(state,seq,turn=1)=>{await request(endpoint,'/event',{version:1,instanceId:'desktop-smoke',sessionId:'local-smoke-session',turn,state,seq});await pause(200);};
    await emit('working',1);await pause(400);
    expect(await dashboard.webContents.executeJavaScript("document.getElementById('connection').textContent.includes('已连接')"),'DSH connection indicator');
    expect(await dashboard.webContents.executeJavaScript("document.getElementById('currentState').textContent.includes('执行工具')"),'real state reaches dashboard');
    await writeFile(path.join(out,'claude-dashboard.png'),(await dashboard.webContents.capturePage()).toPNG());
    await dashboard.webContents.executeJavaScript("document.querySelector('[data-character=deepseek]').click()");await pause(900);
    expect(await dashboard.webContents.executeJavaScript("document.querySelector('[data-character=deepseek]').classList.contains('selected')"),'DeepSeek character toggle');
    expect(await petWindow.webContents.executeJavaScript("(()=>{const c=document.getElementById('sprite'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0;for(let i=3;i<d.length;i+=4)if(d[i]>25)count++;return count>1000&&count<d.length/4*0.9;})()"),'DeepSeek rendered with transparent surrounding area');
    await writeFile(path.join(out,'deepseek-dashboard.png'),(await dashboard.webContents.capturePage()).toPNG());
    await writeFile(path.join(out,'deepseek-pet.png'),(await petWindow.webContents.capturePage()).toPNG());
    await emit('approval',2);expect(await dashboard.webContents.executeJavaScript("document.getElementById('currentState').textContent==='等待批准'"),'approval state');
    await dashboard.webContents.executeJavaScript("document.querySelector('[data-demo=done]').click()");await pause(200);expect(await dashboard.webContents.executeJavaScript("document.getElementById('currentState').textContent.includes('演示')"),'manual demo clearly marked');
    await dashboard.webContents.executeJavaScript("document.getElementById('backLive').click()");await pause(200);expect(await dashboard.webContents.executeJavaScript("document.getElementById('currentState').textContent==='等待批准'"),'return from demo restores live state');
    await dashboard.webContents.executeJavaScript("document.querySelector('[data-character=claude]').click()");await pause(400);
    expect(await dashboard.webContents.executeJavaScript("document.getElementById('previewKind').textContent.includes('PIXEL 128')"),'128 pixel animation selected');
    await writeFile(path.join(out,'claude-dashboard.png'),(await dashboard.webContents.capturePage()).toPNG());
    await writeFile(path.join(out,'claude-pet.png'),(await petWindow.webContents.capturePage()).toPNG());
    const previews=await dashboard.webContents.executeJavaScript(`(async()=>{
      const {paint}=await import('./renderer.js');const canvas=document.createElement('canvas');canvas.width=360;canvas.height=360;const ctx=canvas.getContext('2d');
      return ['idle','thinking','working','input','approval','done','error','sleep'].map(state=>{paint(ctx,{settings:{character:'claude'},current:{state}},800,360,360);const d=ctx.getImageData(0,0,360,360).data;let ink=0,soft=0;for(let i=3;i<d.length;i+=4){if(d[i]>25)ink++;if(d[i]>0&&d[i]<255)soft++;}return {state,ink,soft,url:canvas.toDataURL()};});
    })()`);
    expect(previews.every(p=>p.ink>1000&&p.ink<360*360*0.65&&p.soft===0),'all eight Claude states render hard pixel edges and transparent surroundings');
    const animations=await dashboard.webContents.executeJavaScript(`(async()=>{
      const {paint,ORDER}=await import('./renderer.js');
      const canvas=document.createElement('canvas');canvas.width=384;canvas.height=384;const ctx=canvas.getContext('2d');
      const results=[];
      for(const character of ['claude','deepseek'])for(const state of ORDER){
        const frames=new Set();let crisp=true;
        for(let frame=0;frame<32;frame++){
          paint(ctx,{settings:{character},current:{state}},frame*100,384,384);
          frames.add(canvas.toDataURL());
          const data=ctx.getImageData(0,0,384,384).data;
          for(let i=3;i<data.length;i+=4)if(data[i]!==0&&data[i]!==255)crisp=false;
        }
        results.push({character,state,frames:frames.size,crisp});
      }
      return results;
    })()`);
    for(const result of animations)expect(result.frames>=4&&result.crisp,`${result.character} ${result.state}: changing frames and crisp pixels`);
    const authored=await dashboard.webContents.executeJavaScript(`(async()=>{
      const {paint}=await import('./renderer.js');const {CLAUDE_CLIPS,clipDuration}=await import('./claude-actions.js');
      // Keep each image below Chromium's canvas dimension limit.
      const strip=document.createElement('canvas');strip.width=768*40;strip.height=288;const output=strip.getContext('2d');
      const cell=document.createElement('canvas');cell.width=256;cell.height=256;const ctx=cell.getContext('2d');
      output.fillStyle='#191f2a';output.fillRect(0,0,strip.width,strip.height);
      const states=['input','working','done'];
      const labels=['Claude / 挥手','Claude / 打字','Claude / 庆祝跳跃'];
      for(let frame=0;frame<40;frame++)for(let index=0;index<3;index++){
        const state=states[index],time=frame*80;
        const elapsed=state==='done'?time%(clipDuration(CLAUDE_CLIPS.done)+500):time;
        paint(ctx,{settings:{character:'claude'},current:{state}},elapsed,256,256);
        output.drawImage(cell,frame*768+index*256,32);
        output.fillStyle='#f3eee8';output.font='14px sans-serif';
        output.fillText(labels[index],frame*768+index*256+60,28);
      }
      // Verify jump recovery is actually held in the runtime (the preview alone replays it).
      paint(ctx,{settings:{character:'claude'},current:{state:'done'}},2000,256,256);const landed=cell.toDataURL();
      paint(ctx,{settings:{character:'claude'},current:{state:'done'}},8000,256,256);
      return {url:strip.toDataURL(),jumpHeld:landed===cell.toDataURL()};
    })()`);
    expect(authored.jumpHeld,'authored jump plays once and holds its landed pose');
    await writeFile(path.join(out,'claude-actions-strip.png'),Buffer.from(authored.url.split(',')[1],'base64'));
    const complete=await dashboard.webContents.executeJavaScript(`(async()=>{
      const {paint,ORDER}=await import('./renderer.js');const {clipFrame,clipDuration}=await import('./action-clips.js');
      const definitions={claude:(await import('./claude-actions.js')).CLAUDE_CLIPS,deepseek:(await import('./deepseek-actions.js')).DEEPSEEK_CLIPS};
      const checks=[],strips=[];
      const cell=document.createElement('canvas');cell.width=192;cell.height=192;const ctx=cell.getContext('2d');
      for(const [character,clips] of Object.entries(definitions)){
      for(const state of ORDER){
        const clip=clips[state],strip=document.createElement('canvas');strip.width=192*60;strip.height=216;
        const art=strip.getContext('2d');art.fillStyle='#191f2a';art.fillRect(0,0,strip.width,strip.height);
        for(let frame=0;frame<60;frame++){
          const time=frame*80,elapsed=['done','error'].includes(state)?time%(clipDuration(clip)+650):time;
          paint(ctx,{settings:{character},current:{state}},elapsed,192,192);
          art.drawImage(cell,frame*192,24);art.fillStyle='#f3eee8';art.font='12px sans-serif';
          art.fillText(state+' / '+clip.name,frame*192+32,18);
        }
        strips.push({character,state,url:strip.toDataURL()});
      }
      // The full upper body is identical throughout continuous typing.
      const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const c=canvas.getContext('2d');
      const tops=new Set(),hands=new Set();
      const fixed=character==='claude'?64:80;
      for(let time=0;time<2000;time+=40){
        paint(c,{settings:{character},current:{state:'working'}},time,128,128);
        tops.add(Array.from(c.getImageData(0,0,128,fixed).data).join(','));
        hands.add(Array.from(c.getImageData(0,fixed,128,128-fixed).data).join(','));
      }
      checks.push({message:character+' typing head stays fixed and only hands/keys animate',pass:tops.size===1&&hands.size>=4});
      for(const state of ['sleep','approval']){
        const clip=clips[state],allowed=new Set(clip.frames.slice(clip.loopFrom));
        let safe=true;for(let time=clipDuration(clip);time<30000;time+=41)if(!allowed.has(clipFrame(clip,time)))safe=false;
        checks.push({message:character+' '+state+' holds waiting/sleep cycle without replaying entrance',pass:safe});
      }
      for(const state of ['done','error']){
        paint(c,{settings:{character},current:{state}},clipDuration(clips[state])+1000,128,128);const settled=canvas.toDataURL();
        paint(c,{settings:{character},current:{state}},15000,128,128);
        checks.push({message:character+' '+state+' holds recovered pose after one-time action',pass:settled===canvas.toDataURL()});
      }
      }
      return {strips,checks};
    })()`);
    for(const check of complete.checks)expect(check.pass,check.message);
    for(const strip of complete.strips)await writeFile(path.join(out,(strip.character==='claude'?'claude-v2-':'deepseek-v1-')+strip.state+'-strip.png'),Buffer.from(strip.url.split(',')[1],'base64'));
    // Export the exact runtime frames so the delivered preview shows the implementation.
    const strips=await dashboard.webContents.executeJavaScript(`(async()=>{
      const {paint}=await import('./renderer.js');const results=[];
      for(const state of ['idle','working']){
        const strip=document.createElement('canvas');strip.width=512*32;strip.height=288;const output=strip.getContext('2d');
        const cell=document.createElement('canvas');cell.width=256;cell.height=256;const ctx=cell.getContext('2d');
        output.fillStyle='#191f2a';output.fillRect(0,0,strip.width,strip.height);
        for(let frame=0;frame<32;frame++)for(const [index,character] of ['claude','deepseek'].entries()){
          paint(ctx,{settings:{character},current:{state}},frame*100,256,256);
          output.drawImage(cell,frame*512+index*256,32);
          output.fillStyle='#f3eee8';output.font='14px sans-serif';
          output.fillText((index?'DeepSeek':'Claude')+' / '+state,frame*512+index*256+60,28);
        }
        results.push({state,url:strip.toDataURL()});
      }
      return results;
    })()`);
    for(const strip of strips)await writeFile(path.join(out,`pixel-${strip.state}-strip.png`),Buffer.from(strip.url.split(',')[1],'base64'));
    for(const preview of previews)await writeFile(path.join(out,`claude-${preview.state}.png`),Buffer.from(preview.url.split(',')[1],'base64'));
    await emit('done',3);await pause(2100);expect(store.current().state==='idle','completion returns to idle');
    await request(endpoint,'/disconnect',{instanceId:'desktop-smoke'});await pause(200);expect(store.current().state==='offline','disconnect is not success');
    expect((await dashboard.webContents.executeJavaScript("({w:document.documentElement.scrollWidth,c:document.documentElement.clientWidth})")).w<=dashboard.getContentSize()[0],'dashboard has no horizontal overflow');
    const {checkCursorDesktop}=await import('./cursor-desktop-smoke.mjs');
    await checkCursorDesktop({dashboard,dir,store,out,expect});
  }catch(error){failures.push(error.stack);}
  finally{await writeFile(path.join(out,'results.json'),JSON.stringify({results,failures},null,2));console.log(JSON.stringify({results,failures}));app.exit(failures.length?1:0);}
}
