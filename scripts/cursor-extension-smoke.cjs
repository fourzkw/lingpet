const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const vscode=require('vscode');
exports.run=async()=>{
  const results=[];
  try{
    const extension=vscode.extensions.getExtension('local-board-pet.board-pet');assert.ok(extension,'extension discovered; available: '+vscode.extensions.all.map(e=>e.id).filter(id=>/board|pet/i.test(id)).join(','));
    const api=await extension.activate();results.push('extension activated in real Cursor host');
    await vscode.commands.executeCommand('workbench.view.extension.board-pet');results.push('activity bar view opens');
    let status=await api.status();assert.match(status.hookRegistration,/已注册|本地插件已安装|用户级 Hooks 已配置/);results.push('Cursor native hooks ready through supported registration path');
    await vscode.commands.executeCommand('board-pet.start');
    for(let i=0;i<50;i++){status=await api.status();if(status.pet.running)break;await new Promise(resolve=>setTimeout(resolve,200));}
    assert.equal(status.pet.running,true);results.push('start command launches real isolated desktop pet');
    const dashboard=await vscode.commands.executeCommand('board-pet.dashboard');assert.equal(dashboard.ok,true);results.push('dashboard command opens real workbench');
    const stop=await vscode.commands.executeCommand('board-pet.stop');assert.equal(stop.ok,true);
    for(let i=0;i<40;i++){status=await api.status();if(!status.pet.running)break;await new Promise(resolve=>setTimeout(resolve,100));}
    assert.equal(status.pet.running,false);results.push('stop command exits isolated pet and suspends auto-wake');
    assert.ok(await fs.readFile(path.join(process.env.BOARD_PET_DATA_DIR,'runtime.paused'),'utf8'));
    await fs.mkdir(process.env.BOARD_PET_SIDEBAR_RESULTS,{recursive:true});
    await fs.writeFile(path.join(process.env.BOARD_PET_SIDEBAR_RESULTS,'results.json'),JSON.stringify({results,failures:[]},null,2));
    console.log(JSON.stringify({results,failures:[]}));
  }catch(error){
    await fs.mkdir(process.env.BOARD_PET_SIDEBAR_RESULTS,{recursive:true});
    await fs.writeFile(path.join(process.env.BOARD_PET_SIDEBAR_RESULTS,'results.json'),JSON.stringify({results,failures:[error.stack]},null,2));throw error;
  }
};
