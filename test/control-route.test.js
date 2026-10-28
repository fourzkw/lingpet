import test from 'node:test';
import assert from 'node:assert/strict';
import { createControlHandler } from '../src/control-route.js';

function controlStub() {
  const calls = [];
  const record = (name, value) => { calls.push(name); return value; };
  return {
    calls,
    status: async () => record('status', { ok: true, running: false }),
    start: async () => record('start', { ok: true, running: true, started: true }),
    stop: async () => record('stop', { ok: true, running: false, stopped: true }),
    openDashboard: async () => record('dashboard', { ok: true }),
  };
}

async function call(handler, request = {}) {
  const result = { status: 0, body: undefined };
  const req = { method: 'GET', url: '/board-pet/status', headers: { host: '127.0.0.1:3080' }, ...request };
  const res = {
    writeHead(code, headers) { result.status = code; result.headers = headers; },
    end(text) { result.body = text === undefined ? undefined : JSON.parse(text); },
  };
  await handler(req, res);
  return result;
}

const post = extra => ({ method: 'POST', url: '/board-pet/start', headers: { host: '127.0.0.1:3080', 'x-board-pet': '1' }, ...extra });

test('GET status answers JSON from the control object', async () => {
  const control = controlStub();
  const result = await call(createControlHandler(control));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, running: false });
  assert.equal(result.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.deepEqual(control.calls, ['status']);
});

test('POST commands require the management header and a same-origin request', async () => {
  const control = controlStub();
  const handler = createControlHandler(control);
  assert.equal((await call(handler, post({ headers: { host: '127.0.0.1:3080' } }))).status, 403);
  assert.equal((await call(handler, post({ headers: { host: '127.0.0.1:3080', 'x-board-pet': '1', origin: 'http://evil.example' } }))).status, 403);
  assert.equal((await call(handler, post({ headers: { host: '127.0.0.1:3080', 'x-board-pet': '1', origin: 'http://127.0.0.1:3080' } }))).status, 200);
  assert.deepEqual(control.calls, ['start']);
});

test('each action reaches its method and unknown or mismatched routes are refused', async () => {
  const control = controlStub();
  const handler = createControlHandler(control);
  assert.deepEqual((await call(handler, post({ url: '/board-pet/stop' }))).body, { ok: true, running: false, stopped: true });
  assert.deepEqual((await call(handler, post({ url: '/board-pet/dashboard' }))).body, { ok: true });
  assert.deepEqual(control.calls, ['stop', 'dashboard']);

  assert.equal((await call(handler, { url: '/board-pet/nope' })).status, 404);
  assert.equal((await call(handler, { url: '/board-petX/status' })).status, 404);
  assert.equal((await call(handler, post({ url: '/board-pet/status' }))).status, 405);
  assert.equal((await call(handler, { method: 'GET', url: '/board-pet/start' })).status, 405);
});

test('a failing command becomes a JSON 500 without leaking a stack', async () => {
  const handler = createControlHandler({
    status: async () => { throw new Error('桌宠连接返回 500 / 内部错误'); },
    start: async () => { throw new Error('启动失败'); },
    stop: async () => ({ ok: true }),
    openDashboard: async () => ({ ok: true }),
  });
  const result = await call(handler);
  assert.equal(result.status, 500);
  assert.equal(result.body.error, '桌宠连接返回 500 / 内部错误');
});
