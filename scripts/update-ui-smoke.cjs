// Screenshots and assertions for the in-app update panel: red dot, release
// notes, download progress. Run with:
//   node_modules/electron/dist/electron.exe --no-sandbox scripts/update-ui-smoke.cjs
const {app, BrowserWindow, ipcMain} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
app.disableHardwareAcceleration();
const root = process.cwd();
const file = path.join(root, 'desktop', '.update-ui-smoke.html');
const out = path.join(root, 'artifacts', 'update-ui');
const notes = '本次更新\n· 修复公告卡片在深色主题下的边框颜色\n· 新增应用内下载更新，安装时自动保留配置与桌宠\n· 官网下载改为直达安装包';
const updateCheck = {available: true, version: '0.7.34', current: '0.7.33', checkedAt: Date.now(), notes, releaseURL: 'https://github.com/fourzkw/lingpet/releases/latest'};
const status = () => ({
  version: '0.7.33', login: false, loginSupported: true, distribution: 'desktop',
  storage: {path: 'C:\\Users\\demo\\AppData\\Roaming\\BoardAiPet'},
  update: {phase: 'available', message: '发现新版本 v0.7.34', version: '0.7.34', time: Date.now()},
  updateCheck, uptimeSeconds: 600, pets: [], connections: {connected: 0, total: 0, sources: []},
  memory: {rss: 64 * 1024 * 1024}, logs: [], settingsRecovery: null,
});
app.whenReady().then(async () => {
  await fs.mkdir(out, {recursive: true});
  let html = await fs.readFile(path.join(root, 'desktop/settings.html'), 'utf8');
  html = html.replace('<script type="module" src="settings.js"></script>', '');
  await fs.writeFile(file, html);
  let installCalls = 0;
  ipcMain.handle('pet:system', (_event, body) => {
    if (body.action === 'status') return status();
    if (body.action === 'check-update') return {current: '0.7.33', update: updateCheck};
    if (body.action === 'install-update') { installCalls += 1; return {installing: true, version: '0.7.34'}; }
    if (body.action === 'open-settings-folder') return {opened: true};
    if (body.action === 'generation-preferences') return {image: [{id: 'api', enabled: true}], video: [{id: 'seedance', enabled: true}]};
    if (body.action === 'generation-api-config') return {image: {url: '', model: '', hasApiKey: false}, video: {url: '', model: '', hasApiKey: false}};
    if (body.action === 'comfy-config') return {url: 'http://127.0.0.1:8188', models: {}, python: '', targetedInterrupt: false};
    throw new Error(body.action);
  });
  const win = new BrowserWindow({show: false, width: 1200, height: 950, webPreferences: {preload: path.join(root, 'desktop/preload.cjs'), contextIsolation: true, sandbox: true}});
  await win.loadFile(file);
  await win.webContents.executeJavaScript(`(async()=>{const {initSettingsExtras}=await import('./settings-extras.js');initSettingsExtras({snapshot:()=>({distribution:'desktop',settings:{},global:{theme:'paper-journal'},customAppearances:[]}),change:()=>{},toast:()=>{}});document.getElementById('openAppSettings').click();})()`);
  await win.webContents.executeJavaScript(`document.getElementById('settings-tab-maintenance').click()`);
  await new Promise(resolve => setTimeout(resolve, 300));
  const available = await win.webContents.executeJavaScript(`({
    dot: document.getElementById('openAppSettings').classList.contains('has-update'),
    tabDot: document.getElementById('settings-tab-maintenance').classList.contains('has-update'),
    bannerHidden: document.getElementById('updateBanner').hidden,
    version: document.getElementById('updateBannerVersion').textContent,
    notes: document.getElementById('updateNotes').textContent,
    button: document.getElementById('installAppUpdate').textContent,
    buttonHidden: document.getElementById('installAppUpdate').hidden,
    status: document.getElementById('appUpdateStatus').textContent,
    progressHidden: document.getElementById('updateProgress').hidden,
  })`);
  assert.equal(available.dot, true, 'settings entry should show the red dot');
  assert.equal(available.tabDot, true, 'maintenance tab should show the red dot');
  assert.equal(available.bannerHidden, false, 'release notes panel should be visible');
  assert.equal(available.version, 'v0.7.34');
  assert.ok(available.notes.includes('应用内下载更新'), 'release notes should render');
  assert.ok(available.button.includes('0.7.34'), 'install button should name the new version');
  assert.equal(available.buttonHidden, false);
  assert.equal(available.progressHidden, true, 'progress stays hidden until downloading starts');
  await fs.writeFile(path.join(out, 'maintenance-update-available-1200.png'), (await win.webContents.capturePage()).toPNG());

  win.webContents.send('pet:system-update', {...status(), phase: 'downloading', message: '正在下载安装程序 42%', version: '0.7.34', update: updateCheck, progress: {percent: 42, transferred: 90 * 1024 * 1024, total: 202 * 1024 * 1024, route: 'GitHub 直连'}});
  await new Promise(resolve => setTimeout(resolve, 250));
  const downloading = await win.webContents.executeJavaScript(`({
    progressHidden: document.getElementById('updateProgress').hidden,
    value: document.getElementById('updateProgressBar').value,
    text: document.getElementById('updateProgressText').textContent,
    status: document.getElementById('appUpdateStatus').textContent,
    installDisabled: document.getElementById('installAppUpdate').disabled,
  })`);
  assert.equal(downloading.progressHidden, false, 'progress bar should appear while downloading');
  assert.equal(downloading.value, 42);
  assert.ok(downloading.text.includes('GitHub 直连'));
  assert.ok(downloading.status.includes('42%'));
  assert.equal(downloading.installDisabled, true, 'install button locks while downloading');
  await fs.writeFile(path.join(out, 'maintenance-downloading-1200.png'), (await win.webContents.capturePage()).toPNG());

  win.webContents.send('pet:system-update', {...status(), update: updateCheck});
  await new Promise(resolve => setTimeout(resolve, 250));
  await win.webContents.executeJavaScript(`document.getElementById('installAppUpdate').click()`);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(installCalls, 1, 'install button triggers the updater once');

  win.setSize(640, 950);
  await new Promise(resolve => setTimeout(resolve, 250));
  win.webContents.send('pet:system-update', {...status(), phase: 'available', message: '发现新版本 v0.7.34', update: updateCheck});
  await new Promise(resolve => setTimeout(resolve, 350));
  const narrow = await win.webContents.executeJavaScript(`({scroll: document.documentElement.scrollWidth, width: innerWidth, dot: document.getElementById('openAppSettings').classList.contains('has-update'), banner: !document.getElementById('updateBanner').hidden})`);
  assert.ok(narrow.scroll <= narrow.width, 'narrow layout must not overflow horizontally');
  assert.equal(narrow.dot, true, 'red dot survives the narrow layout');
  assert.equal(narrow.banner, true, 'release notes stay visible when narrow');
  await fs.writeFile(path.join(out, 'maintenance-update-narrow-640.png'), (await win.webContents.capturePage()).toPNG());
  win.setSize(1200, 950);
  await new Promise(resolve => setTimeout(resolve, 250));

  win.webContents.send('pet:system-update', {...status(), phase: 'idle', message: '当前已是最新版本', update: {available: false}});
  await new Promise(resolve => setTimeout(resolve, 250));
  const current = await win.webContents.executeJavaScript(`({
    dot: document.getElementById('openAppSettings').classList.contains('has-update'),
    bannerHidden: document.getElementById('updateBanner').hidden,
    buttonHidden: document.getElementById('installAppUpdate').hidden,
    checkLabel: document.getElementById('checkAppUpdate').textContent,
  })`);
  assert.equal(current.dot, false, 'red dot clears once the update is installed');
  assert.equal(current.bannerHidden, true);
  assert.equal(current.buttonHidden, true);
  await fs.unlink(file);
  console.log('PASS: update red dot, release notes, download progress and narrow layout');
  app.exit(0);
}).catch(async error => {
  console.error(error);
  await fs.unlink(file).catch(() => {});
  app.exit(1);
});
