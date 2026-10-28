const PREFIX = '/board-pet';
const ACTIONS = {
  status: 'GET',
  start: 'POST',
  stop: 'POST',
  dashboard: 'POST',
  pets: 'GET',
  manage: 'POST',
};

// Route owners enforce their own policy on the DSH web server. The settings page
// calls these same-origin; a custom header forces a CORS preflight that this
// handler refuses, so other origins cannot drive the pet through a browser.
function sameOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function createControlHandler(control, { prefix = PREFIX } = {}) {
  return async function handle(req, res) {
    const json = (code, value) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    let pathname;
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      return json(400, { error: '无效的请求地址' });
    }
    const action = pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length + 1) : '';
    if (!Object.hasOwn(ACTIONS, action)) return json(404, { error: '接口不存在' });
    if (req.method !== ACTIONS[action]) return json(405, { error: '不支持的请求方法' });
    if (!sameOrigin(req)) return json(403, { error: '禁止的请求来源' });
    if (ACTIONS[action] === 'POST' && req.headers['x-board-pet'] !== '1') return json(403, { error: '缺少管理请求标记' });
    try {
      if(action==='pets')return json(200,await control.listPets());
      if(action==='manage'){
        let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>16384)return json(413,{error:'请求过大'});}
        return json(200,await control.managePets(JSON.parse(text)));
      }
      const value =
        action === 'status'
          ? await control.status()
          : action === 'start'
            ? await control.start()
            : action === 'stop'
              ? await control.stop()
              : await control.openDashboard();
      return json(200, value);
    } catch (error) {
      return json(500, { error: String(error?.message || error).slice(0, 300) });
    }
  };
}
