#!/usr/bin/env node
/**
 * market-layout-shots.cjs — 市场网站（market/web）视觉回归截图工具
 *
 * 用法（仓库根执行）：
 *   npx electron scripts/market-layout-shots.cjs                 # 只截默认主题 paper-journal
 *   npx electron scripts/market-layout-shots.cjs --all-themes    # 四套主题都截
 *   npx electron scripts/market-layout-shots.cjs --strict        # 横向溢出也算失败
 *   npx electron scripts/market-layout-shots.cjs --out=<dir>     # 自定义输出目录
 *   node scripts/market-layout-shots.cjs --serve-only            # 不用 Electron，只自检静态服务/假 API
 *
 * 做什么：
 *  1. 用 http.createServer 在 127.0.0.1 随机端口真实伺服 market/web（正确 MIME），
 *     页面通过 http:// 加载（不是 file://、不内联 CSS），图片 / @import 链全部真实生效。
 *  2. 在 server 里对 /api/*、/auth/*、/downloads/* 返回固定假数据，让市场列表、
 *     管理后台直接用自己的业务代码把内容渲染出来（不改 market/web 一个字节）。
 *  3. index / market / admin 三页 × 1440 / 1200 / 760 / 430 四个宽度，
 *     每个组合截「900 高视口图」与「整页图」；admin 在 1440 额外截四个后台面板。
 *  4. 记录每张图的 innerWidth / clientWidth / scrollWidth / scrollHeight、主题是否生效、
 *     样式表条数、body 实际背景色/字体、图片加载状态、页面关键区块数量。
 *  5. 收集 console error 与失败的资源请求，打印溢出/报错摘要，并写
 *     tmp-shots/web-layout/report.json + summary.txt。
 *
 * 产物：tmp-shots/web-layout/（默认；可用 --out= 改）
 *   <page>-<width>.png           视口图（900 高），默认主题
 *   <page>-<width>-full.png      整页图
 *   <page>-<width>-<theme>.png   带主题后缀（--all-themes 时）
 *   admin-1440-panel-<name>.png  管理后台面板（--all-themes 时带主题后缀）
 *   report.json / summary.txt
 *
 * 只读 market/web；本脚本只写输出目录（默认 tmp-shots/web-layout/）。
 */
'use strict';

const IS_ELECTRON = Boolean(process.versions.electron);
const electron = IS_ELECTRON ? require('electron') : {};
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const http = require('node:http');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WEB_ROOT = path.join(ROOT, 'market', 'web');
const outFlag = process.argv.find((arg) => arg.startsWith('--out='));
// 注意：artifacts/ 在本仓库某些会话里被 Windows 权限挡住，默认写仓库根的 tmp-shots/
let OUT_DIR = outFlag ? path.resolve(ROOT, outFlag.slice('--out='.length)) : path.join(ROOT, 'tmp-shots', 'web-layout');
const FALLBACK_OUT_DIR = path.join(ROOT, 'scripts', 'tmp-shots', 'web-layout');

if (IS_ELECTRON) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  // 默认 userData 在 %APPDATA%\Electron；受限环境可能不可写，改到系统临时目录
  app.setPath('userData', path.join(os.tmpdir(), 'lingpet-market-layout-shots', 'profile'));
}
const WIDTHS = [1440, 1200, 760, 430];
const VIEWPORT_HEIGHT = 900;
const MAX_FULL_HEIGHT = 12000;
const THEMES = ['paper-journal', 'pixel-workshop', 'warm-night', 'terminal-pulse'];
const DEFAULT_THEME = THEMES[0];
const ADMIN_PANELS = ['queue', 'review', 'releases', 'audit'];

const PAGES = [
  {
    name: 'index',
    route: '/',
    ready: "document.querySelectorAll('#downloadCards .download-card').length > 0",
  },
  {
    name: 'market',
    route: '/market',
    ready: "document.querySelectorAll('#cards .pet-card').length >= 6",
  },
  {
    name: 'admin',
    route: '/admin',
    ready:
      "document.getElementById('admin') && document.getElementById('admin').hidden === false && " +
      "document.querySelectorAll('#statsCards .stat-card').length > 0 && " +
      "document.querySelectorAll('#statsRows tr').length > 0",
  },
];

/* ------------------------------------------------------------------ *
 * 假数据（字段严格对齐 market/web/app.js / admin.js / common.js 的读取方式）
 * ------------------------------------------------------------------ */

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const iso = (msAgo) => new Date(now - msAgo).toISOString();
const daysAgo = (n) => iso(n * DAY);

