import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
export async function buildSidebar(){
  const result=await build({entryPoints:['desktop/sidebar-app.js'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify:true});
  const css=(await readFile('desktop/theme-tokens.css','utf8'))+'\n'+(await readFile('desktop/ui-base.css','utf8'))+'\n'+(await readFile('desktop/sidebar-app.css','utf8'));
  const mark=(await readFile('assets/brand/mark.svg','utf8')).replace('<svg ','<svg class="brand-mark" aria-hidden="true" ').replaceAll('#B4472F','currentColor');
  await writeFile('desktop/sidebar-app.html',`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>灵伴桌宠</title><style>${css}</style></head><body><main><div class="brand">${mark}LINGPET / 灵伴</div><h1>你的会话伙伴</h1><p class="intro">让桌宠陪伴每一次思考与创作。</p><section><div class="status"><span id="dot"></span><strong id="status" role="status">正在连接…</strong></div><p id="detail">正在检查桌宠运行状态</p><div class="actions"><button id="start" disabled>启动桌宠</button><button id="stop" disabled>关闭全部桌宠</button><button id="settings" disabled>打开工作台</button></div><div id="pets"></div></section><p id="message" role="status" aria-live="polite"></p><footer>打开工作台管理形象与跟随；关闭后可在这里随时恢复。</footer></main><script type="module">${result.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></body></html>`);
}
await buildSidebar();
