import {mkdir,writeFile,readFile,copyFile} from 'node:fs/promises';
import {getSharp} from '../design/lib/svgkit.mjs';
const sharp=getSharp(),out='assets/brand';await mkdir(out,{recursive:true});
// An original, small-size-first mark: a curled companion and its guiding star.
// Eyes and the curved belly are true negative space, so one-color masks work on any theme.
const silhouette='<path d="M28 43 27 22Q27 17 32 20L49 30Q61 27 73 32L83 23Q88 19 89 26L92 48C102 66 95 91 77 101C57 112 31 102 24 83C19 68 21 54 28 43Z"/><path d="m105 23 3.3 8.7L117 35l-8.7 3.3L105 47l-3.3-8.7L93 35l8.7-3.3Z"/>';
const holes='<rect x="42" y="54" width="6" height="10" rx="3"/><rect x="67" y="54" width="6" height="10" rx="3"/><path d="M40 81Q56 96 75 81" fill="none" stroke="black" stroke-width="5" stroke-linecap="round"/>';
function mark(color='#B4472F'){return `<defs><mask id="face"><rect width="128" height="128" fill="white"/><g fill="black">${holes}</g></mask></defs><g fill="${color}" mask="url(#face)">${silhouette}</g>`;}
const svg=(body,size=128)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">${body}</svg>`;
const logo=svg(mark()),app=svg('<rect x="2" y="2" width="124" height="124" rx="29" fill="#FCF7EC"/><rect x="2.5" y="2.5" width="123" height="123" rx="28.5" fill="none" stroke="#DCCFB6"/><g transform="translate(8 8) scale(.875)">'+mark()+'</g>');
await writeFile(out+'/mark.svg',logo);await writeFile(out+'/app.svg',app);
await sharp(Buffer.from(app)).resize(512,512).png().toFile(out+'/app-512.png');
for(const size of [16,24,32,48,64,128,256])await sharp(Buffer.from(app)).resize(size,size).png().toFile(out+`/app-${size}.png`);
await sharp(Buffer.from(svg(mark('#B4472F')))).resize(32,32).png().toFile('assets/tray.png');
// PNG-compressed ICO directory: Windows uses the closest native resolution.
const sizes=[16,32,48,256],images=await Promise.all(sizes.map(n=>readFile(out+`/app-${n}.png`))),head=Buffer.alloc(6+sizes.length*16);head.writeUInt16LE(1,2);head.writeUInt16LE(sizes.length,4);let offset=head.length;
images.forEach((data,i)=>{const p=6+i*16;head[p]=head[p+1]=sizes[i]===256?0:sizes[i];head.writeUInt16LE(1,p+4);head.writeUInt16LE(32,p+6);head.writeUInt32LE(data.length,p+8);head.writeUInt32LE(offset,p+12);offset+=data.length;});await writeFile(out+'/app.ico',Buffer.concat([head,...images]));
await copyFile(out+'/mark.svg','desktop/brand.svg');await copyFile(out+'/mark.svg','market/web/brand.svg');await copyFile(out+'/app.ico','market/web/favicon.ico');await copyFile(out+'/app-256.png','market/web/apple-touch-icon.png');
await copyFile('desktop/theme-tokens.css','market/web/theme-tokens.css');
// Monochrome activity-bar variant follows the editor's own icon color.
await writeFile('cursor-extension/media/pet.svg',svg(mark('#000000')));
await copyFile(out+'/app-256.png','cursor-extension/media/app.png');
const extension=JSON.parse(await readFile('cursor-extension/package.json','utf8'));extension.icon='media/app.png';await writeFile('cursor-extension/package.json',JSON.stringify(extension,null,2)+'\n');
const inlineMark=logo.replaceAll('#B4472F','currentColor').replace('<svg ','<svg aria-hidden="true" ');
let client=await readFile('client/client.js','utf8');
const declaration='  const BRAND_MARK='+JSON.stringify(inlineMark)+';\n';
client=client.includes('  const BRAND_MARK=')?client.replace(/  const BRAND_MARK=.*;\r?\n/,declaration):client.replace("  const namespace='board-ai-pet';",declaration+"  const namespace='board-ai-pet';");
client=client.replace("h('div',{className:'lp-brand'},'LINGPET / 灵伴')","h('div',{className:'lp-brand'},h('span',{className:'lp-mark','aria-hidden':true,dangerouslySetInnerHTML:{__html:BRAND_MARK}}),'LINGPET / 灵伴')");
client=client.replace('.lp-settings .lp-brand{font-size:11px;letter-spacing:1.5px;opacity:.6}', '.lp-settings .lp-brand{display:flex;align-items:center;gap:10px;font-size:11px;letter-spacing:1.5px;opacity:.85}.lp-settings .lp-mark svg{display:block;width:30px;height:30px;color:var(--lp-accent,currentColor)}');
await writeFile('client/client.js',client);
await mkdir('design/brand',{recursive:true});
await writeFile('design/brand/README.md','# 灵伴 · 伴星标记\n\n原创矢量标记：蜷坐的小生命与一颗伴星。双眼和腹部弧线为负形，支持单色、主题着色和小尺寸使用，不使用汉字占位。\n\n主色朱砂 #B4472F，纸白 #FCF7EC。应用图标保留圆角纸白底板；界面与托盘使用透明标记。最小显示尺寸 16 px；常规界面建议 32–40 px，标记外围保留至少 1/8 边长留白。\n\n源构造与 SVG、PNG、ICO 导出见 scripts/build-brand.mjs。资产位于 assets/brand，网站副本随 Go 服务嵌入。\n');
const previews=[['#F7F1E4','#B4472F'],['#0a0a10','#ffa63d'],['#0b0908','#f0a860'],['#070A09','#54F0A6']];
const pieces=previews.map(([bg,fg],i)=>`<g transform="translate(${i*300} 0)"><rect width="300" height="300" fill="${bg}"/><svg x="68" y="52" width="164" height="164" viewBox="0 0 128 128">${mark(fg).replaceAll('id="face"',`id="face${i}"`).replaceAll('url(#face)',`url(#face${i})`)}</svg><text x="150" y="254" text-anchor="middle" fill="${fg}" font-family="Segoe UI" font-size="14" letter-spacing="4">LINGPET</text></g>`).join('');
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300">${pieces}</svg>`)).png().toFile('design/brand/brand-preview.png');
console.log('Brand SVG, PNG, ICO, tray, website and editor assets built.');