const PETS = [
  {
    id: 'whale-chan',
    name: '鲸鱼娘 · 晴海',
    character: '鲸鱼娘',
    author: 'fourzkw',
    repository: 'fourzkw/lingpet-whale',
    tag: 'v1.4.2',
    version: '1.4.2',
    license: 'CC BY-NC 4.0',
    description: '海风味的安静陪伴。思考时尾巴会轻轻晃动，完成时会浮上来冒个泡。',
    downloads: 3284,
    stars: 412,
    variants: ['original', 'pixel'],
    status: 'approved',
    updatedAt: daysAgo(2),
    cover: 'deepseek.png',
    size: 46342332,
  },
  {
    id: 'white-dragon',
    name: '白羽龙姬',
    character: '白羽龙姬',
    author: 'snowleaf',
    repository: 'snowleaf/white-dragon',
    tag: 'v2.1.0',
    version: '2.1.0',
    license: 'CC BY 4.0',
    description: '把温柔带到桌面。八种动作齐全，支持点击与摸头互动。',
    downloads: 5210,
    stars: 978,
    variants: ['original', 'pixel'],
    status: 'approved',
    updatedAt: daysAgo(5),
    cover: 'white-dragon.png',
    size: 88219340,
  },
  {
    id: 'pixel-snowfox',
    name: '像素雪狐',
    character: '雪狐',
    author: 'pixelfox',
    repository: 'pixelfox/snowfox-pixel',
    tag: 'v1.0.3',
    version: '1.0.3',
    license: 'MIT',
    description: '32×32 像素风，尾巴会随着等待输入慢慢摇。',
    downloads: 1204,
    stars: 233,
    variants: ['pixel'],
    status: 'approved',
    updatedAt: daysAgo(8),
    cover: 'white-dragon.png',
    size: 8263312,
  },
  {
    id: 'moon-deer',
    name: '月下白鹿',
    character: '白鹿',
    author: 'hoshino',
    repository: 'hoshino/moon-deer',
    tag: 'v1.2.0',
    version: '1.2.0',
    license: 'CC BY-NC-SA 4.0',
    description: '安静地站在桌角，只有光标停下时才抬头看你一眼。',
    downloads: 867,
    stars: 145,
    variants: ['original'],
    status: 'approved',
    updatedAt: daysAgo(11),
    cover: 'deepseek.png',
    size: 61203911,
  },
  {
    id: 'clockwork-crow',
    name: '机械小鸦',
    character: '小鸦',
    author: 'cogwork',
    repository: 'cogwork/clockwork-crow',
    tag: 'v0.9.1',
    version: '0.9.1',
    license: 'Apache-2.0',
    description: '齿轮与羽毛。待批准时会左右踱步，有点急躁但很可爱。',
    downloads: 452,
    stars: 88,
    variants: ['original', 'pixel'],
    status: 'approved',
    updatedAt: daysAgo(14),
    cover: 'white-dragon.png',
    size: 32104567,
  },
  {
    id: 'moss-slime',
    name: '青苔史莱姆',
    character: '史莱姆',
    author: 'mossy',
    repository: 'mossy/moss-slime',
    tag: 'v1.1.5',
    version: '1.1.5',
    license: 'CC0',
    description: '开会时它也在开会。泡在阳光里，慢半拍地弹一下。',
    downloads: 3011,
    stars: 356,
    variants: ['pixel'],
    status: 'approved',
    updatedAt: daysAgo(17),
    cover: 'deepseek.png',
    size: 7123379,
  },
  {
    id: 'stardust-cat',
    name: '星尘猫',
    character: '星尘猫',
    author: 'nighthowl',
    repository: 'nighthowl/stardust-cat',
    tag: 'v2.0.0',
    version: '2.0.0',
    license: 'CC BY 4.0',
    description: '深夜工作的专属伙伴，终端主题下会发光。',
    downloads: 0,
    stars: 0,
    variants: ['original', 'pixel'],
    status: 'pending',
    updatedAt: daysAgo(1),
    cover: 'white-dragon.png',
    size: 55442310,
  },
  {
    id: 'cloud-sheep',
    name: '云朵羊',
    character: '云朵羊',
    author: 'woolly',
    repository: 'woolly/cloud-sheep',
    tag: 'v1.0.0',
    version: '1.0.0',
    license: 'CC BY-NC 4.0',
    description: '抱着一小团云，睡着的时候会轻轻打呼。',
    downloads: 733,
    stars: 61,
    variants: ['original'],
    status: 'approved',
    updatedAt: daysAgo(21),
    cover: 'deepseek.png',
    size: 29103455,
  },
];

/** 市场 /api/pets 返回的版本记录 */
function marketRecord(pet) {
  return {
    id: pet.id,
    pet: {
      name: pet.name,
      version: pet.version,
      author: pet.author,
      description: pet.description,
      character: { name: pet.character },
      license: pet.license,
    },
    preview: { variants: pet.variants },
    previewRevision: 'rev-' + pet.id,
    updatedAt: pet.updatedAt,
    stats: { downloads: pet.downloads, stars: pet.stars },
    status: pet.status,
    repository: pet.repository,
    tag: pet.tag,
    size: pet.size,
  };
}

/** /api/admin/versions 返回的记录（含投稿来源、校验结果等后台字段） */
function adminRecord(pet, override) {
  const base = marketRecord(pet);
  const extra = override || {};
  return {
    ...base,
    submitter: pet.author + ' <' + pet.author + '@example.com>',
    origin: 'GitHub Release',
    reviews: [{ reason: '自动校验通过：封面与八动作齐全', at: pet.updatedAt }],
    ...extra,
  };
}

const ADMIN_RECORDS = [
  adminRecord(PETS[0]),
  adminRecord(PETS[1]),
  adminRecord(PETS[2]),
  adminRecord(PETS[3]),
  adminRecord(PETS[4], { status: 'validating' }),
  adminRecord(PETS[6], { status: 'pending' }),
  adminRecord(PETS[7], { status: 'failed', error: 'cover.png 尺寸不足 512×512，未通过封面校验' }),
  adminRecord(PETS[5], { status: 'unpublished', reason: '作者自行下架' }),
];

/** /api/admin/stats —— 字段对齐 admin.js renderStats */
function adminStats() {
  const daily = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(now - i * DAY);
    const label = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    daily.push({
      date: label,
      home: 120 + ((i * 37) % 90),
      market: 60 + ((i * 19) % 55),
      downloads: 8 + ((i * 7) % 14),
      bytes: 512 * 1024 * 1024 + i * 21 * 1024 * 1024,
    });
  }
  const sum = (key) => daily.reduce((n, row) => n + row[key], 0);
  return {
    version: '0.7.32',
    days: 14,
    totals: {
      'visit.home': { count: sum('home') },
      'visit.market': { count: sum('market') },
      'download.desktop': { count: sum('downloads') },
    },
    daily,
    submissions: { pending: 1, queued: 1, validating: 1, approved: 6 },
    submissionTotal: 12,
  };
}

const ADMIN_AUDIT = [
  { at: daysAgo(0), actor: 'admin', action: 'pet.auto-publish', detail: '鲸鱼娘 · 晴海 v1.4.2 自动校验上架' },
  { at: daysAgo(0), actor: 'system', action: 'package.publish', detail: '白羽龙姬 v2.1.0 校验通过' },
  { at: daysAgo(1), actor: 'admin', action: 'pet.unpublish', detail: '青苔史莱姆 v1.1.5 下架（作者申请）' },
  { at: daysAgo(1), actor: 'system', action: 'pet.reject', detail: '云朵羊 v1.0.0 封面尺寸不足' },
  { at: daysAgo(2), actor: 'admin', action: 'account.password', detail: '修改管理员密码' },
  { at: daysAgo(3), actor: 'system', action: 'package.import', detail: '导入历史安装包 LingPet-Setup-0.7.31.exe' },
];

const ADMIN_QUEUE = {
  cooldownSeconds: 30,
  intervalSeconds: 86400,
  updatedAt: iso(1000 * 60 * 3),
  validations: [
    { name: '星尘猫', version: 'v2.0.0', repository: 'nighthowl/stardust-cat', origin: 'GitHub Release', status: 'validating', position: 1, createdAt: iso(1000 * 60 * 9) },
    { name: '机械小鸦', version: 'v0.9.1', repository: 'cogwork/clockwork-crow', origin: 'GitHub Release', status: 'queued', position: 2, createdAt: iso(1000 * 60 * 5) },
    { name: '云朵羊', version: 'v1.0.1', repository: 'woolly/cloud-sheep', origin: 'GitHub Release', status: 'queued', position: 3, createdAt: iso(1000 * 60 * 2) },
  ],
  checks: [
    { kind: 'source', name: '鲸鱼娘 · 晴海', version: 'v1.4.2', repository: 'fourzkw/lingpet-whale', status: 'running', lastCheck: iso(1000 * 60 * 12), nextCheck: iso(-DAY), missing: 0, error: '', position: 1 },
    { kind: 'source', name: '白羽龙姬', version: 'v2.1.0', repository: 'snowleaf/white-dragon', status: 'due', lastCheck: iso(DAY), nextCheck: iso(1000 * 60), missing: 1, error: '', position: 2 },
    { kind: 'discovery', name: '月下白鹿', version: 'v1.2.0', repository: 'hoshino/moon-deer', status: 'scheduled', lastCheck: iso(2 * DAY), nextCheck: iso(-2 * DAY), missing: 0, error: '', position: 3 },
    { kind: 'source', name: '云朵羊', version: 'v1.0.0', repository: 'woolly/cloud-sheep', status: 'disabled', lastCheck: iso(3 * DAY), nextCheck: null, missing: 0, error: 'GitHub 仓库已 404', position: 4 },
  ],
};

