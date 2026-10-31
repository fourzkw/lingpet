const root = document.getElementById('downloadCards');
const status = document.getElementById('downloadStatus');
function element(tag, content) { const e = document.createElement(tag); e.textContent = content; return e; }
function megabytes(bytes) { return Math.round(bytes / 1048576) + ' MB'; }
const card = element('article', ''); card.className = 'download-card';
const icon = element('span', '↗'); icon.className = 'download-host-icon'; icon.setAttribute('aria-hidden', 'true');
const kind = element('p', 'WINDOWS · 桌面安装程序'); kind.className = 'download-kind';
const meta = element('p', 'Windows 10 / 11 · x64'); meta.className = 'download-meta'; meta.id = 'downloadMeta';
const link = element('a', '下载 Windows 版'); link.className = 'button primary'; link.href = '/downloads/desktop'; link.id = 'download-desktop';
const help = element('a', '查看安装指引'); help.className = 'install-link'; help.href = '#install';
card.append(icon, kind, element('h3', '灵伴桌面版'), meta, element('p', '安装一次，在灵伴内接入 Cursor、Codex 或 DSH。'), link, help);
root.replaceChildren(card);
root.setAttribute('aria-busy', 'false');
status.textContent = '点击下载即开始下载安装程序。';
fetch('/api/downloads', { headers: { accept: 'application/json' } }).then(function (response) {
  return response.ok ? response.json() : null;
}).then(function (value) {
  const release = value && value.desktop;
  if (!release || typeof release.version !== 'string' || !release.version) return;
  const size = Number(release.bytes);
  meta.textContent = 'v' + release.version + (Number.isFinite(size) && size > 0 ? ' · ' + megabytes(size) : '') + ' · Windows 10 / 11 · x64';
  link.textContent = '下载 Windows 版 v' + release.version;
  status.textContent = '安装包由 GitHub 直接提供，点击后立即开始下载，不会先打开 GitHub 页面。';
}).catch(function () { });
