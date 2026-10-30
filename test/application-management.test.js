import test from 'node:test';
import assert from 'node:assert/strict';
import {loginStartupOptions,configureLoginStartup} from '../src/login-startup.js';
import {diagnosticReport} from '../src/diagnostics.js';
import {PetRegistry} from '../src/pet-registry.js';
test('Windows development runtime registers explicit Electron entry arguments for login startup',()=>{
  const result=loginStartupOptions({enabled:true,executable:'C:/app/electron.exe',root:'C:/app',platform:'win32'});
  assert.equal(result.openAtLogin,true);assert.match(result.args[0],/desktop[\\/]main.js$/);assert.equal(result.args[1],'--login');
  assert.equal(loginStartupOptions({enabled:false,executable:'app',root:'root',platform:'win32'}).openAtLogin,false);
  assert.throws(()=>loginStartupOptions({enabled:true,platform:'linux'}));
});
test('Windows aligns AppUserModelId with the named startup entry before verification',()=>{
  const settings={enabled:true,executable:'C:/Program Files/灵伴/LingPet.exe',root:'C:/app',packaged:true,platform:'win32'};
  let written,identity;
  const app={setAppUserModelId(value){identity=value;},setLoginItemSettings(value){assert.equal(identity,value.name);written=value;},getLoginItemSettings(query){
    assert.deepEqual(query,{path:settings.executable,args:['--login']});
    return {openAtLogin:true,launchItems:[{name:'LingPet',scope:'user',enabled:true,path:'c:\\Program Files\\灵伴\\LingPet.exe',args:[]}]};
  }};
  assert.equal(configureLoginStartup(app,settings),true);assert.equal(written.name,'LingPet');
});

test('Windows rejects disabled, unrelated and mismatched login entries',()=>{
  const settings={enabled:true,executable:'C:/app/LingPet.exe',root:'C:/app',packaged:true,platform:'win32'};
  const item={name:'LingPet',scope:'user',enabled:true,path:settings.executable,args:['--login']};
  for(const patch of [{enabled:false},{name:'Other'},{scope:'machine'},{path:'C:/other/LingPet.exe'},{openAtLogin:false}]){
    const app={setAppUserModelId(){},setLoginItemSettings(){},getLoginItemSettings(){return {openAtLogin:patch.openAtLogin??true,launchItems:[{...item,...patch}]};}};
    assert.equal(configureLoginStartup(app,settings),false);
  }
});

test('Windows confirms removal without depending on an unrelated default entry',()=>{
  const app={setAppUserModelId(){},setLoginItemSettings(options){assert.equal(options.openAtLogin,false);},getLoginItemSettings(){return {openAtLogin:true,launchItems:[]};}};
  assert.equal(configureLoginStartup(app,{enabled:false,executable:'C:/app/LingPet.exe',root:'C:/app',packaged:true,platform:'win32'}),false);
});

test('macOS preserves native login status verification',()=>{
  const app={setLoginItemSettings(){},getLoginItemSettings(){return {openAtLogin:true};}};
  assert.equal(configureLoginStartup(app,{enabled:true,executable:'/Applications/LingPet.app',root:'/app',packaged:true,platform:'darwin'}),true);
});

test('diagnostics summarize connectivity without session IDs, payloads or secret fields',()=>{
  const pets=new PetRegistry({}).pets;
  const report=diagnosticReport({release:{version:'0.5.0'},pets,sessions:[{source:'codex',sessionId:'PRIVATE_ID',connected:true,payload:'SECRET_TEXT'}],uptime:99.4,memory:{rss:100},logs:[],update:{phase:'idle'},platform:'win32',login:false});
  assert.equal(report.connections.connected,1);assert.equal(report.uptimeSeconds,99);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_ID'));assert.ok(!JSON.stringify(report).includes('SECRET_TEXT'));
});
test('interaction preferences persist per pet and reject unsupported sensitivity',()=>{
  const registry=new PetRegistry({}),first=registry.pets[0],other=registry.create({headPat:false,patSensitivity:'sensitive'});
  registry.update(first.id,{clickResponse:false,interactionHints:false,patSensitivity:'gentle'});
  const restored=new PetRegistry(registry.config);assert.equal(restored.get(first.id).clickResponse,false);assert.equal(restored.get(other.id).patSensitivity,'sensitive');assert.equal(restored.get(other.id).headPat,false);
  assert.throws(()=>registry.update(first.id,{patSensitivity:'extreme'}));
});
