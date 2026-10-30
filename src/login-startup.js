import path from 'node:path';
export function loginStartupOptions({enabled,executable,root,packaged=false,platform=process.platform}){
  if(platform!=='win32'&&!(platform==='darwin'&&packaged))throw new Error('当前平台的开机启动尚不可用');
  return {name:'LingPet',openAtLogin:Boolean(enabled),path:executable,args:packaged?['--login']:[path.join(root,'desktop/main.js'),'--login']};
}

export function configureLoginStartup(app,settings){
  const options=loginStartupOptions(settings);
  const windows=(settings.platform??process.platform)==='win32';
  // openAtLogin reads the AppUserModelId registry value on Windows.
  if(windows)app.setAppUserModelId(options.name);
  app.setLoginItemSettings(options);
  const status=app.getLoginItemSettings({path:options.path,args:options.args});
  if(!windows)return status.openAtLogin;
  // openAtLogin verifies the full command; launchItems additionally checks approval.
  // Electron's launchItems.args omits switches such as --login.
  const normalize=value=>path.win32.normalize(value).toLowerCase();
  return status.openAtLogin&&(status.launchItems??[]).some(item=>item.name===options.name&&item.scope==='user'&&item.enabled===true&&normalize(item.path)===normalize(options.path));
}
