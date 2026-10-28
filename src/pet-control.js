import { readEndpoint as defaultReadEndpoint, request as defaultRequest } from './bridge-client.js';

const isUnreachable = error =>
  error?.cause?.code === 'ECONNREFUSED' ||
  error?.cause?.code === 'ECONNRESET' ||
  /fetch failed|ECONNREFUSED|ECONNRESET|aborted|timeout/i.test(String(error?.message || ''));

// The host plugin owns this side of the channel: the desktop pet still rejects
// browser origins and requires its 64-hex token, so these calls stay Node-to-Node.
export function createPetControl({ dir, ensure, readEndpoint = defaultReadEndpoint, send = defaultRequest, wait = { attempts: 12, delay: 400 }, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  async function status() {
    const endpoint = await readEndpoint(dir);
    if (!endpoint) return { ok: true, running: false };
    try {
      const health = await send(endpoint, '/health');
      return {
        ok: true,
        running: true,
        pid: endpoint.pid,
        state: health.state,
        sessions: health.sessions ?? 0,
        instances: health.instances ?? 0,
        release: health.release?.version,
      };
    } catch (error) {
      // A leftover endpoint.json with a dead listener means the pet already quit.
      if (isUnreachable(error)) return { ok: true, running: false, stale: true };
      return { ok: true, running: true, pid: endpoint.pid, state: 'unknown', error: error.message };
    }
  }
  return {
    status,
    async listPets(){
      const endpoint=await readEndpoint(dir);if(!endpoint)return {ok:true,pets:[],running:false};
      try{return await send(endpoint,'/pets');}catch{return {ok:true,pets:[],running:false};}
    },
    async managePets(body){
      const endpoint=await readEndpoint(dir);if(!endpoint)return {ok:false,error:'请先启动桌宠服务'};
      return send(endpoint,'/pets/manage',body,5000);
    },
    async start() {
      const current = await status();
      if (current.running) return { ...current, ok: true, started: false, alreadyRunning: true };
      try {
        await ensure();
      } catch (error) {
        return { ok: false, running: false, started: false, error: String(error?.message || error) };
      }
      // The spawn is detached, so wait briefly for the pet's endpoint file to
      // appear and report the real state instead of an optimistic success.
      for (let attempt = 0; attempt < wait.attempts; attempt += 1) {
        if (await readEndpoint(dir)) return { ...(await status()), ok: true, started: true };
        if (attempt < wait.attempts - 1) await sleep(wait.delay);
      }
      return { ok: true, running: false, started: true, pending: true };
    },
    async stop() {
      const current = await status();
      if (!current.running) return { ok: true, running: false, stopped: false, alreadyStopped: true };
      const endpoint = await readEndpoint(dir);
      if (!endpoint) return { ok: true, running: false, stopped: false, alreadyStopped: true };
      try {
        await send(endpoint, '/quit', {}, 3000);
      } catch (error) {
        return { ok: false, running: true, stopped: false, error: error.message };
      }
      return { ok: true, running: false, stopped: true };
    },
    async openDashboard(petId) {
      const endpoint = await readEndpoint(dir);
      if (!endpoint) return { ok: false, error: '桌宠未运行，请先启动桌宠。' };
      try {
        await send(endpoint, '/dashboard', petId?{petId}:{}, 3000);
      } catch (error) {
        return { ok: false, error: error.message };
      }
      return { ok: true };
    },
  };
}
