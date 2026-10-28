// Visual-system audit: extracts the de-facto tokens of every shipped UI surface.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const surfaces = [
  ['工作台/设置', 'desktop/settings.css'],
  ['快捷控制', 'desktop/quick-controls.css'],
  ['拖拽控制条', 'desktop/control.css'],
  ['桌宠浮层', 'desktop/pet.css'],
  ['共享主题', 'desktop/ui-theme.css'],
  ['Cursor/编辑器侧边栏', 'desktop/sidebar-app.css'],
  ['市场网站', 'market/web/style.css'],
];

const html = [
  ['工作台', 'desktop/settings.html'],
  ['桌宠', 'desktop/pet.html'],
  ['快捷控制', 'desktop/quick-controls.html'],
  ['控制条', 'desktop/control.html'],
  ['编辑器侧边栏', 'desktop/sidebar-app.html'],
  ['市场首页', 'market/web/index.html'],
  ['市场列表', 'market/web/market.html'],
  ['市场后台', 'market/web/admin.html'],
  ['DSH 插件面板', 'client/client.js'],
];

const uniq = (a) => [...new Set(a)];
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
const norm = (c) => c.toLowerCase();
const sortCount = (arr) => {
  const m = new Map();
  for (const v of arr) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
};

const allColors = new Set();
const lines = [];
lines.push('# 视觉系统现状审计（自动生成）\n');
lines.push(`生成于 ${new Date().toISOString()}\n`);

lines.push('## 1. 每个界面文件的「事实 token」\n');
lines.push('| 界面 | 文件 | CSS 字节 | 十六进制色数 | 圆角档位 | 字号档位 | box-shadow | 渐变 | 模糊 | @keyframes | transition |');
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
const stats = {};
for (const [name, rel] of surfaces) {
  const css = read(rel);
  const colors = uniq((css.match(hexRe) || []).map(norm));
  colors.forEach((c) => allColors.add(c));
  const radii = uniq((css.match(/border-radius:[^;}]+/g) || []).map((s) => s.split(':')[1].trim()));
  const sizes = uniq((css.match(/font-size:[^;}]+/g) || []).map((s) => s.split(':')[1].trim()));
  const shadows = (css.match(/box-shadow:/g) || []).length;
  const grad = (css.match(/gradient\(/g) || []).length;
  const blur = (css.match(/backdrop-filter|blur\(/g) || []).length;
  const kf = (css.match(/@keyframes/g) || []).length;
  const trans = (css.match(/transition:/g) || []).length;
  stats[name] = { rel, colors: colors.length, radii, sizes, shadows, grad, blur, kf, trans };
  lines.push(`| ${name} | \`${rel}\` | ${css.length} | ${colors.length} | ${radii.length} | ${sizes.length} | ${shadows} | ${grad} | ${blur} | ${kf} | ${trans} |`);
}

lines.push('\n## 2. 圆角档位（全项目合并）\n');
const allRadii = uniq(surfaces.flatMap(([, rel]) => (read(rel).match(/border-radius:[^;}]+/g) || []).map((s) => s.split(':')[1].trim())));
lines.push('- ' + allRadii.join('、'));

lines.push('\n## 3. 字号档位（全项目合并）\n');
const allSizes = sortCount(surfaces.flatMap(([, rel]) => (read(rel).match(/font-size:[^;}]+/g) || []).map((s) => s.split(':')[1].trim())));
lines.push('| 字号 | 出现次数 |');
lines.push('| --- | --- |');
for (const [s, n] of allSizes) lines.push(`| ${s} | ${n} |`);

lines.push('\n## 4. 出现频率最高的颜色（跨界面）\n');
const colorCount = sortCount(surfaces.flatMap(([, rel]) => (read(rel).match(hexRe) || []).map(norm)));
lines.push('| 颜色 | 出现次数 |');
lines.push('| --- | --- |');
for (const [c, n] of colorCount.slice(0, 24)) lines.push(`| \`${c}\` | ${n} |`);
lines.push(`\n> 跨 ${surfaces.length} 个样式表共出现 **${allColors.size}** 个不同十六进制颜色。`);

lines.push('\n## 5. 变量（自定义属性）覆盖情况\n');
lines.push('| 界面 | 定义变量数 | 引用变量数 | 未走变量的颜色占比 |');
lines.push('| --- | --- | --- | --- |');
for (const [name, rel] of surfaces) {
  const css = read(rel);
  const defs = uniq(css.match(/--[a-zA-Z0-9-]+\s*:/g) || []);
  const uses = uniq(css.match(/var\(--[a-zA-Z0-9-]+/g) || []);
  const hexes = (css.match(hexRe) || []).length;
  lines.push(`| ${name} | ${defs.length} | ${uses.length} | ${hexes} 处硬编码 |`);
}

lines.push('\n## 6. 可及性与自适应检查\n');
lines.push('| 检查项 | 结果 |');
lines.push('| --- | --- |');
const cssAll = surfaces.map(([, rel]) => read(rel)).join('\n');
const htmlAll = ['desktop/settings.html', 'desktop/pet.html', 'desktop/quick-controls.html', 'desktop/control.html', 'client/client.js'].map(read).join('\n');
const checks = [
  ['`:focus-visible` 焦点环', cssAll.includes(':focus-visible')],
  ['`prefers-reduced-motion` 降级', cssAll.includes('prefers-reduced-motion')],
  ['`prefers-color-scheme` 浅色适配', cssAll.includes('prefers-color-scheme')],
  ['`prefers-contrast` / forced-colors', cssAll.includes('prefers-contrast') || cssAll.includes('forced-colors')],
  ['`color-scheme` 声明', cssAll.includes('color-scheme')],
  ['内联 style= 使用', /style="/.test(htmlAll)],
  ['`@media` 断点总数', (cssAll.match(/@media/g) || []).length],
  ['`@keyframes` 总数', (cssAll.match(/@keyframes/g) || []).length],
  ['`transition` 声明总数', (cssAll.match(/transition:/g) || []).length],
  ['`backdrop-filter` 总数', (cssAll.match(/backdrop-filter/g) || []).length],
  ['渐变总数', (cssAll.match(/gradient\(/g) || []).length],
];
for (const [k, v] of checks) lines.push(`| ${k} | ${typeof v === 'boolean' ? (v ? '有' : '**缺**') : v} |`);

lines.push('\n## 7. 各界面颜色清单\n');
for (const [name, rel] of surfaces) {
  const css = read(rel);
  lines.push(`### ${name}（\`${rel}\`）\n`);
  lines.push(sortCount((css.match(hexRe) || []).map(norm)).map(([c, n]) => `\`${c}\`×${n}`).join('、') + '\n');
}

fs.writeFileSync(path.join(root, 'design/audit/tokens.md'), lines.join('\n'));
console.log('wrote design/audit/tokens.md');
console.log(JSON.stringify({ totalDistinctColors: allColors.size, radii: allRadii.length, sizes: allSizes.length }, null, 2));