/* ------------------------------------------------------------------ *
 * 本地静态服务器（真实 http 伺服 market/web + 假 API）
 * ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function sendBuffer(res, status, type, buffer) {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': buffer.length,
    'Cache-Control': 'no-store',
  });
  res.end(buffer);
}

function sendJson(res, data) {
  sendBuffer(res, 200, 'application/json; charset=utf-8', Buffer.from(JSON.stringify(data)));
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('not found: ' + filePath);
      return;
    }
    sendBuffer(res, 200, MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', buffer);
  });
}

function serveApi(req, res, url) {
  const pathname = url.pathname;

  if (pathname === '/api/pets') return sendJson(res, PETS.map(marketRecord));
  if (pathname === '/api/me') return sendJson(res, { admin: true, user: 'admin', mustChangePassword: false });

  const cover = /^\/api\/versions\/([^/]+)\/preview\/cover\.png$/.exec(pathname);
  if (cover) {
    const pet = PETS.find((p) => p.id === cover[1]) || PETS[0];
    return sendFile(res, path.join(WEB_ROOT, pet.cover));
  }

  const install = /^\/api\/versions\/([^/]+)\/install$/.exec(pathname);
  if (install) {
    const pet = PETS.find((p) => p.id === install[1]) || PETS[0];
    return sendJson(res, { url: 'https://github.com/' + pet.repository + '/releases/download/' + pet.tag + '/' + pet.id + '.zip' });
  }

  const version = /^\/api\/versions\/([^/]+)$/.exec(pathname);
  if (version) {
    const pet = PETS.find((p) => p.id === version[1]) || PETS[0];
    return sendJson(res, marketRecord(pet));
  }

  if (pathname === '/api/admin/versions') return sendJson(res, ADMIN_RECORDS);
  if (pathname === '/api/admin/stats') return sendJson(res, adminStats());
  if (pathname === '/api/admin/audit') return sendJson(res, ADMIN_AUDIT);
  if (pathname === '/api/admin/queue') return sendJson(res, ADMIN_QUEUE);
  if (pathname === '/api/admin/stats.csv') {
    const stats = adminStats();
    const lines = ['date,home,market,downloads,bytes'].concat(
      stats.daily.map((d) => [d.date, d.home, d.market, d.downloads, d.bytes].join(',')),
    );
    return sendBuffer(res, 200, 'text/csv; charset=utf-8', Buffer.from(lines.join('\n')));
  }
  if (pathname === '/api/submissions/lookup') return sendJson(res, { records: [] });
  if (pathname.startsWith('/api/')) return sendJson(res, {});

  if (pathname.startsWith('/auth/')) return sendJson(res, { ok: true, user: 'admin' });

  if (pathname.startsWith('/downloads/')) {
    res.writeHead(303, {
      Location: 'https://github.com/fourzkw/lingpet/releases/latest',
      'Cache-Control': 'no-store',
    });
    return res.end();
  }

  return sendJson(res, { error: 'unknown api' });
}

function startServer(log) {
  const server = http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://127.0.0.1');
    } catch {
      res.writeHead(400).end('bad url');
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      pathname = url.pathname;
    }
    log.push(pathname);

    if (pathname === '/__theme.html') {
      return sendBuffer(
        res,
        200,
        'text/html; charset=utf-8',
        Buffer.from('<!doctype html><meta charset="utf-8"><title>theme bootstrap</title><p>theme bootstrap</p>'),
      );
    }

    if (pathname.startsWith('/api/') || pathname.startsWith('/auth/') || pathname.startsWith('/downloads/')) {
      try {
        return serveApi(req, res, { ...url, pathname });
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('fake api error: ' + error.message);
      }
    }

    let relative;
    if (pathname === '/' || pathname === '') relative = 'index.html';
    else if (pathname === '/market' || pathname === '/market/') relative = 'market.html';
    else if (pathname === '/admin' || pathname === '/admin/') relative = 'admin.html';
    else relative = pathname.replace(/^\/+/, '');

    const filePath = path.resolve(WEB_ROOT, relative);
    if (filePath !== WEB_ROOT && !filePath.startsWith(WEB_ROOT + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('forbidden');
    }
    fs.stat(filePath, (error, stat) => {
      if (!error && stat.isDirectory()) return sendFile(res, path.join(filePath, 'index.html'));
      if (error) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end('not found: ' + pathname);
      }
      return sendFile(res, filePath);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/* ------------------------------------------------------------------ *
 * --serve-only 自检：不需要 Electron（普通 node 即可）
 *   验证「真实伺服」这一半：静态文件 / CSS @import 链 / 图片 / 假 API 全部可用。
 * ------------------------------------------------------------------ */

const EXPECTED_MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

async function fetchOnce(url) {
  const response = await fetch(url, { redirect: 'manual' });
  const buffer = Buffer.from(await response.arrayBuffer());
  return { status: response.status, type: response.headers.get('content-type') || '', buffer };
}

