import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {dataDirectory} from '../src/paths.js';
import {installDesktop} from '../src/maintenance/desktop-install.js';
import {IntegrationManager} from '../src/integrations/manager.js';
import {json,atomic} from '../src/integrations/files.js';
import {readEndpoint,request} from '../src/bridge-client.js';
import {rm} from 'node:fs/promises';

const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined,root=option('--root')||process.env.LINGPET_INSTALL_ROOT,dir=dataDirectory(option('--data')||process.env.BOARD_PET_DATA_DIR||(root?path.join(root,'data'):undefined));
const run=promisify(execFile);
const powershell=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
try{
  if(!root)throw Error('缺少安装目录');
  if(args.includes('--uninstall')){
    if(process.env.LINGPET_MAINTENANCE_HELPER!=='1')throw Error('请通过 LingPetMaintenance.exe 卸载本体');
    const install=await json(path.join(dir,'desktop-install.json'),null);if(!install||path.resolve(install.root)!==path.resolve(root))throw Error('安装目录与记录不一致');
    const app=path.resolve(fileURLToPath(new URL('..',import.meta.url))),pkg=await json(path.join(app,'package.json'),null);
    const manager=new IntegrationManager({dir,root:app,bridge:path.join(root,'LingPetBridge.exe'),version:pkg.version});
    for(const item of await manager.records())if(item.state!=='removed')await manager.remove(item.id);
    const endpoint=await readEndpoint(dir);if(endpoint)await request(endpoint,'/quit',{});
    if(install.systemRegistered){
      const script=String.raw`$root=$env:LINGPET_INSTALL_ROOT; $key='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; $value=(Get-ItemProperty -LiteralPath $key -Name LingPet -ErrorAction SilentlyContinue).LingPet; if($value -and $value.Contains([IO.Path]::Combine($root,'LingPet.exe'))){Remove-ItemProperty -LiteralPath $key -Name LingPet}; $key='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LingPet'; $value=(Get-ItemProperty -LiteralPath $key -Name UninstallString -ErrorAction SilentlyContinue).UninstallString; if($value -eq ('"'+[IO.Path]::Combine($root,'LingPetMaintenance.exe')+'"')){Remove-Item -LiteralPath $key}`;
      await run(powershell,['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,LINGPET_INSTALL_ROOT:root},windowsHide:true});
      const shortcuts=String.raw`$root=$env:LINGPET_INSTALL_ROOT; $w=New-Object -ComObject WScript.Shell; foreach($f in @([IO.Path]::Combine([Environment]::GetFolderPath('Desktop'),'灵伴.lnk'),[IO.Path]::Combine([Environment]::GetFolderPath('StartMenu'),'Programs','灵伴.lnk'))){if(Test-Path -LiteralPath $f){$s=$w.CreateShortcut($f); if($s.TargetPath -eq [IO.Path]::Combine($root,'LingPet.exe')){Remove-Item -LiteralPath $f}}}`;
      await run(powershell,['-NoProfile','-NonInteractive','-Command',shortcuts],{env:{...process.env,LINGPET_INSTALL_ROOT:root},windowsHide:true});
    }
    await rm(path.join(dir,'desktop-install.json'),{force:true});
    // The native maintenance helper removes program files after this process exits.
  }else{
    const result=await installDesktop({payload:option('--payload'),root,dir,launchArguments:args.includes('--test-no-sandbox')?['--no-sandbox','--disable-gpu']:[]});
    if(!args.includes('--no-shortcuts')){
      const script=String.raw`$root=$env:LINGPET_INSTALL_ROOT; $w=New-Object -ComObject WScript.Shell; foreach($folder in @([Environment]::GetFolderPath('Desktop'),[IO.Path]::Combine([Environment]::GetFolderPath('StartMenu'),'Programs'))){$s=$w.CreateShortcut([IO.Path]::Combine($folder,'灵伴.lnk')); $s.TargetPath=[IO.Path]::Combine($root,'LingPet.exe'); $s.Arguments='--dashboard'; $s.Save()}; $key='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LingPet'; New-Item -Path $key -Force | Out-Null; New-ItemProperty -LiteralPath $key -Name DisplayName -Value '灵伴 LingPet' -Force | Out-Null; New-ItemProperty -LiteralPath $key -Name UninstallString -Value ('"'+[IO.Path]::Combine($root,'LingPetMaintenance.exe')+'"') -Force | Out-Null; New-ItemProperty -LiteralPath $key -Name DisplayVersion -Value $env:LINGPET_VERSION -Force | Out-Null`;
      await run(powershell,['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,LINGPET_INSTALL_ROOT:root,LINGPET_VERSION:result.version},windowsHide:true});
      const locations=String.raw`$key='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LingPet'; New-ItemProperty -LiteralPath $key -Name InstallLocation -Value $env:LINGPET_INSTALL_ROOT -Force | Out-Null; New-ItemProperty -LiteralPath $key -Name DataLocation -Value $env:LINGPET_DATA_DIR -Force | Out-Null`;
      await run(powershell,['-NoProfile','-NonInteractive','-Command',locations],{env:{...process.env,LINGPET_INSTALL_ROOT:root,LINGPET_DATA_DIR:dir},windowsHide:true});
      await atomic(path.join(dir,'desktop-install.json'),JSON.stringify({format:1,root,dataDir:dir,version:result.version,systemRegistered:true}));
    }
    process.stdout.write(JSON.stringify(result)+'\n');
  }
}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
