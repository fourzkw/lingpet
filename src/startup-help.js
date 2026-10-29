export function nodeSupported(version=process.versions.node){
 const [major,minor]=version.replace(/^v/,'').split('.').map(Number);
 return major>22||major===22&&minor>=19;
}
export function startupHelp(error,dir){
 const reason=String(error?.code||'')+' '+String(error?.message||'');
 const hint=/ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|download|proxy|网络|下载/i.test(reason)
  ?'运行时下载或网络连接失败。检查网络和代理是否运行、端口是否正确；修复后重新启动，已缓存的运行时会继续复用。'
  :/EACCES|EPERM|ENOSPC|permission/i.test(reason)
  ?'无法写入或启动运行时。检查用户数据目录的写入权限、剩余磁盘空间及安全软件的拦截记录。'
  :/仍在准备/.test(reason)?'另一实例正在准备运行时，请稍后重试；无需重复安装。'
  :/已恢复上一版/.test(reason)?'新版未成功启动，已尝试恢复上一版。请重新打开工作台确认恢复结果。'
  :'桌宠未成功启动。确认本机 Node.js ≥22.19，重新启动宿主后再试；若仍失败，请保留诊断信息排查。';
 return `${hint}\n数据目录：${dir}\n无需启动桌宠即可诊断：在插件运行时目录执行 node bin/board-pet.js doctor。`;
}
