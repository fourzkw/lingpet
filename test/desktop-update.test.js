import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {downloadInstaller,launchInstaller,pruneInstallers,verifyRelease} from '../src/update/desktop-update.js';

const PAYLOAD = Buffer.alloc(256 * 1024, 7);
const PAYLOAD_SHA = createHash('sha256').update(PAYLOAD).digest('hex');
const INSTALLER = 'LingPet-Setup-0.7.34.exe';
const ASSET = 'https://github.com/fourzkw/lingpet/releases/download/v0.7.34/' + INSTALLER;

function release(overrides = {}) {
  return {version: '0.7.34', fileName: INSTALLER, url: ASSET, bytes: PAYLOAD.length, sha256: PAYLOAD_SHA, publishedAt: '2026-10-31T07:00:00Z', notes: '## 0.7.34', ...overrides};
}

async function serve(handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  return {origin, close: () => new Promise(resolve => server.close(resolve))};
}

function directFetcher(origin, {status = 200} = {}) {
  return async (input, init) => {
    const url = String(input);
    if (!url.startsWith('https://github.com/')) throw new Error('unexpected route ' + url);
    const res = await fetch(origin + '/asset', init);
    if (status === 200) return res;
    await res.body?.cancel();
    return new Response('mirror only', {status});
  };
}

test('verifyRelease rejects incomplete release metadata', () => {
  assert.throws(() => verifyRelease(null), /缺少安装包信息/);
  assert.throws(() => verifyRelease(release({version: 'v0.1'})), /版本号/);
  assert.throws(() => verifyRelease(release({fileName: 'setup.exe'})), /文件名/);
  assert.throws(() => verifyRelease(release({url: 'https://example.com/x.exe'})), /GitHub Release/);
  assert.throws(() => verifyRelease(release({sha256: 'abc'})), /校验值/);
  assert.throws(() => verifyRelease(release({bytes: 0})), /体积/);
  assert.equal(verifyRelease(release()).version, '0.7.34');
});

test('downloadInstaller streams, hashes and stores the installer', async () => {
  const {origin, close} = await serve((req, res) => {
    res.writeHead(200, {'content-type': 'application/octet-stream', 'content-length': PAYLOAD.length});
    res.end(PAYLOAD);
  });
  const directory = path.join('artifacts', 'update-test', 'download-' + Date.now());
  const phases = [];
  try {
    const result = await downloadInstaller(release(), {directory, fetcher: directFetcher(origin), onProgress: value => phases.push(value.phase)});
    assert.equal(result.path, path.join(directory, INSTALLER));
    assert.deepEqual(await readFile(result.path), PAYLOAD);
    assert.deepEqual(await readdir(directory), [INSTALLER]);
    assert.ok(phases.includes('connecting'));
    assert.ok(phases.includes('downloading'));
    assert.ok(phases.includes('verifying'));
  } finally {
    await close();
    await rm(directory, {recursive: true, force: true});
  }
});

test('downloadInstaller rejects a corrupted payload and leaves no file', async () => {
  const {origin, close} = await serve((req, res) => {
    const corrupted = Buffer.from(PAYLOAD);
    corrupted[0] = 1;
    res.writeHead(200, {'content-length': corrupted.length});
    res.end(corrupted);
  });
  const directory = path.join('artifacts', 'update-test', 'corrupt-' + Date.now());
  try {
    await assert.rejects(downloadInstaller(release(), {directory, fetcher: directFetcher(origin)}), /校验失败|下载失败/);
    await assert.rejects(stat(path.join(directory, INSTALLER)));
    assert.deepEqual(await readdir(directory).catch(() => []), []);
  } finally {
    await close();
    await rm(directory, {recursive: true, force: true});
  }
});

test('downloadInstaller falls back to mirrors when the direct route fails', async () => {
  const {origin, close} = await serve((req, res) => {
    res.writeHead(200, {'content-length': PAYLOAD.length});
    res.end(PAYLOAD);
  });
  const directory = path.join('artifacts', 'update-test', 'fallback-' + Date.now());
  const seen = [];
  const fetcher = async (input, init) => {
    const url = String(input);
    seen.push(url);
    if (url.startsWith('https://gh-proxy.com/https://github.com/')) return fetch(origin + '/asset', init);
    const res = await fetch(origin + '/asset', init);
    await res.body?.cancel();
    return new Response('down', {status: 500});
  };
  try {
    const result = await downloadInstaller(release(), {directory, fetcher});
    assert.equal((await readFile(result.path)).length, PAYLOAD.length);
    assert.equal(seen[0].startsWith('https://github.com/'), true);
    assert.equal(seen.some(url => url.startsWith('https://gh-proxy.com/')), true);
  } finally {
    await close();
    await rm(directory, {recursive: true, force: true});
  }
});

test('downloadInstaller reports stalls instead of hanging', async () => {
  const {origin, close} = await serve((req, res) => {
    res.writeHead(200, {'content-length': PAYLOAD.length});
    res.end(PAYLOAD);
  });
  const directory = path.join('artifacts', 'update-test', 'stall-' + Date.now());
  const fetcher = async () => new Response(new ReadableStream({start() {}}), {status: 200, headers: {'content-length': String(PAYLOAD.length)}});
  try {
    await assert.rejects(downloadInstaller(release(), {directory, fetcher, stallTimeout: 120}), /下载失败/);
  } finally {
    await close();
    await rm(directory, {recursive: true, force: true});
  }
});

test('pruneInstallers removes stale installers but keeps the current one', async () => {
  const directory = path.join('artifacts', 'update-test', 'prune-' + Date.now());
  await mkdir(directory, {recursive: true});
  await writeFile(path.join(directory, INSTALLER), 'x');
  await writeFile(path.join(directory, 'LingPet-Setup-0.7.33.exe'), 'x');
  await writeFile(path.join(directory, 'LingPet-Setup-0.7.33.exe.part'), 'x');
  await writeFile(path.join(directory, 'notes.txt'), 'x');
  try {
    const removed = await pruneInstallers(directory, INSTALLER);
    assert.deepEqual(removed.sort(), ['LingPet-Setup-0.7.33.exe', 'LingPet-Setup-0.7.33.exe.part']);
    assert.deepEqual((await readdir(directory)).sort(), [INSTALLER, 'notes.txt']);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('launchInstaller starts a detached silent install that relaunches the app', () => {
  const calls = [];
  const result = launchInstaller({
    exePath: 'C:\\Temp\\LingPet-Setup-0.7.34.exe',
    installRoot: 'C:\\Users\\x\\AppData\\Local\\Programs\\LingPet',
    dataDir: 'C:\\Users\\x\\AppData\\Local\\BoardAiPet',
    spawnImpl: (command, args, options) => {
      calls.push({command, args, options});
      return {pid: 4242, unref() { calls.push({unref: true}); }};
    },
  });
  assert.equal(result.pid, 4242);
  assert.equal(calls[0].command, 'C:\\Temp\\LingPet-Setup-0.7.34.exe');
  assert.deepEqual(calls[0].args, ['--silent', '--relaunch', '--root', 'C:\\Users\\x\\AppData\\Local\\Programs\\LingPet', '--data', 'C:\\Users\\x\\AppData\\Local\\BoardAiPet']);
  assert.equal(calls[0].options.detached, true);
  assert.ok(calls.some(call => call.unref));
  assert.throws(() => launchInstaller({exePath: 'setup.exe'}), /路径无效/);
});
