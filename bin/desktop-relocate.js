import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {dataDirectory} from '../src/paths.js';
import {relocateDesktopData} from '../src/maintenance/desktop-data.js';
const root=process.env.LINGPET_INSTALL_ROOT,dir=dataDirectory(),target=process.argv[2];
try{
  if(!root)throw Error('缺少本体安装目录');
  const result=await relocateDesktopData({root,dir,target});
  await writeFile(path.join(root,'storage-move-result.json'),JSON.stringify({ok:true,...result},null,2));
}catch(error){
  if(root)await writeFile(path.join(root,'storage-move-result.json'),JSON.stringify({ok:false,error:error.message},null,2)).catch(()=>{});
  process.stderr.write(error.message+'\n');process.exitCode=1;
}
