import path from 'node:path';
export function loginStartupOptions({enabled,executable,root,packaged=false,platform=process.platform}){
  if(platform!=='win32'&&!(platform==='darwin'&&packaged))throw new Error('当前平台的开机启动尚不可用');
  return {name:'LingPet',openAtLogin:Boolean(enabled),path:executable,args:packaged?['--login']:[path.join(root,'desktop/main.js'),'--login']};
}
