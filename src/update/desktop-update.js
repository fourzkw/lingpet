import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {open,mkdir,readdir,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {DOWNLOAD_ROUTES,downloadURL,githubDownloadURL} from '../market/service.js';

const MAX_INSTALLER = 512 * 1024 * 1024;
const CONNECT_TIMEOUT = 20000;
const STALL_TIMEOUT = 30000;
const REDIRECT_LIMIT = 6;

function describe(error) {
  const code = error?.cause?.code;
  return [error?.message || String(error), code].filter(Boolean).join('（') + (code ? '）' : '');
}

/** Validates what the market reported before anything is written to disk. */
export function verifyRelease(release) {
  if (!release || typeof release !== 'object' || Array.isArray(release)) throw new Error('缺少安装包信息');
  const version = String(release.version ?? '').trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('无效的桌面版版本号');
  const fileName = String(release.fileName ?? '').trim();
  if (!/^LingPet-Setup-[0-9A-Za-z._-]+\.exe$/.test(fileName)) throw new Error('无效的安装程序文件名');
  const url = githubDownloadURL(String(release.url ?? '')).href;
  const sha256 = String(release.sha256 ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('无效的安装包校验值');
  const bytes = Number(release.bytes);
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_INSTALLER) throw new Error('无效的安装包体积');
  return {version, fileName, url, sha256, bytes, publishedAt: String(release.publishedAt ?? ''), notes: String(release.notes ?? '')};
}

async function receive(res, target, {sha256, bytes, onProgress, signal, stallTimeout = STALL_TIMEOUT}) {
  const handle = await open(target, 'w');
  const hash = createHash('sha256');
  let transferred = 0;
  let reported = 0;
  let stalled = false;
  const reader = res.body.getReader();
  let stallTimer = setTimeout(() => {
    stalled = true;
    reader.cancel(new Error('下载停滞超过 30 秒')).catch(() => {});
  }, stallTimeout);
  try {
    for (;;) {
      if (signal?.aborted) throw new Error('下载已取消');
      const {done, value} = await reader.read();
      if (done) break;
      transferred += value.length;
      if (transferred > bytes) throw new Error('安装包体积超出发布信息');
      hash.update(value);
      await handle.write(value);
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalled = true;
        reader.cancel(new Error('下载停滞超过 30 秒')).catch(() => {});
      }, stallTimeout);
      const now = Date.now();
      if (now - reported >= 200) {
        reported = now;
        onProgress?.({phase: 'downloading', transferred, total: bytes});
      }
    }
  } finally {
    clearTimeout(stallTimer);
    await reader.cancel().catch(() => {});
    await handle.close();
  }
  if (stalled) throw new Error('下载停滞超过 30 秒，请检查网络后重试');
  onProgress?.({phase: 'downloading', transferred, total: bytes});
  if (transferred !== bytes) throw new Error(`安装包体积与发布信息不一致（${transferred}/${bytes}）`);
  if (hash.digest('hex') !== sha256) throw new Error('安装包校验失败');
  return transferred;
}

async function downloadRoute({url, route, fetcher, sha256, bytes, partial, onProgress, signal, stallTimeout}) {
  let target = new URL(route.prefix + url);
  for (let hop = 0; hop < REDIRECT_LIMIT; hop++) {
    if (signal?.aborted) throw new Error('下载已取消');
    const connection = new AbortController();
    const timer = setTimeout(() => connection.abort(new Error('连接超时（20秒）')), CONNECT_TIMEOUT);
    let res;
    try {
      res = await fetcher(target, {redirect: 'manual', signal: signal ? AbortSignal.any([signal, connection.signal]) : connection.signal});
    } finally {
      clearTimeout(timer);
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await res.body?.cancel();
      const location = res.headers.get('location');
      if (!location) throw new Error('下载重定向缺少地址');
      target = downloadURL(new URL(location, target).href, route);
      continue;
    }
    if (res.status !== 200) {
      await res.body?.cancel();
      throw new Error('GitHub 下载失败（HTTP ' + res.status + '）');
    }
    const length = Number(res.headers.get('content-length'));
    if (Number.isSafeInteger(length) && length > 0 && length !== bytes) throw new Error('安装包体积与发布信息不一致');
    onProgress?.({phase: 'downloading', transferred: 0, total: bytes});
    return receive(res, partial, {sha256, bytes, signal, stallTimeout, onProgress: value => onProgress?.({...value, route: route.name})});
  }
  throw new Error('下载重定向过多');
}

/**
 * Downloads the installer to `directory` while hashing it, trying the direct
 * GitHub route first and the mirrors only when the direct one fails.
 */
export async function downloadInstaller(release, {directory, fetcher = fetch, onProgress, signal, stallTimeout} = {}) {
  const wanted = verifyRelease(release);
  if (!directory) throw new Error('缺少下载目录');
  const target = path.join(directory, wanted.fileName);
  const partial = target + '.part';
  await mkdir(directory, {recursive: true});
  await rm(partial, {force: true});
  const failures = [];
  for (const route of DOWNLOAD_ROUTES) {
    if (signal?.aborted) throw new Error('下载已取消');
    onProgress?.({phase: 'connecting', route: route.name, transferred: 0, total: wanted.bytes});
    try {
      const bytes = await downloadRoute({url: wanted.url, route, fetcher, sha256: wanted.sha256, bytes: wanted.bytes, partial, onProgress, signal, stallTimeout});
      onProgress?.({phase: 'verifying', route: route.name, transferred: bytes, total: bytes});
      await rename(partial, target);
      return {...wanted, path: target, receivedAt: new Date().toISOString()};
    } catch (error) {
      await rm(partial, {force: true}).catch(() => {});
      if (signal?.aborted) throw new Error('下载已取消');
      failures.push(route.name + '：' + describe(error));
    }
  }
  throw new Error('安装包下载失败，所有线路均不可用。' + failures.join('；'));
}

/** Removes previously downloaded installers so the data directory stays small. */
export async function pruneInstallers(directory, keepName) {
  let entries;
  try {
    entries = await readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const removed = [];
  for (const name of entries) {
    if (!/^LingPet-Setup-[0-9A-Za-z._-]+\.exe(?:\.part)?$/.test(name)) continue;
    if (name === keepName) continue;
    await rm(path.join(directory, name), {force: true});
    removed.push(name);
  }
  return removed;
}

/**
 * Runs the installer with --relaunch so the app comes back automatically after
 * a silent upgrade. The caller is expected to quit right after this returns.
 */
export function launchInstaller({exePath, installRoot, dataDir, spawnImpl = spawn}) {
  if (!path.isAbsolute(String(exePath ?? '')) || path.extname(exePath).toLowerCase() !== '.exe') throw new Error('安装程序路径无效');
  const args = ['--silent', '--relaunch'];
  if (installRoot) args.push('--root', installRoot);
  if (dataDir) args.push('--data', dataDir);
  const child = spawnImpl(exePath, args, {detached: true, stdio: 'ignore', windowsHide: true, cwd: path.dirname(exePath)});
  child.unref();
  return {pid: child.pid ?? null};
}
