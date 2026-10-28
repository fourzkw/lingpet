import {app,BrowserWindow,screen} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {beginPetDrag,petWindowSize} from '../desktop/window-geometry.js';
app.on('window-all-closed',()=>{});

// Run with Electron and --force-device-scale-factor=1.25 (or 1.5) for Windows DPI QA.
// Let Electron finish loading the entry module before waiting for app readiness.
async function run(){
await app.whenReady();
const factor=screen.getPrimaryDisplay().scaleFactor;
const out=path.resolve('artifacts','drag-size');
const results=[];
let win;
try{
  const area=screen.getPrimaryDisplay().workArea;
  for(const scale of [.75,1,1.25,1.5]){
    const size=petWindowSize(scale);
    win=new BrowserWindow({...size,x:area.x+30,y:area.y+30,show:false,frame:false,transparent:true,resizable:false,hasShadow:false});
    const initial=win.getSize();
    // Observe the old repeated setPosition path for comparison, without using it in the fix.
    for(let i=0;i<20;i++)win.setPosition(area.x+30+i%2,area.y+30);
    const legacyAfter=win.getSize();
    win.setBounds({x:area.x+30,y:area.y+30,...size},false);
    const move=beginPetDrag(win,{x:area.x+50,y:area.y+50},scale);
    const samples=[];
    for(let i=0;i<120;i++){
      move({x:area.x+50+i%30,y:area.y+50+Math.floor(i/30)});
      const [width,height]=win.getSize();samples.push({width,height});
      assert.ok(Math.abs(width-size.width)<=2&&Math.abs(height-size.height)<=2,`size drift at DPI ${factor}, pet scale ${scale}: ${width}x${height}`);
    }
    const stationary=win.getBounds();
    for(let i=0;i<750;i++)assert.equal(move({x:area.x+79,y:area.y+53}),false);
    assert.deepEqual(win.getBounds(),stationary);
    const spread=axis=>Math.max(...samples.map(s=>s[axis]))-Math.min(...samples.map(s=>s[axis]));
    assert.ok(spread('width')<=1&&spread('height')<=1,'drag cannot accumulate growth');
    results.push({scale,expected:size,initial,legacyAfter,final:win.getSize(),samples:samples.length,stationaryTicks:750,pass:true});
    win.destroy();win=null;
  }
  await mkdir(out,{recursive:true});
  await writeFile(path.join(out,`dpi-${factor}.json`),JSON.stringify({factor,results},null,2));
  console.log(JSON.stringify({factor,results}));app.exit(0);
}catch(error){console.error(error);win?.destroy();app.exit(1);}
}
void run();