async function selfCheck() {
  const results = [];
  const check = async (name, fn) => {
    try {
      const detail = await fn();
      results.push({ name, ok: true, detail: detail || '' });
    } catch (error) {
      results.push({ name, ok: false, detail: error && error.message ? error.message : String(error) });
    }
  };
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const getText = async (route) => {
    const response = await fetchOnce(base + route);
    assert(response.status === 200, route + ' -> HTTP ' + response.status);
    return { text: response.buffer.toString('utf8'), response };
  };

  const requestLog = [];
  const server = await startServer(requestLog);
  const base = 'http://127.0.0.1:' + server.address().port;

  try {
    await check('首页 index.html 伺服与关键挂载点', async () => {
      const { text, response } = await getText('/');
      assert(response.type.startsWith('text/html'), 'content-type 不是 text/html: ' + response.type);
      for (const id of ['downloadCards', 'downloadStatus', 'petSpeech', 'greetPet', 'siteTheme']) {
        assert(text.includes('id="' + id + '"'), '缺少 #' + id);
      }
      assert(text.includes('class="landing-hero"'), '缺少 .landing-hero');
      return response.buffer.length + ' bytes';
    });

    await check('市场页 /market 伺服与关键挂载点', async () => {
      const { text, response } = await getText('/market');
      for (const id of ['cards', 'resultCount', 'search', 'marketSort', 'resetBrowse', 'detail']) {
        assert(text.includes('id="' + id + '"'), '缺少 #' + id);
      }
      return response.buffer.length + ' bytes';
    });

    await check('后台页 /admin 伺服与关键挂载点', async () => {
      const { text, response } = await getText('/admin');
      for (const id of ['loginPanel', 'admin', 'statsCards', 'statsRows', 'auditRows', 'validationQueueRows']) {
        assert(text.includes('id="' + id + '"'), '缺少 #' + id);
      }
      return response.buffer.length + ' bytes';
    });

    await check('CSS @import 链 (style.css → site.css/companion.css → theme-tokens.css)', async () => {
      const style = await getText('/style.css');
      assert(/@import[^;]*site\.css/.test(style.text), 'style.css 未 @import site.css');
      assert(/@import[^;]*companion\.css/.test(style.text), 'style.css 未 @import companion.css');
      const site = await getText('/site.css');
      assert(/@import[^;]*theme-tokens\.css/.test(site.text), 'site.css 未 @import theme-tokens.css');
      return '3 层 import 均可达';
    });

    await check('四套主题变量都定义在 theme-tokens.css', async () => {
      const { text } = await getText('/theme-tokens.css');
      for (const theme of THEMES) assert(text.includes('[data-theme="' + theme + '"]'), '缺少 ' + theme + ' 变量');
      return THEMES.join(', ');
    });

    await check('theme.js 读取约定的 localStorage key', async () => {
      const { text } = await getText('/theme.js');
      assert(text.includes('lingpet.website.theme'), 'theme.js 未使用 lingpet.website.theme');
      assert(text.includes('dataset.theme'), 'theme.js 未写 dataset.theme');
      return 'lingpet.website.theme → documentElement.dataset.theme';
    });

    await check('三页引用的本地资源全部 200 且 MIME 正确', async () => {
      const referenced = new Set();
      for (const route of ['/', '/market', '/admin']) {
        const { text } = await getText(route);
        for (const match of text.matchAll(/(?:href|src)="(\/[^"#?]+)"/g)) referenced.add(match[1]);
      }
      const broken = [];
      for (const asset of [...referenced].sort()) {
        const ext = path.extname(new URL(asset, base).pathname).toLowerCase();
        const expected = EXPECTED_MIME[ext];
        if (!expected) continue;
        const response = await fetchOnce(base + asset);
        const actual = response.type.split(';')[0].trim();
        if (response.status !== 200) broken.push(asset + ' HTTP ' + response.status);
        else if (actual !== expected) broken.push(asset + ' MIME ' + actual + ' ≠ ' + expected);
        else if (response.buffer.length === 0) broken.push(asset + ' 0 字节');
      }
      assert(broken.length === 0, broken.join('; '));
      return referenced.size + ' 个引用路径全部可用';
    });

    await check('假 API /api/pets 返回 ≥6 条完整桌宠记录', async () => {
      const { text } = await getText('/api/pets');
      const rows = JSON.parse(text);
      assert(Array.isArray(rows) && rows.length >= 6, '记录数 ' + (Array.isArray(rows) ? rows.length : 'not-array'));
      for (const row of rows) {
        assert(row.pet && row.pet.name, '缺 pet.name');
        assert(row.pet.author, '缺 pet.author');
        assert(row.stats && Number.isSafeInteger(row.stats.downloads), '缺 stats.downloads');
        assert(row.status, '缺 status');
        assert(row.preview && Array.isArray(row.preview.variants) && row.preview.variants.length, '缺 preview.variants');
      }
      return rows.length + ' 条，含名字/作者/状态/下载量/预览变体';
    });

    await check('假 API /api/me 走管理员登录态', async () => {
      const { text } = await getText('/api/me');
      const me = JSON.parse(text);
      assert(me.admin === true, 'admin 不是 true');
      assert(me.mustChangePassword === false, 'mustChangePassword 应为 false');
      return JSON.stringify(me);
    });

    await check('后台数据接口字段对齐 admin.js', async () => {
      const versions = JSON.parse((await getText('/api/admin/versions')).text);
      assert(Array.isArray(versions) && versions.length >= 6, 'versions 数量不足');
      const stats = JSON.parse((await getText('/api/admin/stats?days=14')).text);
      assert(Array.isArray(stats.daily) && stats.daily.length > 0, 'stats.daily 为空');
      assert(stats.totals && stats.totals['visit.home'] && stats.totals['download.desktop'], 'stats.totals 缺字段');
      assert(stats.submissions && Number.isSafeInteger(stats.submissions.pending), 'stats.submissions 缺字段');
      assert(Number.isSafeInteger(stats.submissionTotal), 'stats.submissionTotal 缺失');
      const audit = JSON.parse((await getText('/api/admin/audit')).text);
      assert(Array.isArray(audit) && audit.length > 0, 'audit 为空');
      const queue = JSON.parse((await getText('/api/admin/queue')).text);
      assert(Array.isArray(queue.validations) && Array.isArray(queue.checks), 'queue 结构不对');
      return 'versions=' + versions.length + ' daily=' + stats.daily.length + ' audit=' + audit.length + ' queue=' + queue.validations.length + '/' + queue.checks.length;
    });

    await check('封面图 / 安装包 / 下载跳转', async () => {
      const cover = await fetchOnce(base + '/api/versions/whale-chan/preview/cover.png?v=rev-whale-chan');
      assert(cover.status === 200 && cover.type.startsWith('image/png') && cover.buffer.length > 1000, '封面图异常');
      const install = JSON.parse((await getText('/api/versions/white-dragon/install')).text);
      assert(typeof install.url === 'string' && install.url.startsWith('https://github.com/'), 'install.url 不对');
      const download = await fetchOnce(base + '/downloads/desktop');
      assert(download.status === 303, '/downloads/desktop 应为 303，实际 ' + download.status);
      return 'cover.png ' + cover.buffer.length + ' bytes, install.url ok, /downloads 303';
    });

    await check('主题引导页 /__theme.html 可写 localStorage', async () => {
      const { response } = await getText('/__theme.html');
      assert(response.type.startsWith('text/html'), '/__theme.html 类型不对');
      return 'ok';
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const failed = results.filter((item) => !item.ok);
  console.log('');
  console.log('=========== market-layout-shots --serve-only 自检 ===========');
  console.log('base url : ' + base + '  (临时端口，自检结束已关闭)');
  console.log('web root : market/web');
  for (const item of results) {
    console.log('[' + (item.ok ? ' ok ' : 'FAIL') + '] ' + item.name + (item.detail ? '  → ' + item.detail : ''));
  }
  console.log('');
  console.log('RESULT   : ' + (failed.length === 0 ? 'PASS' : 'FAIL') + '  (' + (results.length - failed.length) + '/' + results.length + ')');
  console.log('============================================================');
  return failed.length === 0 ? 0 : 1;
}

/* ------------------------------------------------------------------ *
 * 截图流程
 * ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function themeSuffix(theme, allThemes) {
  return allThemes ? '-' + theme : '';
}

function shotName(page, width, theme, allThemes, extra) {
  return page + '-' + width + (extra ? '-' + extra : '') + themeSuffix(theme, allThemes) + '.png';
}

async function setTheme(win, base, theme) {
  await withTimeout(win.loadURL(base + '/__theme.html'), 15000, 'theme bootstrap load timeout');
  const applied = await win.webContents.executeJavaScript(
    'localStorage.setItem("lingpet.website.theme", ' + JSON.stringify(theme) + '); document.documentElement.dataset.theme || null',
  );
  return applied;
}

async function loadPage(win, url) {
  await withTimeout(win.loadURL(url), 30000, 'page load timeout: ' + url);
}

async function waitForReady(win, page) {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    let ready = false;
    try {
      ready = await win.webContents.executeJavaScript('(() => { try { return !!(' + page.ready + '); } catch (e) { return false; } })()');
    } catch {
      ready = false;
    }
    if (ready) return true;
    await sleep(120);
  }
  return false;
}

/** 强制加载懒加载图片、等字体与图片解码完成、冻结动画/过渡以便可重复截图 */
async function prepareDocument(win) {
  await win.webContents.executeJavaScript(`(async () => {
    // 把 loading="lazy" 改为 eager：整页截图前图片必须先真实加载
    for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
    const pending = [...document.images].filter((img) => !img.complete || img.naturalWidth === 0);
    const waitOne = (img) => new Promise((resolve) => {
      if (img.complete) return resolve(true);
      const done = () => resolve(true);
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      setTimeout(done, 8000);
    });
    await Promise.race([
      Promise.all(pending.map(waitOne)),
      new Promise((resolve) => setTimeout(resolve, 9000)),
    ]);
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
    return document.images.length;
  })()`);
  // 每次导航后重新注入（insertCSS 只对当前文档有效）
  await win.webContents.insertCSS('*, *::before, *::after { animation: none !important; transition: none !important; }');
  await settle(win);
}

async function settle(win) {
  try {
    await win.webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
  } catch {
    /* 页面正在导航时忽略 */
  }
  await sleep(90);
}

async function measure(win) {
  return win.webContents.executeJavaScript(`(() => {
    const d = document.documentElement;
    const body = getComputedStyle(document.body);
    const h1 = document.querySelector('h1');
    const h1Style = h1 ? getComputedStyle(h1) : null;
    const sheets = [...document.styleSheets].map((sheet) => {
      try { return { href: sheet.href ? sheet.href.replace(location.origin, '') : null, rules: sheet.cssRules.length }; }
      catch (error) { return { href: sheet.href ? sheet.href.replace(location.origin, '') : null, error: String(error) }; }
    });
    const images = [...document.images]
      .filter((img) => img.getAttribute('src') || img.currentSrc)
      .map((img) => ({
        src: (img.currentSrc || img.getAttribute('src') || '').replace(location.origin, ''),
        ok: img.complete && img.naturalWidth > 0,
        naturalWidth: img.naturalWidth,
      }));
    return {
      innerWidth: innerWidth,
      innerHeight: innerHeight,
      clientWidth: d.clientWidth,
      clientHeight: d.clientHeight,
      scrollWidth: d.scrollWidth,
      scrollHeight: d.scrollHeight,
      devicePixelRatio: devicePixelRatio,
      theme: d.dataset.theme || null,
      title: document.title,
      bodyBackground: body.backgroundColor,
      bodyColor: body.color,
      bodyFont: body.fontFamily,
      h1: h1Style ? { text: h1.textContent.trim().slice(0, 40), fontFamily: h1Style.fontFamily, fontSize: h1Style.fontSize, color: h1Style.color } : null,
      styleSheets: sheets,
      elements: document.querySelectorAll('*').length,
      images,
      state: {
        marketCards: document.querySelectorAll('#cards .pet-card').length,
        resultCount: document.getElementById('resultCount') ? document.getElementById('resultCount').textContent : null,
        downloadCards: document.querySelectorAll('#downloadCards .download-card').length,
        statCards: document.querySelectorAll('#statsCards .stat-card').length,
        statRows: document.querySelectorAll('#statsRows tr').length,
        loginHidden: document.getElementById('loginPanel') ? document.getElementById('loginPanel').hidden : null,
        adminVisible: document.getElementById('admin') ? !document.getElementById('admin').hidden : null,
        adminRows: document.querySelectorAll('#adminRecords .record').length,
        queueRows: document.querySelectorAll('#validationQueueRows tr').length,
        auditRows: document.querySelectorAll('#auditRows tr').length,
        experienceCards: document.querySelectorAll('.experience-grid .experience-card').length,
        companionScene: document.querySelector('.companion-scene')
          ? { display: getComputedStyle(document.querySelector('.companion-scene')).display, position: getComputedStyle(document.querySelector('.companion-scene')).position }
          : null,
      },
    };
  })()`);
}

async function capture(win) {
  return imageShot(await win.webContents.capturePage());
}

/** capturePage 拿到的 NativeImage → PNG buffer + 尺寸（不依赖 pngjs 解码） */
function imageShot(image) {
  const size = image.getSize();
  if (!size.width || !size.height) throw new Error('capturePage 返回空图像（窗口不可见或尺寸为 0）');
  return { buffer: image.toPNG(), width: size.width, height: size.height };
}

async function captureFullPage(win, width) {
  let contentHeight = await win.webContents.executeJavaScript('document.documentElement.scrollHeight');
  let target = Math.min(Math.max(contentHeight, VIEWPORT_HEIGHT), MAX_FULL_HEIGHT);
  for (let i = 0; i < 5; i += 1) {
    win.setContentSize(width, target);
    await settle(win);
    const next = await win.webContents.executeJavaScript('document.documentElement.scrollHeight');
    const need = Math.min(Math.max(next, VIEWPORT_HEIGHT), MAX_FULL_HEIGHT);
    if (need <= target) {
      contentHeight = next;
      break;
    }
    contentHeight = next;
    target = need;
  }
  await sleep(160);
  await settle(win);
  const finalHeight = await win.webContents.executeJavaScript('document.documentElement.scrollHeight');
  const shot = await capture(win);
  let truncated = false;
  if (shot.height < Math.min(finalHeight, MAX_FULL_HEIGHT) - 2) {
    // 窗口高度被系统限制时，退化为按整页矩形抓取
    try {
      const fallback = imageShot(await win.webContents.capturePage({ x: 0, y: 0, width, height: Math.min(finalHeight, MAX_FULL_HEIGHT) }));
      if (fallback.height >= shot.height) return { ...fallback, contentHeight: finalHeight, truncated: fallback.height < Math.min(finalHeight, MAX_FULL_HEIGHT) - 2 };
    } catch {
      truncated = true;
    }
    truncated = true;
  }
  return { ...shot, contentHeight: finalHeight, truncated };
}

/* 进度日志：Electron 崩在渲染进程时 stdout 可能丢，落盘一份方便事后定位 */
let progressFile = null;
const pendingProgress = [];
function progress(message) {
  const line = new Date().toISOString().slice(11, 23) + ' ' + message;
  console.log(line);
  if (progressFile) {
    try {
      fs.appendFileSync(progressFile, line + '\n');
    } catch {
      /* 日志失败不影响截图 */
    }
  } else {
    pendingProgress.push(line);
  }
}
function startProgressLog() {
  progressFile = path.join(OUT_DIR, 'progress.log');
  try {
    fs.writeFileSync(progressFile, pendingProgress.length ? pendingProgress.join('\n') + '\n' : '');
  } catch {
    progressFile = null;
    return;
  }
  pendingProgress.length = 0;
}

async function saveShot(fileName, buffer) {
  const target = path.join(OUT_DIR, fileName);
  await fsp.writeFile(target, buffer);
  const bytes = buffer.length;
  progress('  saved ' + fileName + ' (' + bytes + ' bytes)');
}

function displayOutDir() {
  const relative = path.relative(ROOT, OUT_DIR);
  return (relative || '.').split(path.sep).join('/') + '/';
}

/**
 * 建输出目录并做一次真实写入探测；仓库里的 artifacts/ 在受限会话中不可写，
 * 于是自动退化到 scripts/tmp-shots/web-layout/。
 */
async function ensureOutDir() {
  const candidates = OUT_DIR === FALLBACK_OUT_DIR ? [OUT_DIR] : [OUT_DIR, FALLBACK_OUT_DIR];
  for (const dir of candidates) {
    try {
      await fsp.mkdir(dir, { recursive: true });
      const probe = path.join(dir, '.write-probe');
      await fsp.writeFile(probe, 'ok');
      await fsp.rm(probe, { force: true });
      OUT_DIR = dir;
      if (dir !== candidates[0]) console.error('注意：' + candidates[0] + ' 不可写，已改用 ' + dir);
      return dir;
    } catch (error) {
      console.error('输出目录不可写 ' + dir + ' : ' + error.message);
    }
  }
  throw new Error('没有可写的输出目录，请用 --out=<dir> 指定');
}

async function saveReport(report) {
  await fsp.writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
}

function logShot(record) {
  const layout = record.layout;
  const overflow = layout.horizontalOverflow ? ' OVERFLOW +' + layout.overflowPx + 'px' : '';
  const files = record.shots.map((s) => s.file + '(' + s.width + 'x' + s.height + ')').join(', ');
  console.log(
    '[' + record.index + '/' + record.total + '] ' + record.label.padEnd(30) +
      ' innerWidth=' + layout.innerWidth + ' clientWidth=' + layout.clientWidth +
      ' scrollWidth=' + layout.scrollWidth + ' scrollHeight=' + layout.scrollHeight +
      ' cards=' + layout.state.marketCards + ' images=' + layout.images.length +
      ' theme=' + layout.theme + overflow + ' | ' + files,
  );
}

async function shootPage(ctx, page, width, theme, index, total) {
  const { win, base, allThemes, failures, pageErrors } = ctx;
  const label = page.name + '-' + width + themeSuffix(theme, allThemes).replace(/^-/, '-');
  const record = {
    index,
    total,
    label: page.name + '-' + width + (allThemes ? '-' + theme : ''),
    page: page.name,
    width,
    theme,
    kind: 'page',
    layout: null,
    shots: [],
    consoleErrors: [],
    failedRequests: [],
  };

  const consoleStart = pageErrors.length;
  const failureStart = failures.length;

  win.setContentSize(width, VIEWPORT_HEIGHT);
  await sleep(60);
  await loadPage(win, base + page.route);
  progress('  loaded ' + page.route + ' (' + width + 'x' + VIEWPORT_HEIGHT + ')');
  const ready = await waitForReady(win, page);
  if (!ready) throw new Error('page content did not render in time: ' + page.name + ' @' + width);
  await prepareDocument(win);

  const layout = await measure(win);
  record.layout = {
    ...layout,
    horizontalOverflow: layout.scrollWidth > layout.clientWidth,
    overflowPx: Math.max(0, layout.scrollWidth - layout.clientWidth),
    themeApplied: layout.theme === theme,
  };
  progress(
    '  measured innerWidth=' + layout.innerWidth + ' clientWidth=' + layout.clientWidth +
      ' scrollWidth=' + layout.scrollWidth + ' scrollHeight=' + layout.scrollHeight +
      ' sheets=' + layout.styleSheets.length + ' bg=' + layout.bodyBackground + ' theme=' + layout.theme,
  );

  const shot = await capture(win);
  const viewportFile = shotName(page.name, width, theme, allThemes);
  await saveShot(viewportFile, shot.buffer);
  record.shots.push({ kind: 'viewport', file: viewportFile, width: shot.width, height: shot.height });

  const full = await captureFullPage(win, width);
  const fullFile = shotName(page.name, width, theme, allThemes, 'full');
  await saveShot(fullFile, full.buffer);
  record.shots.push({
    kind: 'full',
    file: fullFile,
    width: full.width,
    height: full.height,
    contentHeight: full.contentHeight,
    truncated: full.truncated,
  });

  record.consoleErrors = pageErrors.slice(consoleStart);
  record.failedRequests = failures.slice(failureStart);
  return record;
}

async function shootAdminPanel(ctx, panel, width, theme, index, total) {
  const { win, allThemes, failures, pageErrors } = ctx;
  const record = {
    index,
    total,
    label: 'admin-' + width + '-panel-' + panel + (allThemes ? '-' + theme : ''),
    page: 'admin',
    width,
    theme,
    kind: 'panel',
    panel,
    layout: null,
    shots: [],
    consoleErrors: [],
    failedRequests: [],
  };
  const consoleStart = pageErrors.length;
  const failureStart = failures.length;

  await win.webContents.executeJavaScript(
    "document.querySelector('[data-admin-panel=" + JSON.stringify(panel) + "]').click(); true",
  );
  await settle(win);
  const layout = await measure(win);
  record.layout = {
    ...layout,
    horizontalOverflow: layout.scrollWidth > layout.clientWidth,
    overflowPx: Math.max(0, layout.scrollWidth - layout.clientWidth),
    themeApplied: layout.theme === theme,
  };
  const full = await captureFullPage(win, width);
  const file = shotName('admin', width, theme, allThemes, 'panel-' + panel);
  await saveShot(file, full.buffer);
  record.shots.push({ kind: 'panel', file, width: full.width, height: full.height, contentHeight: full.contentHeight, truncated: full.truncated });
  record.consoleErrors = pageErrors.slice(consoleStart);
  record.failedRequests = failures.slice(failureStart);
  return record;
}

function printSummary(report) {
  const lines = [];
  lines.push('');
  lines.push('================ market/web layout shots ================');
  lines.push('output dir      : ' + displayOutDir());
  lines.push('base url        : ' + report.base);
  lines.push('themes          : ' + report.themes.join(', ') + (report.options.allThemes ? '' : ' (默认主题；加 --all-themes 截全部)'));
  lines.push('widths          : ' + WIDTHS.join(' / ') + ' (viewport height ' + VIEWPORT_HEIGHT + ')');
  lines.push('shots           : ' + report.summary.shots + ' png (' + report.summary.pageShots + ' 页面 + ' + report.summary.panelShots + ' 后台面板)');
  lines.push('');
  const overflows = report.summary.horizontalOverflow;
  if (overflows.length) {
    lines.push('横向溢出 (scrollWidth > clientWidth): ' + overflows.length + ' 处');
    for (const item of overflows) lines.push('  !! ' + item.label.padEnd(32) + ' scrollWidth=' + item.scrollWidth + ' clientWidth=' + item.clientWidth + ' (+' + item.overflowPx + 'px)');
  } else {
    lines.push('横向溢出 (scrollWidth > clientWidth): 无');
  }
  lines.push('console error   : ' + report.summary.consoleErrors.length + (report.summary.consoleErrors.length ? '' : ' (无)'));
  for (const item of report.summary.consoleErrors.slice(0, 40)) lines.push('  !! [' + item.label + '] ' + item.message);
  lines.push('failed requests : ' + report.summary.failedRequests.length + (report.summary.failedRequests.length ? '' : ' (无)'));
  for (const item of report.summary.failedRequests.slice(0, 40)) lines.push('  !! [' + item.label + '] ' + item.url + ' -> ' + item.error);
  lines.push('broken images   : ' + report.summary.brokenImages.length + (report.summary.brokenImages.length ? '' : ' (无)'));
  for (const item of report.summary.brokenImages.slice(0, 40)) lines.push('  !! [' + item.label + '] ' + item.src);
  if (report.summary.truncatedFullShots.length) {
    lines.push('整页图被截断     : ' + report.summary.truncatedFullShots.length);
    for (const item of report.summary.truncatedFullShots) lines.push('  !! ' + item.file + ' ' + item.height + ' < ' + item.contentHeight);
  }
  lines.push('');
  lines.push('report.json     : ' + displayOutDir() + 'report.json');
  lines.push('RESULT          : ' + report.summary.status);
  lines.push('=========================================================');
  const text = lines.join('\n');
  console.log(text);
  return text;
}

async function main() {
  const flags = new Set(process.argv.slice(1).filter((arg) => arg.startsWith('--')));
  const allThemes = flags.has('--all-themes');
  const strict = flags.has('--strict');
  const themes = allThemes ? THEMES : [DEFAULT_THEME];

  await ensureOutDir();
  startProgressLog();
  progress('electron=' + process.versions.electron + ' chrome=' + process.versions.chrome + ' node=' + process.versions.node);
  progress('out dir=' + OUT_DIR + ' (display: ' + displayOutDir() + ')');
  for (const file of await fsp.readdir(OUT_DIR)) {
    if (/\.(png|json|txt|log)$/i.test(file)) await fsp.rm(path.join(OUT_DIR, file), { force: true });
  }

  const requestLog = [];
  const server = await startServer(requestLog);
  const base = 'http://127.0.0.1:' + server.address().port;
  progress('server ' + base);

  const failures = [];
  const pageErrors = [];

  const win = new BrowserWindow({
    show: false,
    width: WIDTHS[0],
    height: VIEWPORT_HEIGHT,
    useContentSize: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const currentLabel = { value: 'bootstrap' };
  // Electron 45 用单参数事件对象；旧的三参数写法会打印弃用警告
  win.webContents.on('console-message', (event) => {
    const detail = event && typeof event === 'object' ? event : null;
    const level = detail ? detail.level : event;
    const message = detail ? detail.message : '';
    const isError = level === 'error' || level === 3;
    if (isError) {
      pageErrors.push({ label: currentLabel.value, level: String(level), message: String(message).slice(0, 500) });
    }
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    const reason = details && details.reason ? details.reason + ' exitCode=' + details.exitCode : 'unknown';
    failures.push({ label: currentLabel.value, url: 'renderer', error: 'render-process-gone ' + reason });
    progress('  !! render-process-gone: ' + reason);
  });
  win.webContents.on('unresponsive', () => {
    failures.push({ label: currentLabel.value, url: 'renderer', error: 'unresponsive' });
  });
  win.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) failures.push({ label: currentLabel.value, url, error: 'did-fail-load ' + code + ' ' + description });
  });
  win.webContents.session.webRequest.onErrorOccurred((details) => {
    if (details.error === 'net::ERR_ABORTED') return;
    failures.push({ label: currentLabel.value, url: details.url, error: details.error });
  });

  const totalPageShots = PAGES.length * WIDTHS.length * themes.length;
  const totalPanelShots = themes.length * ADMIN_PANELS.length;
  const total = totalPageShots + totalPanelShots;
  const ctx = { win, base, allThemes, failures, pageErrors };

  const report = {
    tool: 'scripts/market-layout-shots.cjs',
    generatedAt: new Date().toISOString(),
    base,
    outputDir: displayOutDir(),
    options: { allThemes, strict, widths: WIDTHS, viewportHeight: VIEWPORT_HEIGHT, themes, defaultTheme: DEFAULT_THEME },
    environment: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
    },
    pages: PAGES.map((page) => page.name),
    adminPanels: ADMIN_PANELS,
    themeKey: 'lingpet.website.theme',
    fakeApi: {
      pets: PETS.map((pet) => ({ id: pet.id, name: pet.name, status: pet.status })),
      endpoints: [
        'GET /api/pets',
        'GET /api/versions/:id',
        'GET /api/versions/:id/preview/cover.png',
        'GET /api/versions/:id/install',
        'GET /api/me',
        'GET /api/admin/versions',
        'GET /api/admin/stats',
        'GET /api/admin/stats.csv',
        'GET /api/admin/audit',
        'GET /api/admin/queue',
        'POST /api/submissions',
        'POST /api/submissions/lookup',
        'POST /auth/*',
        'GET /downloads/*',
      ],
    },
    serverRequests: { count: 0, unique: [] },
    shots: [],
    summary: {},
  };

  let counter = 0;
  try {
    for (const theme of themes) {
      currentLabel.value = 'theme:' + theme;
      const bootstrapped = await setTheme(win, base, theme);
      if (bootstrapped && bootstrapped !== theme) {
        pageErrors.push({ label: 'theme:' + theme, level: 'warning', message: 'theme bootstrap mismatch: ' + bootstrapped });
      }

      for (const page of PAGES) {
        for (const width of WIDTHS) {
          counter += 1;
          currentLabel.value = page.name + '-' + width + (allThemes ? '-' + theme : '');
          progress('[' + counter + '/' + total + '] ' + currentLabel.value);
          let record;
          try {
            record = await shootPage(ctx, page, width, theme, counter, total);
          } catch (error) {
            record = {
              index: counter,
              total,
              label: page.name + '-' + width + (allThemes ? '-' + theme : ''),
              page: page.name,
              width,
              theme,
              kind: 'page',
              error: error.message,
              layout: null,
              shots: [],
              consoleErrors: pageErrors.slice(-10),
              failedRequests: failures.slice(-10),
            };
            console.error('  !! ' + record.label + ' failed: ' + error.message);
            progress('  !! ' + record.label + ' failed: ' + error.message);
          }
          report.shots.push(record);
          if (record.layout) logShot(record);
          await saveReport(report);

          if (page.name === 'admin' && width === 1440) {
            for (const panel of ADMIN_PANELS) {
              counter += 1;
              currentLabel.value = 'admin-' + width + '-panel-' + panel;
              progress('[' + counter + '/' + total + '] ' + currentLabel.value);
              let panelRecord;
              try {
                panelRecord = await shootAdminPanel(ctx, panel, width, theme, counter, total);
              } catch (error) {
                panelRecord = {
                  index: counter,
                  total,
                  label: 'admin-' + width + '-panel-' + panel,
                  page: 'admin',
                  width,
                  theme,
                  kind: 'panel',
                  panel,
                  error: error.message,
                  layout: null,
                  shots: [],
                  consoleErrors: pageErrors.slice(-10),
                  failedRequests: failures.slice(-10),
                };
                console.error('  !! ' + panelRecord.label + ' failed: ' + error.message);
                progress('  !! ' + panelRecord.label + ' failed: ' + error.message);
              }
              report.shots.push(panelRecord);
              if (panelRecord.layout) logShot(panelRecord);
              await saveReport(report);
            }
            // 恢复概览面板
            await win.webContents.executeJavaScript("document.querySelector('[data-admin-panel=\"overview\"]').click(); true");
            await settle(win);
          }
        }
      }
    }
  } finally {
    try {
      server.close();
      win.destroy();
    } catch {
      /* ignore */
    }
  }

  const pageRecords = report.shots.filter((item) => item.kind === 'page');
  const panelRecords = report.shots.filter((item) => item.kind === 'panel');
  const overflowItems = report.shots
    .filter((item) => item.layout && item.layout.horizontalOverflow)
    .map((item) => ({
      label: item.label,
      scrollWidth: item.layout.scrollWidth,
      clientWidth: item.layout.clientWidth,
      overflowPx: item.layout.overflowPx,
    }));
  const brokenImages = [];
  const seenBroken = new Set();
  for (const item of report.shots) {
    if (!item.layout) continue;
    for (const image of item.layout.images) {
      if (image.ok) continue;
      const key = item.label + '|' + image.src;
      if (seenBroken.has(key)) continue;
      seenBroken.add(key);
      brokenImages.push({ label: item.label, src: image.src });
    }
  }
  const truncatedFullShots = [];
  for (const item of report.shots) {
    for (const shot of item.shots) {
      if (shot.kind !== 'full' && shot.kind !== 'panel') continue;
      if (shot.truncated) truncatedFullShots.push({ file: shot.file, height: shot.height, contentHeight: shot.contentHeight });
    }
  }

  report.serverRequests = { count: requestLog.length, unique: [...new Set(requestLog)].sort() };
  report.summary = {
    shots: report.shots.length,
    pageShots: pageRecords.length,
    panelShots: panelRecords.length,
    expectedPageShots: totalPageShots,
    horizontalOverflow: overflowItems,
    consoleErrors: pageErrors,
    failedRequests: failures,
    brokenImages,
    truncatedFullShots,
    failedShots: report.shots.filter((item) => item.error).map((item) => ({ label: item.label, error: item.error })),
  };
  report.summary.status =
    pageErrors.length === 0 &&
    failures.length === 0 &&
    brokenImages.length === 0 &&
    report.summary.failedShots.length === 0 &&
    (!strict || overflowItems.length === 0)
      ? 'PASS'
      : 'FAIL';
  await saveReport(report);

  const summaryText = printSummary(report);
  await fsp.writeFile(path.join(OUT_DIR, 'summary.txt'), summaryText + '\n');

  const exitCode = report.summary.status === 'PASS' ? 0 : 1;
  app.exit(exitCode);
}

/* ------------------------------------------------------------------ */

async function run() {
  const watchdog = setTimeout(() => {
    console.error('TIMEOUT: market-layout-shots exceeded 300s');
    app.exit(2);
  }, 300000);
  watchdog.unref?.();

  try {
    await main();
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    app.exit(1);
  } finally {
    clearTimeout(watchdog);
  }
}

/* ------------------------------------------------------------------ */

if (IS_ELECTRON) {
  app.whenReady().then(run);
} else if (process.argv.includes('--serve-only')) {
  // 受限环境跑不了 Electron 时，至少可以验证「真实伺服」这一半
  selfCheck()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error && error.stack ? error.stack : String(error));
      process.exit(1);
    });
} else {
  console.error('这个脚本要用 Electron 跑：npx electron scripts/market-layout-shots.cjs [--all-themes] [--strict]');
  console.error('只想验证静态服务 / 假 API（不用 Electron）：node scripts/market-layout-shots.cjs --serve-only');
  process.exit(2);
}
