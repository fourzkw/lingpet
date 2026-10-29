import test from 'node:test';
import assert from 'node:assert/strict';
import { createPetControl } from '../src/pet-control.js';
import {connectionStatus} from '../src/connection-status.js';

const endpoint = { version: 1, url: 'http://127.0.0.1:4123', token: 'a'.repeat(64), pid: 991 };
const health = { version: 1, name: 'board-ai-pet', state: 'working', sessions: 2, instances: 1, release: { version: '0.1.7' } };

test('status reports a stopped pet when no endpoint is published, and start spawns once', async () => {
  let ensured = 0;
  const control = createPetControl({
    dir: 'X',
    ensure: async () => { ensured += 1; },
    readEndpoint: async () => null,
    send: async () => { throw new Error('桌宠未运行时不应当发请求'); },
    wait: { attempts: 2, delay: 0 },
    sleep: async () => {},
  });
  assert.deepEqual(await control.status(), { ok: true, running: false });
  assert.deepEqual(await control.start(), { ok: true, running: false, started: true, pending: true });
  assert.equal(ensured, 1);
});

test('start waits for the endpoint file and reports the real state', async () => {
  let reads = 0;
  const control = createPetControl({
    dir: 'X',
    ensure: async () => {},
    readEndpoint: async () => (++reads > 2 ? endpoint : null),
    send: async (_endpoint, route) => (route === '/health' ? health : { ok: true }),
    wait: { attempts: 5, delay: 0 },
    sleep: async () => {},
  });
  const started = await control.start();
  assert.equal(started.ok, true);
  assert.equal(started.running, true);
  assert.equal(started.started, true);
  assert.equal(started.pid, 991);
  assert.equal(started.state, 'working');
  assert.ok(reads >= 3);
});

test('start surfaces a failed spawn without pretending the pet runs', async () => {
  const control = createPetControl({
    dir: 'X',
    ensure: async () => { throw new Error('运行时仍在准备，请稍后重试'); },
    readEndpoint: async () => null,
    send: async () => { throw new Error('不应该发请求'); },
  });
  const result = await control.start();
  assert.equal(result.ok, false);
  assert.equal(result.running, false);
  assert.match(result.error, /运行时/);
});

test('status maps the health document and start is a no-op while the pet runs', async () => {
  const routes = [];
  let ensured = 0;
  const control = createPetControl({
    dir: 'X',
    ensure: async () => { ensured += 1; },
    readEndpoint: async () => endpoint,
    send: async (_endpoint, route) => { routes.push(route); return route === '/health' ? health : { ok: true }; },
  });
  assert.deepEqual(await control.status(), {
    ok: true, running: true, pid: 991, state: 'working', sessions: 2, instances: 1, release: '0.1.7',connection:connectionStatus({},'dsh'),
  });
  const started = await control.start();
  assert.equal(started.ok, true);
  assert.equal(started.alreadyRunning, true);
  assert.equal(started.started, false);
  assert.equal(ensured, 0);
  assert.ok(!routes.includes('/register'));
});

test('stop asks the pet to quit and reports a stopped pet as a no-op', async () => {
  const routes = [];
  const control = createPetControl({
    dir: 'X',
    ensure: async () => {},
    readEndpoint: async () => endpoint,
    send: async (_endpoint, route) => {
      routes.push(route);
      if (route === '/health') return health;
      return { ok: true };
    },
  });
  assert.deepEqual(await control.stop(), { ok: true, running: false, stopped: true });
  assert.deepEqual(routes, ['/health', '/connections', '/quit']);

  const idle = createPetControl({ dir: 'X', ensure: async () => {}, readEndpoint: async () => null, send: async () => { throw new Error('不应该发请求'); } });
  assert.deepEqual(await idle.stop(), { ok: true, running: false, stopped: false, alreadyStopped: true });
});

test('a stale endpoint file counts as stopped, other failures keep the pet running', async () => {
  const control = (error) => createPetControl({
    dir: 'X',
    ensure: async () => {},
    readEndpoint: async () => endpoint,
    send: async () => { throw error; },
  });
  const refused = Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  assert.deepEqual(await control(refused).status(), { ok: true, running: false, stale: true });
  const denied = await control(new Error('桌宠连接返回 401 / 连接凭证无效')).status();
  assert.equal(denied.running, true);
  assert.equal(denied.state, 'unknown');
  assert.match(denied.error, /401/);
});

test('openDashboard requires a running pet and forwards the command', async () => {
  const routes = [];
  const control = createPetControl({
    dir: 'X',
    ensure: async () => {},
    readEndpoint: async () => endpoint,
    send: async (_endpoint, route) => { routes.push(route); return { ok: true }; },
  });
  assert.deepEqual(await control.openDashboard(), { ok: true });
  assert.deepEqual(routes, ['/dashboard']);

  const idle = createPetControl({ dir: 'X', ensure: async () => {}, readEndpoint: async () => null, send: async () => { throw new Error('不应该发请求'); } });
  const missing = await idle.openDashboard();
  assert.equal(missing.ok, false);
  assert.match(missing.error, /未运行/);
});
