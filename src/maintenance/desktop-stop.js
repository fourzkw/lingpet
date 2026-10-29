import {readEndpoint,request} from '../bridge-client.js';

function running(pid){
  if(!Number.isInteger(pid)||pid<=0)return false;
  try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}
}

export async function stopDesktopForUpgrade(dir,{timeoutMs=20000,intervalMs=100}={}){
  const endpoint=await readEndpoint(dir);if(!endpoint)return;
  let health;
  try{health=await request(endpoint,'/health');}catch{
    if(running(endpoint.pid))throw Error('无法连接正在运行的灵伴，请从托盘退出后重试安装。');
    return;
  }
  if(health.name!=='board-ai-pet'||health.distribution!=='desktop')throw Error('该服务不是独立安装的灵伴，未自动关闭。请手动退出后重试安装。');
  if(!Number.isInteger(endpoint.pid)||endpoint.pid<=0)throw Error('灵伴运行记录缺少有效进程信息，请从托盘退出后重试安装。');
  try{await request(endpoint,'/quit',{},5000);}catch(error){throw Error('灵伴未能正常退出，未继续安装。请从托盘退出后重试。'+error.message);}
  const deadline=Date.now()+timeoutMs;
  while(running(endpoint.pid)){
    if(Date.now()>=deadline)throw Error('灵伴尚未退出，未继续安装。请从托盘退出后重试；如 Bridge 文件被占用，请退出相关 Agent 宿主。');
    await new Promise(resolve=>setTimeout(resolve,intervalMs));
  }
}
